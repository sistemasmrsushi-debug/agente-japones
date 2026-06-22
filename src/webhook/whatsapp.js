// src/webhook/whatsapp.js
const express = require("express");
const router = express.Router();
const NodeCache = require("node-cache");
const { procesarMensaje } = require("../agent/agente");
const logger = require("../utils/logger");
const fs = require("fs");
const path = require("path");

const conversaciones  = new NodeCache({ stdTTL: 86400 });
const estadosPedido   = new NodeCache({ stdTTL: 3600 }); // estado activo del pedido en curso
const PEDIDOS_FILE       = path.join(__dirname, "../../data/pedidos.json");
const RESERVACIONES_FILE = path.join(__dirname, "../../data/reservaciones.json");

function getTwilioClient() {
  return require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

function leerArchivo(ruta) {
  if (!fs.existsSync(ruta)) return [];
  try { return JSON.parse(fs.readFileSync(ruta, "utf8")); } catch { return []; }
}

function guardarArchivo(ruta, datos) {
  const dir = path.dirname(ruta);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(ruta, JSON.stringify(datos, null, 2));
}

// ── Detectar confirmacion corta del cliente ───────────────────────────────
function esConfirmacion(texto) {
  const t = texto.toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const frases = ["si","ahi","esa","ok","dale","listo","adelante","perfecto",
    "ahi esta bien","esa esta bien","de ahi","me parece bien","claro","va",
    "por favor","esta bien","ahi por favor","de esa","bueno","sale","andale"];
  return frases.some(f => t === f || t.startsWith(f + " ") || t.endsWith(" " + f));
}

router.post("/webhook", async (req, res) => {
  res.set("Content-Type", "text/xml").send("<Response></Response>");
  try {
    const telefono = req.body.From;
    if (!telefono) return;

    // ── Ubicacion GPS ─────────────────────────────────────────────────────
    const latitude  = req.body.Latitude;
    const longitude = req.body.Longitude;
    if (latitude && longitude) {
      logger.info(`GPS recibido de ${telefono}: ${latitude}, ${longitude}`);
      const mapsUrl = `https://maps.google.com/?q=${latitude},${longitude}`;
      const pedidos = leerArchivo(PEDIDOS_FILE);
      const idx = pedidos.map((p, i) => ({ p, i })).reverse()
        .find(({ p }) => p.telefono_cliente === telefono && p.tipo === "domicilio");
      if (idx) {
        pedidos[idx.i].ubicacion_gps = { latitude, longitude, maps_url: mapsUrl };
        pedidos[idx.i].actualizado = new Date().toISOString();
        guardarArchivo(PEDIDOS_FILE, pedidos);
      }
      await enviarMensaje(telefono, "Ubicacion recibida! Ya la guardamos para la entrega.");
      return;
    }

    // ── Mensaje de texto ──────────────────────────────────────────────────
    const mensaje = req.body.Body;
    if (!mensaje) return;
    logger.info(`Msg de ${telefono}: ${mensaje.substring(0, 80)}`);

    // ── Interceptar confirmacion de sucursal ──────────────────────────────
    // Si hay un pedido en curso esperando confirmacion de sucursal
    // y el cliente manda una confirmacion corta -> registrar sin llamar a Groq
    const estado = estadosPedido.get(telefono);
    if (estado && estado.fase === "esperando_confirmacion_sucursal" && esConfirmacion(mensaje)) {
      logger.info(`Confirmacion directa de sucursal para ${telefono}: ${estado.sucursal_sugerida}`);
      await registrarPedidoFinal(telefono, estado);
      estadosPedido.del(telefono);
      const total = estado.items.reduce((s, i) => s + (i.precio * (i.cantidad || 1)), 0);
      const itemsTexto = estado.items.map(i => `${i.cantidad || 1}x ${i.nombre} ($${i.precio})`).join(", ");
      await enviarMensaje(telefono,
        `Perfecto! Tu pedido ha sido registrado:\n${itemsTexto}\nTotal: $${total}\nEnvio desde: ${estado.sucursal_sugerida}\nDireccion: ${estado.direccion}\n\nTiempo estimado: 40 minutos. Envio GRATIS!`
      );
      setTimeout(async () => {
        await enviarMensaje(telefono,
          "Una cosa mas: para asegurarnos de llegar exactamente a tu puerta, podrias compartir tu ubicacion por WhatsApp? Solo toca el clip -> Ubicacion -> Enviar mi ubicacion actual. Es opcional."
        );
      }, 3000);
      return;
    }

    // ── Flujo normal con Groq ─────────────────────────────────────────────
    const historial = conversaciones.get(telefono) || [];
    const resultado = await procesarMensaje(historial, mensaje);
    conversaciones.set(telefono, resultado.historialActualizado);

    // Si el agente sugiere una sucursal para domicilio, guardar estado
    if (resultado.sucursalSugerida && resultado.itemsPedido) {
      estadosPedido.set(telefono, {
        fase: "esperando_confirmacion_sucursal",
        sucursal_sugerida: resultado.sucursalSugerida,
        items: resultado.itemsPedido,
        direccion: resultado.direccionCliente,
        colonia: resultado.coloniaCliente,
        referencias: resultado.referenciasCliente,
      });
    }

    // Enviar respuesta primero
    await enviarMensaje(telefono, resultado.texto);

    // Luego ejecutar accion si la hay
    if (resultado.accion) {
      await ejecutarAccion(resultado.accion, resultado.datos, telefono);
      // Si se registro un pedido, limpiar estado
      if (resultado.accion === "REGISTRAR_PEDIDO") {
        estadosPedido.del(telefono);
      }
    }

  } catch (error) {
    logger.error("Error webhook: " + error.message);
  }
});

router.get("/webhook", (req, res) => res.send("Webhook activo"));

async function registrarPedidoFinal(telefono, estado) {
  const pedidos = leerArchivo(PEDIDOS_FILE);
  const pedido = {
    id: `PED-${Date.now()}`,
    fecha: new Date().toISOString(),
    estado: "pendiente",
    telefono_cliente: telefono,
    sucursal: estado.sucursal_sugerida,
    items: estado.items,
    tipo: "domicilio",
    direccion: estado.direccion || null,
    colonia: estado.colonia || null,
    referencias: estado.referencias || null,
    ubicacion_gps: null,
  };
  pedidos.push(pedido);
  guardarArchivo(PEDIDOS_FILE, pedidos);
  logger.info(`Pedido directo registrado: ${pedido.id} -> ${pedido.sucursal}`);
}

async function ejecutarAccion(accion, datos, telefono) {
  try {
    if (accion === "REGISTRAR_PEDIDO") {
      const pedidos = leerArchivo(PEDIDOS_FILE);
      const pedido = {
        id: `PED-${Date.now()}`,
        fecha: new Date().toISOString(),
        estado: "pendiente",
        telefono_cliente: telefono,
        sucursal: datos.pedido?.sucursal || "Por confirmar",
        items: datos.pedido?.items || [],
        tipo: datos.pedido?.tipo || "sucursal",
        direccion: datos.pedido?.direccion || null,
        colonia: datos.pedido?.colonia || null,
        referencias: datos.pedido?.referencias || null,
        ubicacion_gps: null,
      };
      pedidos.push(pedido);
      guardarArchivo(PEDIDOS_FILE, pedidos);
      logger.info(`Pedido registrado: ${pedido.id} -> ${pedido.sucursal}`);
      if (pedido.tipo === "domicilio") {
        setTimeout(async () => {
          await enviarMensaje(telefono,
            "Una cosa mas: podrias compartir tu ubicacion por WhatsApp? Solo toca el clip -> Ubicacion -> Enviar mi ubicacion actual. Es opcional pero ayuda mucho."
          );
        }, 3000);
      }

    } else if (accion === "REGISTRAR_RESERVACION") {
      const reservaciones = leerArchivo(RESERVACIONES_FILE);
      const reservacion = {
        id: `RES-${Date.now()}`,
        fecha_registro: new Date().toISOString(),
        estado: "confirmada",
        telefono_cliente: telefono,
        ...datos.reservacion,
      };
      reservaciones.push(reservacion);
      guardarArchivo(RESERVACIONES_FILE, reservaciones);
      logger.info(`Reservacion guardada: ${reservacion.id}`);

    } else if (accion === "ESCALAR_HUMANO") {
      logger.warn(`ESCALACION para ${telefono}: ${datos.motivo}`);
    }
  } catch (error) {
    logger.error(`Error accion ${accion}: ` + error.message);
  }
}

async function enviarMensaje(telefono, texto) {
  try {
    const client = getTwilioClient();
    await client.messages.create({
      from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
      to: telefono,
      body: texto,
    });
    logger.info(`Enviado a ${telefono}`);
  } catch (error) {
    logger.error(`Error enviando: ` + error.message);
  }
}

module.exports = router;
