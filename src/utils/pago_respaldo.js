// src/utils/pago_respaldo.js
// =============================================
// NUEVO (06-oct-2026, pedido por Diego): red de seguridad para cuando el
// webhook de pago de Netpay no llega.
//
// Contexto del incidente que motivo esto: el 06-oct-2026 (y ya antes, en
// julio) un pago real se completaba del lado de Netpay pero el aviso nunca
// llegaba a nuestro servidor -- sin ningun error en los logs, la conexion
// fallaba antes de tocar nuestra app. La causa confirmada en julio: Netpay
// fija ("pinnea") el certificado SSL especifico de nuestro dominio en vez de
// validar contra la cadena estandar de Let's Encrypt, y Railway rota ese
// certificado automaticamente cada ~60 dias -- cuando eso pasa, el
// certificado que Netpay tiene guardado ya no coincide y su conexion falla
// en silencio. Ya se le pidio a Netpay corregir esto de su lado, pero
// mientras tanto (o si vuelve a pasar por cualquier otra razon), ningun
// pedido debe quedarse "pendiente_pago" sin resolverse solo porque el aviso
// de Netpay no llego.
//
// Como funciona: unos minutos despues de generar un link de pago, si el
// pedido SIGUE "pendiente_pago" (osea que el webhook no llego), se le
// pregunta directamente a Netpay "¿esto ya se pago?" usando el sessionId que
// se guardo al generar el link. Si Netpay confirma el pago de forma clara e
// inequivoca, se marca el pedido como pagado y se le avisa al cliente, IGUAL
// que si hubiera llegado el webhook normal -- el cliente nunca se entera de
// que hubo un problema. A Diego se le avisa por separado de que el respaldo
// tuvo que intervenir, para que sepa que el problema de Netpay sigue sin
// resolverse del todo de su lado.
//
// IMPORTANTE: esto es deliberadamente conservador. Si la consulta a Netpay
// falla, da un error, o no trae una señal clara de pago, NO se hace nada --
// el pedido sigue su curso normal (incluido el auto-cancelado a los 15 min
// si en verdad nadie pago). Nunca se marca un pedido como pagado por una
// corazonada.
// =============================================
const logger = require("./logger");
const db = require("../db/database");
const { consultarEstatusPorSesion } = require("./netpay");
const { notificarDueno } = require("./alertas");

// 3 minutos: bastante tiempo para que el webhook normal de Netpay llegue si
// todo esta funcionando bien (en pruebas normales llega en segundos), pero
// mucho antes de los 15 minutos del auto-cancelador -- para que el cliente
// nunca llegue a ver su pedido cancelado por un pago que ya habia hecho.
const RETRASO_MS = 3 * 60 * 1000;

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
    logger.error("Error enviando confirmacion de pago (respaldo): " + error.message);
  }
}

// Se llama justo despues de generar un link de pago exitosamente. No hace
// nada de inmediato -- solo programa la revision para dentro de unos
// minutos. Si no hay sessionId (ej. Netpay no lo regreso por alguna razon),
// no se puede consultar nada despues, asi que no se programa nada.
function programarRevisionRespaldo(pedidoId, sessionId) {
  if (!sessionId) return;
  setTimeout(() => {
    revisarYConfirmar(pedidoId, sessionId).catch((e) =>
      logger.error(`Error en revision de respaldo de pago para ${pedidoId}: ${e.message}`)
    );
  }, RETRASO_MS);
}

async function revisarYConfirmar(pedidoId, sessionId) {
  const pedido = await db.obtenerPedidoPorId(pedidoId);
  // Si ya no esta "pendiente_pago" es porque el webhook SI llego a tiempo
  // (lo normal), o porque se cancelo/resolvio de otra forma -- no hay nada
  // que hacer.
  if (!pedido || pedido.estado !== "pendiente_pago") return;

  const resultado = await consultarEstatusPorSesion(sessionId);

  if (!resultado.consultado) {
    logger.warn(`Revision de respaldo: no se pudo consultar la sesion ${sessionId} del pedido ${pedidoId} -- ${resultado.error || "sin detalle"}. Se deja que el flujo normal (auto-cancelado a los 15 min) siga su curso.`);
    return;
  }

  if (!resultado.pagado) {
    logger.info(`Revision de respaldo: pedido ${pedidoId} sigue sin pagarse segun Netpay (sessionId ${sessionId}).`);
    return;
  }

  // Volver a checar el estado justo antes de marcar como pagado, por si el
  // webhook normal de Netpay llego en el tiempo que tardo esta consulta --
  // evita procesar el mismo pago dos veces.
  const pedidoActual = await db.obtenerPedidoPorId(pedidoId);
  if (!pedidoActual || pedidoActual.estado !== "pendiente_pago") {
    logger.info(`Revision de respaldo: pedido ${pedidoId} ya se habia resuelto por otro medio mientras se consultaba a Netpay -- no se toca.`);
    return;
  }

  await db.marcarPedidoPagado(pedidoId);
  logger.warn(`🟡 Revision de respaldo confirmo el pago del pedido ${pedidoId} directamente con Netpay -- su aviso automatico (webhook) no llego a tiempo.`);

  if (pedidoActual.telefono_cliente) {
    await enviarMensaje(
      pedidoActual.telefono_cliente,
      `🍣 ¡Pago confirmado! Tu pedido ${pedidoId} fue recibido.\nEn breve la sucursal lo confirma y empieza a prepararlo.`
    );
  }

  await notificarDueno(
    `🟡 El aviso automático de pago de Netpay no llegó para el pedido ${pedidoId} -- probablemente el mismo problema del certificado SSL de antes. La revisión de respaldo lo detectó y confirmó el pago directo con Netpay, así que el pedido siguió su curso normal y el cliente no se enteró de nada.\n\nSigue siendo importante que Netpay corrija esto de su lado -- si esto se repite seguido, vale la pena insistirles.`
  );
}

module.exports = { programarRevisionRespaldo };
