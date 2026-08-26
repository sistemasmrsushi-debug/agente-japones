// src/webhook/webhook_netpay.js
// Recibe notificaciones de pago de Netpay (equivalente al webhook.php que entregaron)
// Eventos manejados: sessionLink.paid, sessionLink.failed, cep.paid, cep.created

const express = require("express");
const router = express.Router();
const logger = require("../utils/logger");
const db = require("../db/database");
const { consultarEstatusTransaccion } = require("../utils/netpay");
const { crearCotizacion, crearEntrega } = require("../utils/uber_direct");
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

    // CORREGIDO (26-ago-2026, feedback real de certificacion Uber Direct
    // compartido por Diego de otro proyecto/Grupo Telnet): Uber pide la
    // direccion ESTRUCTURADA (calle separada de colonia/ciudad/estado/CP).
    // armarDireccionUber() en uber_direct.js ahora arma esa estructura sola
    // a partir de estos campos -- si sucursal.municipio/estado_direccion
    // todavia no estan geocodificados (columnas nuevas, requieren correr
    // scripts/backfill_direccion_sucursales.js una vez), cae de vuelta
    // automaticamente al texto completo tal como funcionaba antes, asi que
    // esto es seguro de desplegar aunque el backfill no se haya corrido.
    const pickup = {
      nombre: sucursal.nombre,
      direccionCompleta: sucursal.direccion,
      colonia: sucursal.colonia || null,
      ciudad: sucursal.municipio || null,
      estado: sucursal.estado_direccion || null,
      codigoPostal: sucursal.codigo_postal || null,
      telefono: formatearTelefonoUber(sucursal.telefono),
      lat: Number(sucursal.lat),
      lng: Number(sucursal.lng),
    };
    const dropoff = {
      nombre: pedido.nombre_cliente || "Cliente Mr. Sushi",
      direccionCompleta: pedido.direccion,
      colonia: pedido.colonia || null,
      ciudad: pedido.municipio || null,
      estado: pedido.estado_direccion || null,
      codigoPostal: pedido.codigo_postal || null,
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
    //
    // SEGURIDAD (26-ago-2026): mientras no este confirmado con Uber que el
    // modo de prueba (Robo Courier / test_specifications) es seguro usarlo
    // con credenciales de PRODUCCION, en modo de prueba SIEMPRE se ignoran
    // las credenciales por razon social (aunque ya esten configuradas) y se
    // usan credenciales de sandbox dedicadas y explicitas
    // (UBER_DIRECT_CLIENT_ID_SANDBOX / UBER_DIRECT_CLIENT_SECRET_SANDBOX).
    // Asi, un despacho simulado NUNCA puede terminar autenticandose con
    // credenciales productivas, sin importar que se vaya llenando
    // uber_credenciales.js o que cambien las variables globales. Si esas
    // variables de sandbox no estan configuradas, se cae de vuelta al
    // comportamiento de siempre (credenciales por razon social, o si no hay,
    // las globales UBER_DIRECT_CLIENT_ID/SECRET).
    let credenciales;
    if (modoPrueba && process.env.UBER_DIRECT_CLIENT_ID_SANDBOX && process.env.UBER_DIRECT_CLIENT_SECRET_SANDBOX) {
      credenciales = {
        clientId: process.env.UBER_DIRECT_CLIENT_ID_SANDBOX,
        clientSecret: process.env.UBER_DIRECT_CLIENT_SECRET_SANDBOX,
        razonSocial: "SANDBOX (modo de prueba)",
      };
      logger.info(`Despachando ${pedido.id} en modo de prueba con credenciales de SANDBOX dedicadas (nunca produccion).`);
    } else {
      credenciales = credencialesPorSucursal(pedido.sucursal);
      if (credenciales) {
        logger.info(`Despachando ${pedido.id} con credenciales de "${credenciales.razonSocial}" (sucursal: ${pedido.sucursal})`);
      }
    }

    // CORREGIDO (26-ago-2026, feedback real de certificacion Uber Direct):
    // el flujo Quote -> Create es OBLIGATORIO para certificacion. Antes se
    // creaba la entrega directo, sin cotizar primero. Ahora se pide la
    // cotizacion (mismos pickup/dropoff, misma direccion/telefonos que la
    // entrega -- paridad exigida por Uber) y se usa el quote_id resultante.
    // Si la cotizacion falla, no se intenta crear la entrega sin ella.
    const cotizacion = await crearCotizacion({ pickup, dropoff, credenciales });
    if (!cotizacion.exito) {
      logger.error(`Fallo al cotizar entrega de Uber Direct para ${pedido.id}: ${cotizacion.error}`);
      return { exito: false };
    }

    // external_store_id: identificador ESTABLE por sucursal (no por pedido,
    // eso ya se manda aparte en external_id/manifest_reference). Se usa el id
    // numerico de la sucursal en la base de datos, que no cambia aunque se
    // renombre la sucursal.
    const externalStoreId = `sucursal-${sucursal.id}`;

    const resultado = await crearEntrega({
      pickup,
      dropoff,
      items: pedido.items,
      referencia: pedido.id,
      quoteId: cotizacion.quoteId,
      externalStoreId,
      dropoffNotes: pedido.referencias || undefined,
      // CORREGIDO (26-ago-2026, confirmado con una prueba real): Uber
      // rechaza la entrega si se activa Pincode/firma/ID a la vez que
      // undeliverable_action="leave_at_door" (error real de la API:
      // "undeliverable_action is not compatible with requested Signature or
      // ID requirements"). Segun la guia oficial de Uber, leave_at_door solo
      // es compatible con verificacion por foto -- Pincode/firma/ID exigen
      // que el flujo garantice contacto directo, sin opcion de "dejar y
      // listo". Se prefirio mantener leave_at_door (no desechar comida si el
      // cliente no puede recibir) y desactivar el Pincode.
      activarPincode: false,
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
        //
        // CORREGIDO OTRA VEZ (confirmado con logs reales, 26-ago-2026, caso de
        // certificacion 3.3 review@ / AMEX): resulta que "transaction.failed"
        // NO siempre trae los nombres de arriba -- en este caso vino con
        // transactionTokenId/merchantReferenceCode/responseMsg, exactamente
        // el formato "viejo" que se penso que ya no se usaba. Netpay manda
        // AMBAS variantes de nombres de campo segun el caso (no se pudo
        // determinar el patron exacto), asi que ahora se aceptan las dos --
        // si no, merchantRefCode volvia a salir undefined y el cliente se
        // quedaba otra vez sin el aviso de pago rechazado.
        const d = data.data;
        const transactionId = d.transactionId || d.transactionTokenId;
        const merchantRefCode = d.merchantRefCode || d.merchantReferenceCode;
        const procRetMsg = d.procRetMsg || d.responseMsg;
        const { amount, responseCode } = d;
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
