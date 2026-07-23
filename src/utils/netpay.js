// src/utils/netpay.js
// Integracion con Netpay Payment Link + Webhook
// Basado en documentacion oficial entregada por Netpay Integraciones

const https = require("https");
const logger = require("./logger");

// Hostname correcto segun documentacion de Netpay (sandbox)
const HOSTNAME_SANDBOX = "gateway-154.netpaydev.com";
const HOSTNAME_PROD = "suite.netpay.com.mx";

function getHostname() {
  return process.env.NETPAY_ENV === "production" ? HOSTNAME_PROD : HOSTNAME_SANDBOX;
}

// ── GENERAR LINK DE PAGO ──────────────────────────────────────────────────────
async function generarLinkPago({ items, referencia, telefono, nombreCliente, direccion, colonia, municipio, estadoDireccion, codigoPostal, secretKey }) {
  return new Promise((resolve, reject) => {
    const key = secretKey || process.env.NETPAY_SECRET_KEY;

    if (!key) {
      logger.error("NETPAY_SECRET_KEY no esta configurada");
      return resolve({ exito: false, error: "Falta configurar NETPAY_SECRET_KEY" });
    }

    // Netpay espera los productos como arreglo "lineItems" (name, amount, quantity, currency),
    // no como un monto plano. Sin esto, el checkout/session responde 404 "StoreUser not found"
    // en vez de un error de validacion claro (confirmado comparando contra una prueba en Postman
    // que si funciono, usando la misma llave, pero con lineItems en vez de "amount").
    const lineItems = (items || []).map(i => ({
      name: i.nombre,
      amount: i.precio,
      quantity: i.cantidad || 1,
      currency: "MXN",
    }));

    // Telefono limpio, sin el prefijo "whatsapp:"
    const telefonoLimpio = (telefono || "").replace("whatsapp:", "").replace("+", "");

    // Nombre y apellido separados lo mejor posible a partir del nombre que dio
    // el cliente en la conversacion (ej. "Diego Gonzalez" -> "Diego" / "Gonzalez").
    const partesNombre = (nombreCliente || "Cliente Mr. Sushi").trim().split(/\s+/);
    const firstName = partesNombre[0] || "Cliente";
    const lastName = partesNombre.slice(1).join(" ") || "Mr. Sushi";

    // Precargar los datos de facturacion que ya tenemos de la conversacion, para
    // que el cliente no tenga que volver a escribir todo en el checkout de Netpay.
    //
    // IMPORTANTE sobre el email: en el ambiente de SANDBOX, Netpay usa el correo
    // (no la tarjeta) para decidir si la transaccion se acepta, se rechaza o pasa
    // por 3DS -- ver "Matriz de certificacion Netpay". Por eso aqui se usa
    // accept@netpay.com.mx mientras seguimos en sandbox, para poder probar pagos
    // aprobados de verdad. TODO antes de produccion: reemplazar esto por el email
    // real del cliente (todavia no lo capturamos en la conversacion de WhatsApp).
    const emailFacturacion = process.env.NETPAY_ENV === "production"
      ? "cliente@mrsushi.mx" // placeholder hasta que capturemos el email real del cliente
      : "accept@netpay.com.mx"; // correo de prueba de Netpay para transacciones aceptadas

    const billing = {
      firstName,
      lastName,
      email: emailFacturacion,
      phone: telefonoLimpio,
      address: {
        street1: direccion || "",
        street2: "",
        city: municipio || "",
        state: estadoDireccion || "",
        postalCode: codigoPostal || "",
        country: "Mexico",
      },
    };

    const body = JSON.stringify({
      successUrl: `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/pago/exitoso`,
      cancelUrl: `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/pago/cancelado`,
      customerEmail: billing.email,
      customerName: `${firstName} ${lastName}`,
      paymentMethodTypes: ["card"],
      merchantRefCode: referencia,
      lineItems,
      billing,
      linkType: "NETPAY_CHECKOUT",
    });

    logger.info(`Generando link de pago Netpay -> hostname: ${getHostname()}, referencia: ${referencia}, items: ${lineItems.length}`);

    const options = {
      hostname: getHostname(),
      path: "/gateway-ecommerce/v3.2/checkout/session/",
      method: "POST",
      timeout: 10000, // 10 segundos maximo
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
        logger.info(`Respuesta Netpay checkout/session -> status: ${res.statusCode}, body: ${data.substring(0, 300)}`);
        try {
          const json = JSON.parse(data);
          // Netpay responde 201 (Created) cuando genera el link correctamente, no 200.
          // Y el link viene en "hostedCheckoutUrl", no en "shortUrl" (se dejaba shortUrl
          // como respaldo por si en otra version de la API si viene con ese nombre).
          const link = json.hostedCheckoutUrl || json.shortUrl;
          if ((res.statusCode === 200 || res.statusCode === 201) && link) {
            logger.info(`Link de pago generado para ${referencia}: ${link}`);
            resolve({
              exito: true,
              linkPago: link,
              sessionId: json.sessionId || json.id || null,
              raw: json,
            });
          } else {
            logger.error(`Netpay rechazo la solicitud de link: ${data}`);
            resolve({ exito: false, error: json.message || `Error ${res.statusCode}`, raw: json });
          }
        } catch(e) {
          logger.error("Error parseando respuesta Netpay: " + e.message + " | raw: " + data.substring(0, 300));
          resolve({ exito: false, error: "Respuesta invalida de Netpay" });
        }
      });
    });

    req.on("timeout", () => {
      logger.error("Timeout conectando con Netpay (10s)");
      req.destroy();
      resolve({ exito: false, error: "Timeout conectando con Netpay" });
    });

    req.on("error", (e) => {
      logger.error("Error conectando con Netpay: " + e.message);
      resolve({ exito: false, error: e.message });
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
