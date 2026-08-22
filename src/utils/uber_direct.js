// src/utils/uber_direct.js
// Integracion con Uber Direct (envio de repartidor por API, sin depender de
// repartidores propios ni de Grupo Telnet).
//
// Basado en documentacion oficial de Uber Direct:
// - Autenticacion: https://developer.uber.com/docs/deliveries/authentication
// - Crear cotizacion / entrega: https://developer.uber.com/docs/deliveries/get-started
// - Webhooks: https://developer.uber.com/docs/deliveries/guides/webhooks
//
// IMPORTANTE (igual que nos paso con Netpay): la documentacion de Uber a veces
// no coincide exactamente con la respuesta real -- la primera prueba real que
// hagamos puede revelar diferencias que haya que ajustar aqui.

const https = require("https");
const logger = require("./logger");

const AUTH_HOSTNAME = "auth.uber.com";
const API_HOSTNAME = "api.uber.com";

// ── Cache del access token (dura ~30 dias, no hace falta pedirlo en cada request) ──
let tokenCache = { token: null, expiraEn: 0 };

function requestJSON({ hostname, path, method, headers, body }) {
  return new Promise((resolve) => {
    const opciones = { hostname, path, method, headers, timeout: 10000 };
    const req = https.request(opciones, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ statusCode: res.statusCode, json, raw: data });
        } catch (e) {
          resolve({ statusCode: res.statusCode, json: null, raw: data, errorParseo: e.message });
        }
      });
    });
    req.on("timeout", () => { req.destroy(); resolve({ statusCode: 0, json: null, error: "Timeout" }); });
    req.on("error", (e) => resolve({ statusCode: 0, json: null, error: e.message }));
    if (body) req.write(body);
    req.end();
  });
}

// ── AUTENTICACION ──────────────────────────────────────────────────────────────
async function obtenerAccessToken() {
  const ahora = Date.now();
  if (tokenCache.token && ahora < tokenCache.expiraEn) {
    return tokenCache.token;
  }

  const clientId = process.env.UBER_DIRECT_CLIENT_ID;
  const clientSecret = process.env.UBER_DIRECT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    logger.error("UBER_DIRECT_CLIENT_ID / UBER_DIRECT_CLIENT_SECRET no configurados");
    return null;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    scope: "eats.deliveries",
  }).toString();

  const respuesta = await requestJSON({
    hostname: AUTH_HOSTNAME,
    path: "/oauth/v2/token",
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(body),
    },
    body,
  });

  if (respuesta.statusCode === 200 && respuesta.json?.access_token) {
    tokenCache = {
      token: respuesta.json.access_token,
      // Restamos 5 min de margen para renovar antes de que expire de verdad
      expiraEn: ahora + (respuesta.json.expires_in * 1000) - (5 * 60 * 1000),
    };
    logger.info("Token de Uber Direct obtenido correctamente");
    return tokenCache.token;
  }

  logger.error(`Error obteniendo token de Uber Direct: status=${respuesta.statusCode}, body=${respuesta.raw}`);
  return null;
}

// ── Arma el objeto de direccion en el formato que pide Uber (JSON como string) ──
function armarDireccionUber({ calle, ciudad, estado, codigoPostal }) {
  return JSON.stringify({
    street_address: [calle || ""],
    city: ciudad || "",
    state: estado || "",
    zip_code: codigoPostal || "",
    country: "MX",
  });
}

// ── COTIZACION (opcional pero recomendado antes de crear la entrega) ───────────
async function crearCotizacion({ pickup, dropoff }) {
  const token = await obtenerAccessToken();
  if (!token) return { exito: false, error: "No se pudo obtener token de Uber Direct" };

  const customerId = process.env.UBER_DIRECT_CUSTOMER_ID;
  const body = JSON.stringify({
    pickup_address: armarDireccionUber(pickup),
    dropoff_address: armarDireccionUber(dropoff),
    pickup_latitude: pickup.lat,
    pickup_longitude: pickup.lng,
    dropoff_latitude: dropoff.lat,
    dropoff_longitude: dropoff.lng,
  });

  const respuesta = await requestJSON({
    hostname: API_HOSTNAME,
    path: `/v1/customers/${customerId}/delivery_quotes`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "Content-Length": Buffer.byteLength(body),
    },
    body,
  });

  logger.info(`Cotizacion Uber Direct -> status: ${respuesta.statusCode}, body: ${respuesta.raw?.substring(0, 300)}`);

  if (respuesta.statusCode === 200 && respuesta.json?.id) {
    return {
      exito: true,
      quoteId: respuesta.json.id,
      fee: respuesta.json.fee, // en centavos
      moneda: respuesta.json.currency,
      dropoffEta: respuesta.json.dropoff_eta,
      duracionMin: respuesta.json.duration,
      raw: respuesta.json,
    };
  }

  return { exito: false, error: respuesta.json?.message || `Error ${respuesta.statusCode}`, raw: respuesta.json };
}

// ── CREAR ENTREGA (dispara el envio de un repartidor de Uber) ──────────────────
// testSpecifications: SOLO para pruebas -- activa "Robo Courier" (repartidor
// simulado, sin despachar a nadie de verdad). Segun documentacion oficial
// (https://developer.uber.com/docs/deliveries/guides/robocourier), Uber NO
// distingue automaticamente entre Test App y App real -- la simulacion SOLO
// se activa si se manda este parametro explicitamente en la peticion. Sin el,
// una entrega se procesa igual sea cual sea el tipo de credenciales. Ejemplo
// para pruebas: { robo_courier_specification: { mode: "auto" } }
async function crearEntrega({ pickup, dropoff, items, referencia, quoteId, testSpecifications }) {
  const token = await obtenerAccessToken();
  if (!token) return { exito: false, error: "No se pudo obtener token de Uber Direct" };