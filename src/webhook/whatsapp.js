// src/webhook/whatsapp.js
const express = require("express");
const router = express.Router();
const NodeCache = require("node-cache");
const { procesarMensaje } = require("../agent/agente");
const logger = require("../utils/logger");
const fs = require("fs");
const path = require("path");

const conversaciones = new NodeCache({ stdTTL: 86400 });
const PEDIDOS_FILE = path.join(__dirname, "../../data/pedidos.json");
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

router.post("/webhook", async (req, res) => {
  res.set("Content-Type", "text/xml").send("<Response></Response>");
  try {
    const telefono = req.body.From;
    const mensaje  = req.body.Body;
    if (!telefono || !mensaje) return;
    logger.info(`Mensaje de ${telefono}: ${mensaje.substring(0, 80)}`);

    const historial = conversaciones.get(telefono) || [];
    const resultado = await procesarMensaje(historial, mensaje);
    conversaciones.set(telefono, resultado.historialActualizado);

    if (resultado.accion) await ejecutarAccion(resultado.accion, resultado.datos, telefono);
    await enviarMensaje(telefono, resultado.texto);
  } catch (error) {
    logger.error("Error webhook: " + error.message);
  }
});

router.get("/webhook", (req, res) => res.send("Webhook activo"));

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
      };
      pedidos.push(pedido);
      guardarArchivo(PEDIDOS_FILE, pedidos);
      logger.info(`Pedido guardado: ${pedido.id}`);
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
      logger.info(`Reservación guardada: ${reservacion.id}`);
    } else if (accion === "ESCALAR_HUMANO") {
      logger.warn(`ESCALACIÓN para ${telefono}: ${datos.motivo}`);
    }
  } catch (error) {
    logger.error(`Error ejecutando acción ${accion}: ` + error.message);
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
    logger.info(`Respuesta enviada a ${telefono}`);
  } catch (error) {
    logger.error(`Error enviando a ${telefono}: ` + error.message);
  }
}

module.exports = router;
