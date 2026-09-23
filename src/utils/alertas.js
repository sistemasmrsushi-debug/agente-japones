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
// Diego, con lada, sin espacios, ej. 5511223344). Si no esta configurada,
// solo se deja constancia en los logs -- esto es una alerta adicional,
// nunca debe bloquear ni afectar el flujo real del pedido del cliente.
// =============================================
const logger = require("./logger");

async function notificarDueno(mensaje) {
  try {
    const telefonoDueno = process.env.TELEFONO_DUENO;
    if (!telefonoDueno) {
      logger.warn("TELEFONO_DUENO no configurado -- no se pudo enviar alerta al dueno: " + mensaje.substring(0, 120));
      return;
    }
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return;

    const dest = telefonoDueno.startsWith("whatsapp:") ? telefonoDueno : `whatsapp:${telefonoDueno}`;
    const client = require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
      to: dest,
      body: mensaje,
    });
    logger.info("Alerta enviada al dueno: " + mensaje.substring(0, 80));
  } catch (error) {
    // Una alerta que falla NUNCA debe tumbar el flujo del pedido -- solo se
    // registra en los logs como ultimo recurso.
    logger.error("Error enviando alerta al dueno: " + error.message);
  }
}

module.exports = { notificarDueno };
