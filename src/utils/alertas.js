// src/utils/alertas.js
// =============================================
// Alertas en tiempo real al dueno (Diego) por WhatsApp, cuando falla una
// integracion critica (Netpay, Uber Direct, Google Maps) durante un pedido
// REAL de un cliente. Antes, estas fallas solo quedaban registradas en los
// logs de Railway -- nadie se enteraba a menos que alguien revisara los
// logs a mano o el cliente reportara el problema (como paso el 23-sep-2026
// con un pedido por GPS que se quedo sin link de pago). Pedido por Diego.
//
// Requiere la variable de entorno TELEFONO_DUENO (numero de WhatsApp de
// Diego, con lada, ej. 5511223344 o +525511223344). Si no esta configurada,
// solo se deja constancia en los logs -- esto es una alerta adicional,
// nunca debe bloquear ni afectar el flujo real del pedido del cliente.
// =============================================
const logger = require("./logger");

// NUEVO (13-oct-2026, reportado por Diego: la prueba diaria decia "todo
// bien" pero el WhatsApp nunca llegaba): el formato que pide Twilio para
// numeros de WhatsApp es E.164 (obligatorio el "+" al inicio, ej.
// +525511223344) -- pero el comentario de arriba (y como Diego lo configuro
// en Railway) nunca pedia el "+". Con el "+" faltante, Twilio rechaza el
// numero, notificarDueno() lo atrapaba en el catch, y ese error SOLO
// quedaba en los logs de Railway -- nunca llegaba a Diego de ninguna forma,
// ni por WhatsApp (obviamente) ni en el dashboard (el boton "Probar
// sistema" solo revisaba que la variable EXISTIERA, no que el envio
// funcionara de verdad). Esta funcion ahora arregla el formato sola (le
// agrega el "+" si falta) para no depender de que quede escrito exactamente
// bien en Railway.
function normalizarWhatsapp(numero) {
  let limpio = String(numero || "").replace(/^whatsapp:/, "").trim();
  limpio = limpio.replace(/[\s\-()]/g, ""); // quita espacios, guiones, parentesis
  if (limpio && !limpio.startsWith("+")) limpio = "+" + limpio;
  return limpio ? `whatsapp:${limpio}` : null;
}

// Ahora regresa { enviado: true } o { enviado: false, error: "..." } en vez
// de nada, para que quien la llame (ej. la prueba diaria) pueda saber de
// verdad si el WhatsApp salio o no, no solo si la variable existe. Los
// demas usos (alertas en tiempo real durante un pedido real) simplemente
// ignoran el valor de regreso, como ya hacian -- no se rompe nada.
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

    const dest = normalizarWhatsapp(telefonoDueno);
    const client = require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
      to: dest,
      body: mensaje,
    });
    logger.info("Alerta enviada al dueno: " + mensaje.substring(0, 80));
    return { enviado: true };
  } catch (error) {
    // Una alerta que falla NUNCA debe tumbar el flujo del pedido -- solo se
    // registra en los logs como ultimo recurso, y se regresa el detalle
    // para quien SI pueda mostrarlo (la prueba diaria).
    logger.error("Error enviando alerta al dueno: " + error.message);
    return { enviado: false, error: error.message };
  }
}

module.exports = { notificarDueno };
