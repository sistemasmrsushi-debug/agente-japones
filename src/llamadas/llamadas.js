// src/llamadas/llamadas.js — con OpenAI Whisper para transcripcion
const express = require("express");
const router = express.Router();
const https = require("https");
const { procesarMensaje, detectarSucursalPorZona, buscarPlatillo } = require("../agent/agente");
const logger = require("../utils/logger");
const db = require("../db/database");

function getTwilio() { return require("twilio"); }
function getTwilioClient() {
  return require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

function limpiar(texto) {
  return texto
    .replace(/[*_~`#]/g, "")
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\n+/g, ". ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 500);
}

// Transcribir audio con OpenAI Whisper
async function transcribirAudio(audioUrl) {
  try {
    // Descargar el audio de Twilio
    const audioBuffer = await new Promise((resolve, reject) => {
      const url = new URL(audioUrl);
      const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
      https.get({
        hostname: url.hostname,
        path: url.pathname,
        headers: { "Authorization": `Basic ${auth}` }
      }, (res) => {
        const chunks = [];
        res.on("data", chunk => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      }).on("error", reject);
    });

    // Enviar a Whisper via OpenAI
    const FormData = require("form-data");
    const form = new FormData();
    form.append("file", audioBuffer, { filename: "audio.wav", contentType: "audio/wav" });
    form.append("model", "whisper-1");
    form.append("language", "es");

    const respuesta = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: "api.openai.com",
        path: "/v1/audio/transcriptions",
        method: "POST",
        headers: {
          ...form.getHeaders(),
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        }
      }, (res) => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
          try { resolve(JSON.parse(data)); }
          catch(e) { reject(e); }
        });
      });
      req.on("error", reject);
      form.pipe(req);
    });

    logger.info(`Whisper transcribio: "${respuesta.text}"`);
    return respuesta.text || "";
  } catch(error) {
    logger.error("Error Whisper: " + error.message);
    return "";
  }
}

function crearGather(twiml) {
  return twiml.gather({
    input: "speech",
    action: `${process.env.BASE_URL}/llamada/respuesta`,
    method: "POST",
    language: "es-MX",
    speechTimeout: "2",
    speechModel: "phone_call",
    timeout: 8,
  });
}

// Guardar estado de llamada en DB
async function guardarEstadoLlamada(telefono, estado) {
  await db.guardarEstadoPedido(telefono + "_llamada", estado);
}

async function obtenerEstadoLlamada(telefono) {
  return await db.obtenerEstadoPedido(telefono + "_llamada");
}

async function eliminarEstadoLlamada(telefono) {
  await db.eliminarEstadoPedido(telefono + "_llamada");
}

function responder(res, twiml) {
  res.type("text/xml").send(twiml.toString());
}

router.post("/llamada/entrante", async (req, res) => {
  const telefono = req.body.From || "desconocido";
  logger.info(`Llamada entrante: ${telefono}`);
  // Limpiar estado anterior al iniciar nueva llamada
  await eliminarEstadoLlamada(telefono);
  await db.guardarHistorial(telefono + "_llamada", []);
  const twilio = getTwilio();
  const twiml = new twilio.twiml.VoiceResponse();
  const gather = crearGather(twiml);
  gather.say({ language: "es-MX", voice: "Polly.Mia" },
    "Bienvenido a Mr. Sushi. Puedo ayudarte con pedidos, reservaciones o informacion. En que te puedo ayudar?"
  );
  twiml.say({ language: "es-MX", voice: "Polly.Mia" }, "No escuche nada. Hasta luego.");
  twiml.hangup();
  responder(res, twiml);
});

router.post("/llamada/respuesta", async (req, res) => {
  const telefono = req.body.From || "desconocido";
  const twilio = getTwilio();
  const twiml = new twilio.twiml.VoiceResponse();

  // Obtener transcripcion — primero intentar Whisper, fallback a Twilio speech
  let textoCliente = req.body.SpeechResult || "";
  const recordingUrl = req.body.RecordingUrl;

  if (recordingUrl) {
    const transcripcion = await transcribirAudio(recordingUrl);
    if (transcripcion) textoCliente = transcripcion;
  }

  logger.info(`[${telefono}] Transcripcion: "${textoCliente}"`);

  if (!textoCliente.trim()) {
    const g = crearGather(twiml);
    g.say({ language: "es-MX", voice: "Polly.Mia" }, "No te escuche. Me puedes repetir?");
    return responder(res, twiml);
  }

  try {
    const estado = await obtenerEstadoLlamada(telefono);
    logger.info(`[${telefono}] Estado actual: ${estado ? JSON.stringify(estado.fase) : "null"}`);
    const tieneDireccion = /\b(calle|avenida|av[. ]|col[. ]|colonia|blvd|calzada|\d{5})\b/i.test(textoCliente);
    const zona = tieneDireccion ? detectarSucursalPorZona(textoCliente) : null;

    // Estado: esperando direccion
    if (estado?.fase === "esperando_direccion" && tieneDireccion) {
      const sucursal = zona || "la mas cercana";
      await guardarEstadoLlamada(telefono, {
        ...estado,
        fase: "esperando_confirmacion_sucursal",
        sucursal_sugerida: zona || "Por confirmar",
        direccion: textoCliente,
      });
      const g = crearGather(twiml);
      g.say({ language: "es-MX", voice: "Polly.Mia" },
        `La sucursal mas cercana a tu zona es ${sucursal}. Confirmamos el envio desde ahi?`
      );
      return responder(res, twiml);
    }

    // Estado: esperando confirmacion de sucursal
    if (estado?.fase === "esperando_confirmacion_sucursal") {
      const esDespedida = /\b(gracias|adios|bye|hasta luego|de nada|muchas gracias)\b/i.test(textoCliente);
      const confirmacion = !esDespedida && /\b(si|ok|dale|claro|adelante|confirma|va|correcto|esa|desde ahi)\b/i.test(textoCliente);
      if (confirmacion) {
        const items = estado.items || [];
        const pedido = {
          id: `PED-${Date.now()}`,
          fecha: new Date().toISOString(),
          estado: "pendiente",
          telefono_cliente: telefono,
          sucursal: estado.sucursal_sugerida,
          items,
          tipo: "domicilio",
          direccion: estado.direccion || null,
          colonia: null,
          referencias: null,
          ubicacion_gps: null,
        };
        await db.guardarPedido(pedido);
        await eliminarEstadoLlamada(telefono);
        await db.guardarHistorial(telefono, []);
        logger.info(`Pedido de llamada: ${pedido.id}`);

        const total = items.reduce((s, i) => s + (i.precio * (i.cantidad || 1)), 0);
        const itemsTexto = items.length > 0
          ? items.map(i => `${i.cantidad || 1} ${i.nombre}`).join(", ")
          : "tu pedido";

        const g = crearGather(twiml);
        g.say({ language: "es-MX", voice: "Polly.Mia" },
          `Perfecto. Pedido registrado. ${itemsTexto}. Total ${total} pesos. Llegara desde ${estado.sucursal_sugerida} en 40 minutos. Hay algo mas en que te pueda ayudar?`
        );
        twiml.say({ language: "es-MX", voice: "Polly.Mia" }, "Gracias por llamar a Mr. Sushi. Hasta pronto.");
        twiml.hangup();
        return responder(res, twiml);
      }
    }

    // Flujo normal con GPT
    const historial = await db.obtenerHistorial(telefono + "_llamada") || [];
    const mensajeConContexto = `[LLAMADA DE VOZ - responde MUY BREVE, sin ingredientes, maximo 2 oraciones] ${textoCliente}`;
    const resultado = await procesarMensaje(historial, mensajeConContexto);
    await db.guardarHistorial(telefono + "_llamada", resultado.historialActualizado);

    const textoBajo = resultado.texto.toLowerCase();

    // Guardar estado si agente pide direccion
    if (/direcci[oó]n|colonia|domicilio/.test(textoBajo) && !estado) {
      const items = (resultado.datos?.pedido?.items || []).map(i => {
        const real = buscarPlatillo(i.nombre);
        return real ? { nombre: real.nombre, precio: real.precio, cantidad: i.cantidad || 1 } : i;
      });
      await guardarEstadoLlamada(telefono, { fase: "esperando_direccion", items });
      logger.info(`Estado llamada: esperando_direccion`);
    }

    // Guardar estado si agente sugiere sucursal
    if (/sucursal m[aá]s cercana|enviamos desde/i.test(textoBajo) && !estado) {
      const sucursalEnTexto = require("../../config/restaurante").sucursales
        .find(s => textoBajo.includes(s.nombre.toLowerCase()));
      if (sucursalEnTexto) {
        const items = resultado.datos?.pedido?.items || [];
        await guardarEstadoLlamada(telefono, {
          fase: "esperando_confirmacion_sucursal",
          items,
          sucursal_sugerida: sucursalEnTexto.nombre,
          direccion: null,
        });
      }
    }

    const textoVoz = limpiar(resultado.texto);
    const g = crearGather(twiml);
    g.say({ language: "es-MX", voice: "Polly.Mia" }, textoVoz);
    twiml.say({ language: "es-MX", voice: "Polly.Mia" }, "Gracias por llamar a Mr. Sushi. Hasta pronto.");
    twiml.hangup();
    responder(res, twiml);

  } catch(error) {
    logger.error("Error llamada: " + error.message);
    const twimlErr = new getTwilio().twiml.VoiceResponse();
    twimlErr.say({ language: "es-MX", voice: "Polly.Mia" },
      "Tuvimos un problema. Por favor llama de nuevo."
    );
    twimlErr.hangup();
    responder(res, twimlErr);
  }
});

module.exports = router;
