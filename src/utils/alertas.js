// src/utils/alertas.js
// =============================================
// Alertas en tiempo real al dueno (Diego) por SMS, cuando falla una
// integracion critica (Netpay, Uber Direct, Google Maps) durante un pedido
// REAL de un cliente. Antes, estas fallas solo quedaban registradas en los
// logs de Railway -- nadie se enteraba a menos que alguien revisara los
// logs a mano o el cliente reportara el problema (como paso el 23-sep-2026
// con un pedido por GPS que se quedo sin link de pago). Pedido por Diego.
//
// CAMBIADO (13-oct-2026, caso real con Diego): esto mandaba las alertas por
// WhatsApp, pero WhatsApp Business NO deja que un negocio le escriba a
// alguien "por su cuenta" (sin que el cliente haya escrito primero) salvo
// que exista una conversacion abierta de las ultimas 24 horas, o se use una
// plantilla pre-aprobada por Meta. Como estas alertas (y la prueba diaria,
// ver prueba_diaria.js) las dispara el SISTEMA, no una conversacion de
// Diego con el bot, WhatsApp las bloqueaba en silencio -- Twilio contestaba
// "enviado" sin error, pero el mensaje nunca llegaba, a menos que Diego le
// hubiera escrito algo al bot en las ultimas 24h (confirmado en vivo: al
// escribirle "hola" al bot, el siguiente aviso si llego). SMS no tiene esta
// restriccion -- por eso se cambio el canal de estas alertas a SMS. Los
// mensajes normales del bot a los CLIENTES (whatsapp.js) siguen siendo por
// WhatsApp como siempre -- esto solo aplica a los avisos internos al dueno.
//
// Requiere la variable de entorno TELEFONO_DUENO (numero de Diego, con
// lada, ej. 5511223344 o +525511223344). Si no esta configurada, solo se
// deja constancia en los logs -- esto es una alerta adicional, nunca debe
// bloquear ni afectar el flujo real del pedido del cliente.
// =============================================
const logger = require("./logger");

// NUEVO (13-oct-2026, reportado por Diego: la prueba diaria decia "todo
// bien" pero el aviso nunca llegaba): el formato que pide Twilio es E.164
// (obligatorio el "+" al inicio, ej. +525511223344) -- pero el comentario
// de arriba (y como Diego lo configuro en Railway) nunca pedia el "+". Con
// el "+" faltante, Twilio rechazaba el numero, notificarDueno() lo atrapaba
// en el catch, y ese error SOLO quedaba en los logs de Railway -- nunca
// llegaba a Diego de ninguna forma. Esta funcion ahora arregla el formato
// sola (le agrega el "+" si falta) para no depender de que quede escrito
// exactamente bien en Railway.
function normalizarTelefono(numero) {
  let limpio = String(numero || "").replace(/^whatsapp:/, "").trim();
  limpio = limpio.replace(/[\s\-()]/g, ""); // quita espacios, guiones, parentesis
  if (limpio && !limpio.startsWith("+")) limpio = "+" + limpio;
  return limpio || null;
}

// Ahora regresa { enviado: true } o { enviado: false, error: "..." } en vez
// de nada, para que quien la llame (ej. la prueba diaria) pueda saber de
// verdad si el aviso salio o no, no solo si la variable existe. Los demas
// usos (alertas en tiempo real durante un pedido real) simplemente ignoran
// el valor de regreso, como ya hacian -- no se rompe nada.
async function notificarDueno(mensaje) {
  try {
    const telefonoDueno = process.env.TELEFONO_DUENO;
    if (!telefonoDueno) {
      logger.warn("TELEFONO_DUENO no configurado -- no se pudo enviar alerta al dueno: " + mensaje.substring(0, 120));
      return { enviado: false, error: "TELEFONO_DUENO no esta configurada en Railway (Variables)." };
    }
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      return { enviado: false, error: "TWILIO_ACCOUNT_SID o TWILIO_AUTH_TOKEN no estan configuradas." };
    }

    const dest = normalizarTelefono(telefonoDueno);
    const origen = normalizarTelefono(process.env.TWILIO_PHONE_NUMBER);
    const client = require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    // SMS normal -- SIN el prefijo "whatsapp:" en from/to (eso es solo para
    // mensajes de WhatsApp). Usa el mismo numero de Twilio que ya tenias
    // configurado (TWILIO_PHONE_NUMBER); si ese numero no tiene SMS
    // habilitado en Twilio, esta llamada va a fallar con un error claro de
    // Twilio (lo vamos a ver en el resultado de "Probar sistema" si pasa).
    await client.messages.create({
      from: origen,
      to: dest,
      body: mensaje,
    });
    logger.info("Alerta SMS enviada al dueno: " + mensaje.substring(0, 80));
    return { enviado: true };
  } catch (error) {
    // Una alerta que falla NUNCA debe tumbar el flujo del pedido -- solo se
    // registra en los logs como ultimo recurso, y se regresa el detalle
    // para quien SI pueda mostrarlo (la prueba diaria).
    logger.error("Error enviando alerta SMS al dueno: " + error.message);
    return { enviado: false, error: error.message };
  }
}

module.exports = { notificarDueno };
