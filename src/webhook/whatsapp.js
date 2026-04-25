// src/webhook/whatsapp.js
// =============================================
// WEBHOOK DE WHATSAPP
// Recibe mensajes de Meta y los procesa
// =============================================

const express = require("express");
const router = express.Router();
const axios = require("axios");
const NodeCache = require("node-cache");
const { procesarMensaje } = require("../agent/agente");
const { registrarPedido, registrarReservacion } = require("../integrations/sistema-pedidos");
const logger = require("../utils/logger");

// Memoria de conversaciones (24 horas por usuario)
const conversaciones = new NodeCache({ stdTTL: 86400 });

const WHATSAPP_API = "https://graph.facebook.com/v19.0";

// -----------------------------------------------
// VERIFICACIÓN DEL WEBHOOK (requerido por Meta)
// -----------------------------------------------
router.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    logger.info("Webhook verificado correctamente ✓");
    res.status(200).send(challenge);
  } else {
    logger.warn("Verificación de webhook fallida");
    res.sendStatus(403);
  }
});

// -----------------------------------------------
// RECEPCIÓN DE MENSAJES
// -----------------------------------------------
router.post("/webhook", async (req, res) => {
  // Responder rápido a Meta (máximo 5 segundos)
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== "whatsapp_business_account") return;

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const mensaje = value?.messages?.[0];

    if (!mensaje) return; // Puede ser un status update, no un mensaje

    const telefono = mensaje.from;
    const tipo = mensaje.type;

    let textoRecibido = "";

    if (tipo === "text") {
      textoRecibido = mensaje.text.body;
    } else if (tipo === "audio") {
      textoRecibido = "[El cliente envió una nota de voz. Por favor responde que por el momento solo atendemos por texto.]";
    } else if (tipo === "image") {
      textoRecibido = "[El cliente envió una imagen. Responde amablemente que no puedes procesar imágenes aún.]";
    } else {
      return; // Ignorar otros tipos
    }

    logger.info(`Mensaje de ${telefono}: ${textoRecibido.substring(0, 80)}`);

    // Recuperar historial de conversación
    const historial = conversaciones.get(telefono) || [];

    // Procesar con el agente IA
    const resultado = await procesarMensaje(historial, textoRecibido);

    // Guardar historial actualizado
    conversaciones.set(telefono, resultado.historialActualizado);

    // Ejecutar acciones si las hay
    if (resultado.accion) {
      await ejecutarAccion(resultado.accion, resultado.datos, telefono);
    }

    // Enviar respuesta al cliente
    await enviarMensaje(telefono, resultado.texto);

  } catch (error) {
    logger.error("Error procesando webhook: " + error.message + " - " + error.stack);
  }
});

// -----------------------------------------------
// EJECUTAR ACCIONES DEL AGENTE
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
        logger.warn(`ESCALACIÓN HUMANA requerida para ${telefono}: ${datos.motivo}`);
        // Aquí puedes notificar a un gerente por Slack, email, etc.
        await notificarEscalacion(telefono, datos.motivo);
        break;
    }
  } catch (error) {
    logger.error(`Error ejecutando acción ${accion}:`, error.message);
  }
}

// -----------------------------------------------
// ENVIAR MENSAJE POR WHATSAPP
// -----------------------------------------------
async function enviarMensaje(telefono, texto) {
  try {
    await axios.post(
      `${WHATSAPP_API}/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: telefono,
        type: "text",
        text: { body: texto },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    logger.error(`Error enviando mensaje a ${telefono}:`, error.response?.data || error.message);
  }
}

// -----------------------------------------------
// NOTIFICAR ESCALACIÓN (personaliza según tus canales)
// -----------------------------------------------
async function notificarEscalacion(telefono, motivo) {
  // TODO: Conectar con Slack, email o sistema interno
  logger.warn(`[ESCALACIÓN] Teléfono: ${telefono} | Motivo: ${motivo}`);
  // Ejemplo con Slack Webhook:
  // await axios.post(process.env.SLACK_WEBHOOK_URL, {
  //   text: `🚨 Escalación requerida\nTeléfono: ${telefono}\nMotivo: ${motivo}`
  // });
}

module.exports = router;
