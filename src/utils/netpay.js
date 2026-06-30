// src/utils/netpay.js
// Integracion con Netpay Payment Link + Webhook
// Basado en documentacion oficial entregada por Netpay Integraciones

const https = require("https");
const logger = require("./logger");

const BASE_URL_SANDBOX = "ecommerce.netpay.com.mx";
const BASE_URL_PROD = "suite.netpay.com.mx";

function getBaseUrl() {
  return process.env.NETPAY_ENV === "production" ? BASE_URL_PROD : BASE_URL_SANDBOX;
}

// ── GENERAR LINK DE PAGO ──────────────────────────────────────────────────────
// monto: numero en pesos (ej. 423)
// referencia: ID unico del pedido (ej. "PED-1782174362803")
// secretKey: opcional, si se quiere usar una llave distinta a la default (por sucursal)
async function generarLinkPago({ monto, referencia, telefono, secretKey }) {
  return new Promise((resolve, reject) => {
    const key = secretKey || process.env.NETPAY_SECRET_KEY;

    const body = JSON.stringify({
      successUrl: `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/pago/exitoso`,
      cancelUrl: `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/pago/cancelado`,
      customerEmail: "cliente@mrsushi.mx",
      customerName: telefono || "Cliente Mr. Sushi",
      paymentMethodTypes: ["card"],
      merchantRefCode: referencia,
      amount: monto,
    });

    const options = {
      hostname: getBaseUrl(),
      path: "/gateway-ecommerce/v3.2/checkout/session/",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": key,
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode === 200 && json.shortUrl) {
            logger.info(`Link de pago generado para ${referencia}: ${json.shortUrl}`);
            resolve({
              exito: true,
              linkPago: json.shortUrl,
              sessionId: json.sessionId || null,
              raw: json,
            });
          } else {
            logger.error(`Netpay rechazo la solicitud de link: ${data}`);
            resolve({ exito: false, error: json.message || "Error generando link de pago", raw: json });
          }
        } catch(e) {
          logger.error("Error parseando respuesta Netpay: " + e.message);
          reject(e);
        }
      });
    });

    req.on("error", (e) => {
      logger.error("Error conectando con Netpay: " + e.message);
      reject(e);
    });

    req.write(body);
    req.end();
  });
}

// ── CONSULTAR ESTATUS DE TRANSACCION (respaldo si webhook falla) ──────────────
// Equivalente a la funcion consultaEstatus() del PHP de Netpay
async function consultarEstatusTransaccion(transactionId, secretKey) {
  return new Promise((resolve, reject) => {
    const key = secretKey || process.env.NETPAY_SECRET_KEY;

    const options = {
      hostname: "gateway-154.netpaydev.com",
      path: `/gateway-ecommerce/v3/transactions/${transactionId}`,
      method: "GET",
      headers: { "Content-Type": "application/json", "Authorization": key },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          logger.info(`Estatus consultado para transaccion ${transactionId}: ${json.status}`);
          resolve(json);
        } catch(e) {
          logger.error("Error consultando estatus: " + e.message);
          reject(e);
        }
      });
    });

    req.on("error", (e) => {
      logger.error("Error en consulta de estatus: " + e.message);
      reject(e);
    });

    req.end();
  });
}

// ── REGISTRAR URL DE WEBHOOK ──────────────────────────────────────────────────
// Se ejecuta UNA SOLA VEZ para dar de alta la URL donde Netpay mandara las notificaciones
async function registrarWebhook(secretKey) {
  return new Promise((resolve, reject) => {
    const key = secretKey || process.env.NETPAY_SECRET_KEY;
    const webhookUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/webhook/netpay`;

    const body = JSON.stringify({ webhook: webhookUrl });

    const options = {
      hostname: "gateway-154.netpaydev.com",
      path: "/gateway-ecommerce/v3/webhooks/",
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": key,
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        logger.info(`Webhook registrado en Netpay: ${webhookUrl} -> Status ${res.statusCode}`);
        resolve({ statusCode: res.statusCode, data });
      });
    });

    req.on("error", (e) => {
      logger.error("Error registrando webhook: " + e.message);
      reject(e);
    });

    req.write(body);
    req.end();
  });
}

module.exports = { generarLinkPago, consultarEstatusTransaccion, registrarWebhook };
