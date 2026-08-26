// src/webhook/webhook_netpay.js
// Recibe notificaciones de pago de Netpay (equivalente al webhook.php que entregaron)
// Eventos manejados: sessionLink.paid, sessionLink.failed, cep.paid, cep.created

const express = require("express");
const router = express.Router();
const logger = require("../utils/logger");
const db = require("../db/database");
const { consultarEstatusTransaccion } = require("../utils/netpay");
const { crearEntrega } = require("../utils/uber_direct");
const { credencialesPorSucursal } = require("../../config/uber_credenciales");

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

// Manda una alerta de WhatsApp al numero configurado para avisos urgentes
// (ej. posibles pagos duplicados) -- sin esto, esos casos solo quedaban
// registrados en los logs de Railway, sin que nadie se enterara a tiempo.
async function enviarAlertaGerente(texto) {
  const telefono = process.env.TELEFONO_ALERTAS_GERENTE;
  if (!telefono) {
    logger.warn("TELEFONO_ALERTAS_GERENTE no esta configurada -- no se pudo mandar la alerta");
    return;
  }
  await enviarMensaje(`whatsapp:${telefono}`, `⚠️ ALERTA Mr. Sushi\n\n${texto}`);
}

// CONFIRMADO (23-ago-2026, con diagnosticar_uber.js): el "failed to create
// location" que fallaba en TODAS las entregas a domicilio no era por la
// direccion -- era el TELEFONO de la sucursal. config/restaurante.js guarda
// varias sucursales con dos numeros en el mismo campo separados por "/" y
// sin codigo de pais (ej. "55 5393 0232 / 55 5572 3088"), y Uber Direct
// rechaza ese formato ("pickup phone number is not valid"). Esta funcion
// toma solo el primer numero y lo convierte a formato E.164 (+52...).
function formatearTelefonoUber(telefono) {
  if (!telefono) return "";
  const primerNumero = telefono.split("/")[0].trim();
  const soloDigitos = primerNumero.replace(/\D/g, "");
  if (!soloDigitos) return "";
  // Numero local mexicano de 10 digitos -- anteponer codigo de pais 52. Si ya
  // trae codigo de pais (11+ digitos, como los que llegan de WhatsApp), se
  // deja tal cual.
  const conCodigoPais = soloDigitos.length === 10 ? `52${soloDigitos}` : soloDigitos;
  return `+${conCodigoPais}`;
}

