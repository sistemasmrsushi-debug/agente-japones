// src/llamadas/llamadas.js
const express = require("express");
const router = express.Router();
const NodeCache = require("node-cache");
const { procesarMensaje, detectarSucursalPorZona } = require("../agent/agente");
const logger = require("../utils/logger");
const db = require("../db/database");

const conversaciones = new NodeCache({ stdTTL: 3600 });
const estadosLlamada = new NodeCache({ stdTTL: 3600 });

function getTwilio() { return require("twilio"); }

function limpiar(texto) {
  return texto
    .replace(/[*_~`#]/g, "")
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/✅|❌|⏳|🔔|📞|💬|🍣|🎌|🚚|📍|📝|👤|📅|👥|🎉/g, "")
    .replace(/https?:\/\/\S+/g, "") // quitar URLs en llamadas
    .replace(/\n+/g, ". ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 500);
}

function ssml(texto) {
  return `<speak><prosody rate="medium" pitch="0%">${limpiar(texto)}</prosody></speak>`;
}

function crearGather(twiml, accion = "/llamada/respuesta") {
  return twiml.gather({
    input: "speech",
    action: `${process.env.BASE_URL}${accion}`,
    method: "POST",
    language: "es-MX",
    speechTimeout: "1",        // reducido de 3 a 1 segundo
    speechModel: "phone_call",
    timeout: 8,
  });
}

function responder(res, twiml) {
  res.type("text/xml").send(twiml.toString());
}

router.post("/llamada/entrante", (req, res) => {
  const telefono = req.body.From || "desconocido";
  logger.info(`Llamada entrante: ${telefono}`);
  conversaciones.del(telefono);
  estadosLlamada.del(telefono);
  const twilio = getTwilio();
  const twiml = new twilio.twiml.VoiceResponse();
  const gather = crearGather(twiml);
  gather.say({ language:"es-MX", voice:"Polly.Mia" },
    ssml("Bienvenido a Mr. Sushi. Puedo ayudarte con pedidos, reservaciones o información. ¿En qué te puedo ayudar?")
  );
  twiml.say({ language:"es-MX", voice:"Polly.Mia" }, ssml("No escuché nada. Hasta luego."));
  twiml.hangup();
  responder(res, twiml);
});

router.post("/llamada/respuesta", async (req, res) => {
  const telefono = req.body.From || "desconocido";
  const textoCliente = req.body.SpeechResult || "";
  logger.info(`[${telefono}] Cliente dijo: "${textoCliente}"`);
  const twilio = getTwilio();
  const twiml = new twilio.twiml.VoiceResponse();

  if (!textoCliente.trim()) {
    const g = crearGather(twiml);
    g.say({ language:"es-MX", voice:"Polly.Mia" }, ssml("No te escuche. Me puedes repetir?"));
    return responder(res, twiml);
  }

  try {
    // Verificar si hay estado de pedido esperando confirmacion de sucursal
    const estado = estadosLlamada.get(telefono);

    // Detectar si el cliente da una direccion
    const tieneDireccion = /\b(calle|avenida|av[. ]|col[. ]|colonia|blvd|calzada|\d{5})\b/i.test(textoCliente);
    const zona = tieneDireccion ? detectarSucursalPorZona(textoCliente) : null;

    if (estado?.fase === "esperando_direccion" && tieneDireccion && zona) {
      // Tenemos la direccion — asignar sucursal y confirmar pedido
      estadosLlamada.set(telefono, {
        ...estado,
        fase: "esperando_confirmacion_sucursal",
        sucursal_sugerida: zona,
        direccion: textoCliente,
      });
      const g = crearGather(twiml);
      g.say({ language:"es-MX", voice:"Polly.Mia" },
        ssml(`La sucursal más cercana es ${zona}. ¿Confirmamos el envío desde ahí?`)
      );
      return responder(res, twiml);
    }

    if (estado?.fase === "esperando_confirmacion_sucursal") {
      const confirmacion = /\b(si|sí|ok|dale|claro|adelante|confirma|va)\b/i.test(textoCliente);
      if (confirmacion) {
        // Registrar pedido
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
        estadosLlamada.del(telefono);
        conversaciones.del(telefono);
        logger.info(`Pedido de llamada registrado: ${pedido.id}`);

        const total = items.reduce((s, i) => s + (i.precio * (i.cantidad || 1)), 0);
        const itemsTexto = items.map(i => `${i.cantidad || 1} ${i.nombre}`).join(", ");
        const g = crearGather(twiml);
        g.say({ language:"es-MX", voice:"Polly.Mia" },
          ssml(`Perfecto. Tu pedido ha sido registrado. ${itemsTexto}. Total ${total} pesos. Llegará desde ${estado.sucursal_sugerida} en aproximadamente 40 minutos. ¿Hay algo más en que te pueda ayudar?`)
        );
        twiml.say({ language:"es-MX", voice:"Polly.Mia" }, ssml("Gracias por llamar a Mr. Sushi. Hasta pronto."));
        twiml.hangup();
        return responder(res, twiml);
      }
    }

    // Flujo normal con IA
    const historial = conversaciones.get(telefono) || [];

    // Prompt especial para llamadas: sin ingredientes, respuestas cortas
    const mensajeConContexto = `[LLAMADA DE VOZ - responde MUY BREVE, sin ingredientes ni descripciones largas, maximo 2 oraciones por respuesta] ${textoCliente}`;

    const resultado = await procesarMensaje(historial, mensajeConContexto);
    conversaciones.set(telefono, resultado.historialActualizado);

    // Si el agente pide direccion, guardar estado con los items (aunque esten vacios)
    const textoBajo = resultado.texto.toLowerCase();
    if (/direcci[oó]n|colonia|domicilio/.test(textoBajo) && !estado) {
      const items = resultado.datos?.pedido?.items || [];
      estadosLlamada.set(telefono, {
        fase: "esperando_direccion",
        items,
      });
      logger.info(`Estado llamada guardado: esperando_direccion, items: ${items.length}`);
    }

    // Si el agente sugiere sucursal, guardar estado
    if (/sucursal m[aá]s cercana|enviamos desde/i.test(textoBajo) && !estado) {
      const items = resultado.datos?.pedido?.items || [];
      const sucursalEnTexto = require("../../config/restaurante").sucursales
        .find(s => textoBajo.includes(s.nombre.toLowerCase()));
      if (sucursalEnTexto) {
        estadosLlamada.set(telefono, {
          fase: "esperando_confirmacion_sucursal",
          items,
          sucursal_sugerida: sucursalEnTexto.nombre,
          direccion: null,
        });
      }
    }

    const textoVoz = limpiar(resultado.texto);
    const g = crearGather(twiml);
    g.say({ language:"es-MX", voice:"Polly.Mia" },
      `<speak><prosody rate="medium" pitch="0%">${textoVoz}</prosody></speak>`
    );
    twiml.say({ language:"es-MX", voice:"Polly.Mia" }, ssml("Gracias por llamar a Mr. Sushi. Hasta pronto."));
    twiml.hangup();
    responder(res, twiml);

  } catch (error) {
    logger.error("Error llamada: " + error.message);
    const twimlErr = new getTwilio().twiml.VoiceResponse();
    twimlErr.say({ language:"es-MX", voice:"Polly.Mia" },
      ssml("Tuvimos un problema. Por favor llama de nuevo en un momento.")
    );
    twimlErr.hangup();
    responder(res, twimlErr);
  }
});

module.exports = router;
