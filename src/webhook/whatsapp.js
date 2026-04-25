// src/webhook/whatsapp.js
// =============================================
// WEBHOOK DE WHATSAPP — Twilio
// =============================================

const express = require("express");
const router = express.Router();
const NodeCache = require("node-cache");
const { procesarMensaje } = require("../agent/agente");
const { registrarPedido, registrarReservacion } = require("../integrations/sistema-pedidos");
const logger = require("../utils/logger");

const conversaciones = new NodeCache({ stdTTL: 86400 });

function getTwilioClient() {
  return require("twilio")(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
}

// -----------------------------------------------
// RECEPCIÓN DE MENSAJES DE WHATSAPP (Twilio)
// -----------------------------------------------
router.post("/webhook", async (req, res) => {
  // Responder inmediatamente a Twilio
  res.set("Content-Type", "text/xml");
  res.send("<Response></Response>");

  try {
    const body = req.body;
    const telefono = body.From; // formato: whatsapp:+52...
    const mensaje  = body.Body;

    if (!telefono || !mensaje) return;

    logger.info(`Mensaje de ${telefono}: ${mensaje.substring(0, 80)}`);

    // Recuperar historial
    const historial = conversaciones.get(telefono) || [];

    // Procesar con el agente IA
    const resultado = await procesarMensaje(historial, mensaje);
    conversaciones.set(telefono, resultado.historialActualizado);

    // Ejecutar acciones si las hay
    if (resultado.accion) {
      await ejecutarAccion(resultado.accion, resultado.datos, telefono);
    }

    // Enviar respuesta por WhatsApp via Twilio
    await enviarMensaje(telefono, resultado.texto);

  } catch (error) {
    logger.error("Error procesando webhook: " + error.message);
  }
});

// -----------------------------------------------
// VERIFICACIÓN (no requerida por Twilio pero útil)
// -----------------------------------------------
router.get("/webhook", (req, res) => {
  res.send("Webhook activo");
});

// -----------------------------------------------
// EJECUTAR ACCIONES
// -----------------------------------------------
async function ejecutarAccion(accion, datos, telefono) {
  try {
    switch (accion) {
      case "REGISTRAR_PEDIDO":
        await registrarPedido({ ...datos.pedido, telefono_cliente: telefono });
        logger.info(`Pedido registrado para ${telefono}`);
        break;
      case "REGISTRAR_RESERVACION":
        await registrarReservacion({ ...datos.reservacion, telefono_cliente: telefono });
        logger.info(`Reservación registrada para ${telefono}`);
        break;
      case "ESCALAR_HUMANO":
        logger.warn(`ESCALACIÓN requerida para ${telefono}: ${datos.motivo}`);
        break;
    }
  } catch (error) {
    logger.error(`Error ejecutando acción ${accion}: ` + error.message);
  }
}

// -----------------------------------------------
// ENVIAR MENSAJE VIA TWILIO WHATSAPP
// -----------------------------------------------
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
    logger.error(`Error enviando mensaje a ${telefono}: ` + error.message);
  }
}

module.exports = router;