// Arma los datos de recoleccion (la sucursal) y entrega (el domicilio del
// cliente, ya validado con Google Maps) y crea la entrega en Uber Direct.
async function despacharUberDirect(pedido) {
  try {
    const sucursales = await db.obtenerSucursales();
    const sucursal = sucursales.find(s => s.nombre === pedido.sucursal);

    if (!sucursal || !sucursal.lat || !sucursal.lng) {
      logger.warn(`No se pudo despachar Uber Direct para ${pedido.id}: sucursal "${pedido.sucursal}" sin coordenadas registradas. Corre el script de geocodificacion de sucursales.`);
      return { exito: false };
    }
    if (!pedido.ubicacion_gps?.latitude) {
      logger.warn(`No se pudo despachar Uber Direct para ${pedido.id}: el pedido no tiene coordenadas de domicilio guardadas.`);
      return { exito: false };
    }

    const pickup = {
      nombre: sucursal.nombre,
      calle: sucursal.direccion,
      telefono: formatearTelefonoUber(sucursal.telefono),
      lat: Number(sucursal.lat),
      lng: Number(sucursal.lng),
    };
    // CORREGIDO (confirmado con logs reales, 22-ago-2026): pedido.direccion ya
    // es la direccion COMPLETA validada por Google Maps (calle, colonia, CP,
    // municipio y estado, todo en un solo texto). Antes tambien se mandaban
    // municipio/estado_direccion/codigo_postal por separado, duplicando esos
    // datos dentro del mismo request -- Uber Direct rechazaba la entrega con
    // "failed to create location" porque su geocodificador no podia resolver
    // la direccion con esa informacion repetida/contradictoria. El pickup
    // (sucursal) nunca tuvo este problema porque nunca mando esos campos por
    // separado -- aqui se hace lo mismo: solo texto completo + lat/lng.
    const dropoff = {
      nombre: pedido.nombre_cliente || "Cliente Mr. Sushi",
      calle: pedido.direccion,
      telefono: formatearTelefonoUber((pedido.telefono_cliente || "").replace("whatsapp:", "")),
      lat: pedido.ubicacion_gps.latitude,
      lng: pedido.ubicacion_gps.longitude,
    };

    // Interruptor de pruebas: mientras UBER_DIRECT_MODO_PRUEBA=true este
    // configurado en Railway, todos los despachos se crean en modo "Robo
    // Courier" (repartidor SIMULADO, sin costo ni despacho real), para poder
    // probar el flujo completo del bot (WhatsApp -> pago -> despacho) sin
    // afectar operacion real. Quitar la variable (o ponerla en "false")
    // antes de operar con clientes reales.
    const modoPrueba = process.env.UBER_DIRECT_MODO_PRUEBA === "true";
    if (modoPrueba) {
      logger.warn(`UBER_DIRECT_MODO_PRUEBA activo -- el despacho de ${pedido.id} sera SIMULADO (Robo Courier), no se manda repartidor real.`);
    }

    // Credenciales de Uber Direct por razon social (ver config/uber_credenciales.js).
    // Mientras ese archivo este vacio (o esta sucursal no este mapeada
    // todavia), esto regresa null y crearEntrega usa las credenciales
    // globales de siempre -- no cambia nada hasta que se configure.
    const credenciales = credencialesPorSucursal(pedido.sucursal);
    if (credenciales) {
      logger.info(`Despachando ${pedido.id} con credenciales de "${credenciales.razonSocial}" (sucursal: ${pedido.sucursal})`);
    }

    const resultado = await crearEntrega({
      pickup,
      dropoff,
      items: pedido.items,
      referencia: pedido.id,
      testSpecifications: modoPrueba ? { robo_courier_specification: { mode: "auto" } } : undefined,
      credenciales,
    });

    if (resultado.exito) {
      await db.guardarEntregaUber(pedido.id, {
        deliveryId: resultado.deliveryId,
        trackingUrl: resultado.trackingUrl,
        estadoUber: resultado.estado,
      });
      logger.info(`Entrega de Uber Direct creada para ${pedido.id}: deliveryId=${resultado.deliveryId}`);
      // CORREGIDO: ya no manda su propio mensaje aqui -- regresa el resultado
      // para que el caller (el handler de sessionLink.paid) lo combine con el
      // mensaje de "pago confirmado" en un solo WhatsApp, en vez de dos
      // mensajes seguidos.
      return { exito: true, trackingUrl: resultado.trackingUrl || null };
    }
    logger.error(`Fallo al crear entrega de Uber Direct para ${pedido.id}: ${resultado.error}`);
    return { exito: false };
  } catch (error) {
    logger.error(`Error inesperado despachando Uber Direct para ${pedido.id}: ${error.message}`);
    return { exito: false };
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
            await enviarAlertaGerente(
              `Posible PAGO DUPLICADO detectado.\n\nPedido: ${referenciaPedido}\nEstado previo: ${pedido.estado}\nMonto: $${amount}\ntransactionId nuevo: ${transactionId}\n\nRevisa manualmente en Netpay si hubo doble cobro y si procede reembolso.`
            );
            break;
          }

          if (pedido && pedido.estado === "cancelado") {
            logger.warn(`Pago TARDIO recibido para el pedido ${referenciaPedido} (ya se habia cancelado internamente por pasar los 15 min, pero el link de Netpay seguia activo). Se honra el pago igualmente.`);
          }

          // CORREGIDO: marcarPedidoPagado() ademas de pasar el pedido a "pendiente"
          // (de pendiente_pago o cancelado), registra pago_confirmado_en=NOW() --
          // el auto-cancelador de pedidos sin aceptar cuenta sus 15 min desde ahi,
          // no desde la creacion original del pedido.
          await db.marcarPedidoPagado(referenciaPedido);
          logger.info(`Pedido ${referenciaPedido} marcado como pagado`);

          // CORREGIDO: para domicilio, se espera el resultado de Uber Direct
          // ANTES de mandar el mensaje, para combinar todo en un solo
          // WhatsApp (antes se mandaban dos mensajes seguidos: confirmacion
          // de pago, y luego por separado el aviso de repartidor).
          if (pedido?.telefono_cliente) {
            let mensajePago = `🍣 ¡Pago confirmado! Tu pedido ${referenciaPedido} ya está en preparación.\n💳 Tarjeta terminación ${lastFourDigits || "****"}.\n⏱️ Tiempo estimado: 40 minutos.`;

            if (pedido.tipo === "domicilio") {
              const resultadoUber = await despacharUberDirect(pedido);
              mensajePago += resultadoUber.trackingUrl
                ? `\n\n🛵 Ya estamos buscando tu repartidor. Puedes seguirlo aquí:\n${resultadoUber.trackingUrl}`
                : `\n\n🛵 En breve te compartimos el link para seguir a tu repartidor.`;
            }

            await enviarMensaje(pedido.telefono_cliente, mensajePago);
          } else if (pedido?.tipo === "domicilio") {
            // Sin telefono no hay a quien avisar, pero igual se despacha.
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
        // CORREGIDO (confirmado con logs reales de Railway, 19-ago-2026): los
        // nombres de campo NO eran transactionTokenId/merchantReferenceCode/
        // responseMsg -- el payload real trae transactionId, merchantRefCode,
        // responseCode y procRetMsg. Con los nombres viejos todo salia
        // "undefined" y el cliente nunca recibia el aviso de pago rechazado.
        const { transactionId, amount, merchantRefCode, procRetMsg, responseCode } = data.data;
        logger.warn(`Pago RECHAZADO: transactionId=${transactionId}, monto=${amount}, motivo=${procRetMsg} (codigo ${responseCode}), pedido=${merchantRefCode}`);

        if (merchantRefCode) {
          const pedidos = await db.obtenerPedidos(null, "gerente");
          const pedido = pedidos.find(p => p.id === merchantRefCode);
          if (pedido?.telefono_cliente) {
            await enviarMensaje(pedido.telefono_cliente,
              `😕 Tu pago no pudo procesarse. ¿Quieres intentar con otra tarjeta? Responde "reintentar pago" y te mandamos un nuevo link.`
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
