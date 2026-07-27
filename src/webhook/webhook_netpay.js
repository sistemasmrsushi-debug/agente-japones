// src/webhook/webhook_netpay.js
// Recibe notificaciones de pago de Netpay (equivalente al webhook.php que entregaron)
// Eventos manejados: sessionLink.paid, sessionLink.failed, cep.paid, cep.created

const express = require("express");
const router = express.Router();
const logger = require("../utils/logger");
const db = require("../db/database");
const { consultarEstatusTransaccion } = require("../utils/netpay");
const { crearEntrega } = require("../utils/uber_direct");

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

// Arma los datos de recoleccion (la sucursal) y entrega (el domicilio del
// cliente, ya validado con Google Maps) y crea la entrega en Uber Direct.
async function despacharUberDirect(pedido) {
  try {
    const sucursales = await db.obtenerSucursales();
    const sucursal = sucursales.find(s => s.nombre === pedido.sucursal);

    if (!sucursal || !sucursal.lat || !sucursal.lng) {
      logger.warn(`No se pudo despachar Uber Direct para ${pedido.id}: sucursal "${pedido.sucursal}" sin coordenadas registradas. Corre el script de geocodificacion de sucursales.`);
      return;
    }
    if (!pedido.ubicacion_gps?.latitude) {
      logger.warn(`No se pudo despachar Uber Direct para ${pedido.id}: el pedido no tiene coordenadas de domicilio guardadas.`);
      return;
    }

    const pickup = {
      nombre: sucursal.nombre,
      calle: sucursal.direccion,
      telefono: sucursal.telefono,
      lat: Number(sucursal.lat),
      lng: Number(sucursal.lng),
    };
    const dropoff = {
      nombre: pedido.nombre_cliente || "Cliente Mr. Sushi",
      calle: pedido.direccion,
      ciudad: pedido.municipio,
      estado: pedido.estado_direccion,
      codigoPostal: pedido.codigo_postal,
      telefono: (pedido.telefono_cliente || "").replace("whatsapp:", ""),
      lat: pedido.ubicacion_gps.latitude,
      lng: pedido.ubicacion_gps.longitude,
    };

    const resultado = await crearEntrega({
      pickup,
      dropoff,
      items: pedido.items,
      referencia: pedido.id,
    });

    if (resultado.exito) {
      await db.guardarEntregaUber(pedido.id, {
        deliveryId: resultado.deliveryId,
        trackingUrl: resultado.trackingUrl,
        estadoUber: resultado.estado,
      });
      logger.info(`Entrega de Uber Direct creada para ${pedido.id}: deliveryId=${resultado.deliveryId}`);
      if (pedido.telefono_cliente && resultado.trackingUrl) {
        await enviarMensaje(pedido.telefono_cliente,
          `Ya estamos buscando un repartidor para tu pedido. Puedes seguirlo aqui:\n${resultado.trackingUrl}`
        );
      }
    } else {
      logger.error(`Fallo al crear entrega de Uber Direct para ${pedido.id}: ${resultado.error}`);
    }
  } catch (error) {
    logger.error(`Error inesperado despachando Uber Direct para ${pedido.id}: ${error.message}`);
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
          const pedidos = await db.obtenerPedidos(null, "gerente");
          const pedido = pedidos.find(p => p.id === referenciaPedido);

          // IMPORTANTE (confirmado con Netpay): el link de pago no expira nunca
          // de su lado, aunque nuestro sistema ya haya cancelado el pedido
          // internamente a los 15 min. Por eso hay que distinguir dos casos
          // distintos, no tratarlos igual:
          //
          // 1. El pedido esta "cancelado" -> el cliente pago TARDE, pero sigue
          //    siendo un pago real y unico. Se debe honrar (avisar, preparar,
          //    despachar) igual que un pago a tiempo, solo que se deja anotado
          //    que fue tardio para que el gerente lo sepa.
          //
          // 2. El pedido ya estaba "pendiente" (o mas adelante: en_proceso,
          //    listo) -> esto SI es un pago duplicado real (dos confirmaciones
          //    de pago para el mismo pedido), y no se debe volver a procesar.
          const yaEstabaPagado = pedido && ["pendiente", "en_proceso", "listo"].includes(pedido.estado);

          if (yaEstabaPagado) {
            logger.warn(`POSIBLE PAGO DUPLICADO: el pedido ${referenciaPedido} ya estaba en estado "${pedido.estado}" cuando llego OTRO webhook de pago exitoso (transactionId=${transactionId}, monto=${amount}). Revisar manualmente si hubo un cobro doble y si procede un reembolso.`);
            break;
          }

          if (pedido && pedido.estado === "cancelado") {
            logger.warn(`Pago TARDIO recibido para el pedido ${referenciaPedido} (ya se habia cancelado internamente por pasar los 15 min, pero el link de Netpay seguia activo). Se honra el pago igualmente.`);
          }

          await db.actualizarEstadoPedido(referenciaPedido, "pendiente"); // pasa de pendiente_pago (o cancelado) a pendiente (confirmado, listo para preparar)
          logger.info(`Pedido ${referenciaPedido} marcado como pagado`);

          if (pedido?.telefono_cliente) {
            await enviarMensaje(pedido.telefono_cliente,
              `Pago confirmado! Tu pedido ${referenciaPedido} esta siendo preparado.\nTarjeta terminacion ${lastFourDigits || "****"}.\nTiempo estimado: 40 minutos.`
            );
          }

          // Despachar repartidor de Uber Direct automaticamente, solo para
          // pedidos a domicilio (los de recoger en sucursal no aplican).
          if (pedido?.tipo === "domicilio") {
            await despacharUberDirect(pedido);
          }
        }
        break;
      }

      case "sessionLink.failed":
      case "transaction.failed": {
        // Pago rechazado. Netpay documenta el evento como "sessionLink.failed",
        // pero en produccion confirmamos (via logs reales) que en la practica
        // manda "transaction.failed" -- se manejan ambos por si acaso.
        //
        // IMPORTANTE: el campo se llama "transactionTokenId", no "transactionId"
        // (diferente al payload de "sessionLink.paid"). Y el merchantReferenceCode
        // ya viene directo en este payload -- no hace falta la consulta extra a
        // consultarEstatusTransaccion(), que ademas fallaba porque transactionId
        // siempre era undefined.
        const { transactionTokenId, amount, merchantReferenceCode, responseMsg } = data.data;
        logger.warn(`Pago RECHAZADO: transactionTokenId=${transactionTokenId}, monto=${amount}, motivo=${responseMsg}, pedido=${merchantReferenceCode}`);

        if (merchantReferenceCode) {
          const pedidos = await db.obtenerPedidos(null, "gerente");
          const pedido = pedidos.find(p => p.id === merchantReferenceCode);
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
