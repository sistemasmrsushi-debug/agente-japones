// src/webhook/webhook_uber.js
// Recibe las actualizaciones de estatus de una entrega de Uber Direct
// (repartidor asignado, en camino, entregado, cancelado, etc.)
//
// Verificacion de firma segun documentacion oficial:
// https://developer.uber.com/docs/deliveries/guides/webhooks
// Header "x-uber-signature" = HMAC-SHA256(signing_key, cuerpo_crudo_de_la_peticion)

const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const logger = require("../utils/logger");
const db = require("../db/database");

function getTwilioClient() {
  return require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

async function enviarMensaje(telefono, texto) {
  try {
    const client = getTwilioClient();
    await client.messages.create({
      from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
      to: telefono,
      body: texto,
    });
  } catch (error) {
    logger.error("Error enviando notificacion de Uber Direct: " + error.message);
  }
}

function firmaValida(cuerpoCrudo, firmaRecibida) {
  const signingKey = process.env.UBER_DIRECT_WEBHOOK_SIGNING_KEY;
  if (!signingKey) {
    logger.warn("UBER_DIRECT_WEBHOOK_SIGNING_KEY no configurada -- no se puede verificar la firma del webhook");
    return false;
  }
  const esperada = crypto.createHmac("sha256", signingKey).update(cuerpoCrudo).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(firmaRecibida || ""), Buffer.from(esperada));
  } catch {
    return false; // longitudes distintas, etc.
  }
}

// Mensajes amigables por estatus para el cliente. Los nombres exactos de status
// que manda Uber se confirman con la primera prueba real (la documentacion no
// siempre coincide al 100% con la respuesta real, como ya nos paso con Netpay).
// CORREGIDO: se quitaron las notificaciones de los estatus intermedios
// (pickup, pickup_complete, dropoff) -- son redundantes porque el cliente ya
// recibe el link de seguimiento de Uber en el mensaje de pago confirmado, y
// ahi puede ver el mismo avance en tiempo real. Solo se avisan los dos
// estatus que SI requieren accion/atencion del cliente: que ya se entrego, o
// que hubo un problema y se cancelo.
const MENSAJES_ESTATUS = {
  "pending": null, // aun no hay repartidor asignado, no vale la pena notificar
  "pickup": null, // ya visible en el link de seguimiento de Uber
  "pickup_complete": null, // ya visible en el link de seguimiento de Uber
  "dropoff": null, // ya visible en el link de seguimiento de Uber
  "delivered": "🍣 ¡Tu pedido fue entregado! Buen provecho.",
  "canceled": "😕 Hubo un problema con el repartidor y la entrega se canceló. Nos pondremos en contacto contigo.",
};

// NOTA IMPORTANTE: index.js ya usa express.json() de forma GLOBAL para todas
// las rutas. Eso significa que, para cuando una peticion llega aqui, el cuerpo
// crudo ya fue consumido y convertido en objeto (req.body). Por eso este router
// NO usa su propio express.raw() (no serviria de nada, llegaria vacio) -- en vez
// de eso, index.js guarda el cuerpo crudo en "req.rawBody" (con la opcion
// "verify" de express.json()) para que aqui podamos verificar la firma con los
// bytes originales, y a la vez usar req.body ya parseado para leer los campos.
router.post("/webhook/uber", async (req, res) => {
  // Responder rapido para que Uber no reintente
  res.status(200).json({ recibido: true });

  try {
    const cuerpoCrudo = req.rawBody;
    const firma = req.headers["x-uber-signature"];

    if (!cuerpoCrudo || !firmaValida(cuerpoCrudo, firma)) {
      logger.warn("Webhook Uber Direct con firma invalida o sin cuerpo crudo disponible -- ignorado");
      return;
    }

    const data = req.body;
    logger.info(`Webhook Uber Direct recibido: ${JSON.stringify(data)}`);

    const deliveryId = data.delivery_id || data.id;
    const nuevoEstatus = data.status || data.kind;

    if (!deliveryId) {
      logger.warn("Webhook Uber Direct sin delivery_id -- no se puede relacionar con un pedido");
      return;
    }

    const pedido = await db.obtenerPedidoPorUberDeliveryId(deliveryId);
    if (!pedido) {
      logger.warn(`Webhook Uber Direct para delivery_id=${deliveryId} sin pedido asociado en nuestra base de datos`);
      return;
    }

    await db.actualizarEstadoUber(deliveryId, nuevoEstatus);
    logger.info(`Pedido ${pedido.id} -> estatus Uber Direct actualizado a "${nuevoEstatus}"`);

    const mensaje = MENSAJES_ESTATUS[nuevoEstatus];
    if (mensaje && pedido.telefono_cliente) {
      await enviarMensaje(pedido.telefono_cliente, mensaje);
    }

  } catch (error) {
    logger.error("Error procesando webhook de Uber Direct: " + error.message);
  }
});

module.exports = router;
