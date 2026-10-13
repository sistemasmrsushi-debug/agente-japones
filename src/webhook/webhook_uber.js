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
// NUEVO (07-oct-2026, pedido por Diego): cuando Uber Direct reporta que una
// entrega ya en curso se cancelo o se regreso (el repartidor no pudo
// completarla), antes SOLO se le avisaba al cliente con un mensaje generico
// -- nadie de Mr. Sushi se enteraba a menos que el cliente volviera a
// escribir. El pedido ya esta pagado, asi que alguien tiene que decidir
// rapido si se reembolsa o se manda otro repartidor (ver el boton "Solicitar
// otro repartidor" en el dashboard, src/dashboard/index.html).
const { notificarDueno } = require("../utils/alertas");

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
  // NUEVO (07-oct-2026): "returned" es cuando el repartidor SI recogio el
  // pedido pero no pudo entregarlo (ej. no encontro al cliente) y lo esta
  // regresando -- antes este estatus no tenia ni mensaje ni alerta, el
  // cliente se quedaba sin ningun aviso.
  "returned": "😕 El repartidor no pudo entregar tu pedido y lo está regresando. Nos pondremos en contacto contigo.",
};

// Estatus que significan que la entrega NO se va a completar con este
// repartidor -- en ambos casos el pedido ya esta pagado, asi que alguien de
// Mr. Sushi tiene que decidir rapido (reembolsar o mandar otro repartidor).
const ESTATUS_FALLO_ENTREGA = new Set(["canceled", "returned"]);

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

    // NUEVO (07-oct-2026, pedido por Diego): alerta inmediata cuando la
    // entrega falla a medio camino -- antes esto solo quedaba en los logs.
    // El pedido ya esta pagado, asi que el dueno/sucursal necesita saber de
    // inmediato para contactar al cliente (reembolsar o mandar otro
    // repartidor con el boton del dashboard) en vez de esperar a que el
    // cliente se queje.
    if (ESTATUS_FALLO_ENTREGA.has(nuevoEstatus)) {
      notificarDueno(
        `🔴 Uber Direct no pudo completar una entrega (estatus: "${nuevoEstatus}").\n\nPedido: ${pedido.id}\nCliente: ${(pedido.telefono_cliente || "").replace("whatsapp:", "")}\nSucursal: ${pedido.sucursal}\nDirección: ${pedido.direccion || "—"}\n\nEl pedido ya está pagado -- contacta al cliente para decidir si se reembolsa o se manda otro repartidor (puedes usar el botón "Solicitar otro repartidor" en el dashboard).`
      );
    }

  } catch (error) {
    logger.error("Error procesando webhook de Uber Direct: " + error.message);
  }
});

module.exports = router;
