// src/utils/autocancelar_pedidos.js
// =============================================
// Cancela automaticamente los pedidos que llevan mucho tiempo en estado
// "pendiente" (ya confirmados/pagados) sin que nadie del restaurante los haya
// marcado como "en_proceso" -- para no dejar a un cliente esperando
// indefinidamente si el pedido se les paso por alto.
// =============================================
const logger = require("./logger");
const db = require("../db/database");

const MINUTOS_LIMITE = 15; // tiempo maximo sin aceptar antes de cancelar
const INTERVALO_REVISION_MS = 5 * 60 * 1000; // revisar cada 5 minutos

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
    logger.error("Error enviando notificacion de auto-cancelacion: " + error.message);
  }
}

async function revisarPedidosVencidos() {
  try {
    const vencidos = await db.obtenerPedidosPendientesVencidos(MINUTOS_LIMITE);
    for (const pedido of vencidos) {
      await db.actualizarEstadoPedido(pedido.id, "cancelado");
      logger.warn(`Pedido ${pedido.id} cancelado automaticamente por no ser aceptado en ${MINUTOS_LIMITE} min (sucursal: ${pedido.sucursal})`);
      if (pedido.telefono_cliente) {
        await enviarMensaje(pedido.telefono_cliente,
          `Lo sentimos, tu pedido ${pedido.id} fue cancelado porque no pudimos confirmarlo a tiempo. Si quieres intentar de nuevo, escribenos!`
        );
      }
    }
  } catch (error) {
    logger.error("Error revisando pedidos vencidos: " + error.message);
  }
}

function iniciarAutocancelacion() {
  logger.info(`Auto-cancelacion de pedidos activa -> revisa cada ${INTERVALO_REVISION_MS / 60000} min, limite ${MINUTOS_LIMITE} min sin aceptar`);
  setInterval(revisarPedidosVencidos, INTERVALO_REVISION_MS);
}

module.exports = { iniciarAutocancelacion, revisarPedidosVencidos };
