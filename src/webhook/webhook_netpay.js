// src/webhook/webhook_netpay.js
// Recibe notificaciones de pago de Netpay (equivalente al webhook.php que entregaron)
// Eventos manejados: sessionLink.paid, sessionLink.failed, cep.paid, cep.created

const express = require("express");
const router = express.Router();
const logger = require("../utils/logger");
const db = require("../db/database");
const { consultarEstatusTransaccion } = require("../utils/netpay");

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
    logger.info(`Notificacion de pago enviada a ${telefono}`);
  } catch(error) {
    logger.error("Error enviando notificacion de pago: " + error.message);
  }
}

router.post("/webhook/netpay", async (req, res) => {
  // Responder inmediatamente a Netpay para que no reintente
  res.status(200).json({ recibido: true });

  try {
    const data = req.body;
    const evento = data.event;
    logger.info(`Webhook Netpay recibido: ${evento}`);
    logger.info(`Payload completo: ${JSON.stringify(data.data)}`);

    switch (evento) {

      case "sessionLink.paid": {
        // Pago exitoso
        const { transactionId, amount, orderId, lastFourDigits, cardHolderName } = data.data;
        logger.info(`Pago EXITOSO: transactionId=${transactionId}, monto=${amount}`);

        // Buscar el pedido por merchantReferenceCode (el ID que mandamos al generar el link)
        // Lo extraemos de la respuesta de consulta de transaccion para tener merchantReferenceCode
        const detalle = await consultarEstatusTransaccion(transactionId);
        const referenciaPedido = detalle.merchantReferenceCode;

        if (referenciaPedido) {
          await db.actualizarEstadoPedido(referenciaPedido, "pendiente"); // pasa de pendiente_pago a pendiente (confirmado, listo para preparar)
          logger.info(`Pedido ${referenciaPedido} marcado como pagado`);

          // Notificar al cliente
          const pedidos = await db.obtenerPedidos(null, "gerente");
          const pedido = pedidos.find(p => p.id === referenciaPedido);
          if (pedido?.telefono_cliente) {
            await enviarMensaje(pedido.telefono_cliente,
              `Pago confirmado! Tu pedido ${referenciaPedido} esta siendo preparado.\nTarjeta terminacion ${lastFourDigits || "****"}.\nTiempo estimado: 40 minutos.`
            );
          }
        }
        break;
      }

      case "sessionLink.failed":
      case "transaction.failed": {
        // Pago rechazado. Netpay documenta el evento como "sessionLink.failed",
        // pero en produccion confirmamos (via logs reales) que en la practica
        // manda "transaction.failed" -- se manejan ambos por si acaso.
        const { transactionId, amount } = data.data;
        logger.warn(`Pago RECHAZADO: transactionId=${transactionId}, monto=${amount}`);

        const detalle = await consultarEstatusTransaccion(transactionId);
        const referenciaPedido = detalle.merchantReferenceCode;

        if (referenciaPedido) {
          const pedidos = await db.obtenerPedidos(null, "gerente");
          const pedido = pedidos.find(p => p.id === referenciaPedido);
          if (pedido?.telefono_cliente) {
            await enviarMensaje(pedido.telefono_cliente,
              `Tu pago no pudo procesarse. Quieres intentar con otra tarjeta? Responde "reintentar pago" y te mandamos un nuevo link.`
            );
          }
        }
        break;
      }

      case "cep.paid":
      case "cep.created": {
        // Eventos de referencia (transferencias SPEI u otros metodos alternos)
        const { reference, merchantReferenceCode, transactionStatus, amount } = data.data;
        logger.info(`Evento ${evento}: ref=${reference}, merchantRef=${merchantReferenceCode}, status=${transactionStatus}`);
        break;
      }

      default:
        logger.info(`Evento Netpay no manejado: ${evento}`);
    }

  } catch (error) {
    logger.error("Error procesando webhook Netpay: " + error.message);
  }
});

module.exports = router;
