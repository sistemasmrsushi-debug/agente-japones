// src/utils/prueba_diaria.js
// =============================================
// NUEVO (06-oct-2026, pedido por Diego): despues del caso real donde un
// pago se confirmo pero el aviso nunca llego (el webhook de Netpay se habia
// quedado registrado a una URL vieja, sin que nadie se diera cuenta hasta
// que un cliente se quejo), Diego pidio una prueba interna diaria que
// confirme que todo el flujo sigue funcionando, y que le llegue el
// resultado por WhatsApp -- para enterarse de un problema ANTES de que un
// cliente real lo sufra, en vez de despues.
//
// Que revisa (conectividad, no un pedido real de un cliente):
//   1. Base de datos: que se pueda consultar la tabla de pedidos.
//   2. Netpay: que se pueda generar un link de pago de prueba (confirma
//      que las credenciales y el formato de la solicitud siguen validos).
//      Es una sesion de $1 MXN que nadie va a pagar -- no se guarda como
//      pedido real, no aparece en el dashboard ni en reportes.
//   3. Webhook de Netpay: se vuelve a registrar la URL actual (ya se hace
//      en cada arranque del servidor, ver index.js -- esto es un respaldo
//      extra para cuando el servidor lleva muchos dias sin reiniciarse).
//   4. WhatsApp: el reporte mismo viaja por WhatsApp a Diego, asi que si le
//      llega, ya se confirmo que Twilio funciona.
//
// Si CUALQUIER paso falla, el reporte lo dice explicitamente -- la idea es
// que un dia "todo bien" sea un mensaje corto y tranquilizador, y un dia con
// problemas se note de inmediato.
// =============================================
const logger = require("./logger");
const db = require("../db/database");
const { generarLinkPago } = require("./netpay");
const { registrarWebhook } = require("./netpay");
const { notificarDueno } = require("./alertas");

async function revisarBaseDeDatos() {
  try {
    await db.obtenerPedidos(null, "gerente");
    return { ok: true };
  } catch (error) {
    return { ok: false, detalle: error.message };
  }
}

async function revisarNetpay() {
  try {
    const resultado = await generarLinkPago({
      items: [{ nombre: "Prueba interna diaria (ignorar)", precio: 1, cantidad: 1 }],
      referencia: `PRUEBA-DIARIA-${Date.now()}`,
      telefono: "whatsapp:+525500000000",
      nombreCliente: "Prueba Interna",
      direccion: "Prueba Interna 1",
      colonia: "Centro",
      municipio: "Ciudad de Mexico",
      estadoDireccion: "Ciudad de Mexico",
      codigoPostal: "00000",
    });
    if (resultado.exito) return { ok: true };
    return { ok: false, detalle: resultado.error };
  } catch (error) {
    return { ok: false, detalle: error.message };
  }
}

async function revisarRegistroWebhook() {
  try {
    if (!process.env.APP_PUBLIC_DOMAIN && !process.env.RAILWAY_PUBLIC_DOMAIN) {
      return { ok: false, detalle: "APP_PUBLIC_DOMAIN (ni RAILWAY_PUBLIC_DOMAIN) no esta configurada" };
    }
    const resultado = await registrarWebhook();
    if (resultado.statusCode >= 200 && resultado.statusCode < 300) return { ok: true };
    return { ok: false, detalle: `status ${resultado.statusCode}` };
  } catch (error) {
    return { ok: false, detalle: error.message };
  }
}

async function ejecutarPruebaDiaria() {
  logger.info("Ejecutando prueba interna diaria...");

  const [bd, netpay, webhook] = await Promise.all([
    revisarBaseDeDatos(),
    revisarNetpay(),
    revisarRegistroWebhook(),
  ]);

  const todoBien = bd.ok && netpay.ok && webhook.ok;

  let mensaje;
  if (todoBien) {
    mensaje = `✅ Prueba diaria Mr. Sushi: todo funcionando normal.\n\nBase de datos: OK\nNetpay (generar link): OK\nWebhook de Netpay: registrado OK`;
  } else {
    const linea = (nombre, r) => `${nombre}: ${r.ok ? "OK" : `❌ FALLO (${r.detalle})`}`;
    mensaje = `⚠️ Prueba diaria Mr. Sushi: hay un problema.\n\n${linea("Base de datos", bd)}\n${linea("Netpay (generar link)", netpay)}\n${linea("Webhook de Netpay", webhook)}\n\nRevisa esto antes de que afecte a un cliente real.`;
  }

  logger.info(`Resultado de prueba diaria: ${todoBien ? "OK" : "CON FALLOS"}`);
  await notificarDueno(mensaje);
}

// Corre cada 10 min y dispara la prueba una sola vez al dia, cuando la hora
// local (America/Mexico_City) llega a HORA_OBJETIVO. No se usa un simple
// setInterval de 24h desde el arranque porque cada redeploy en Railway
// reiniciaria la cuenta desde una hora distinta -- asi siempre es a la
// misma hora, sin importar cuando reinicio el servidor.
const HORA_OBJETIVO = 8; // 8:00 AM hora de Mexico
let ultimaFechaEjecutada = null;

function horaLocalMexico() {
  // Intl con timeZone evita tener que instalar o mantener una tabla de
  // horarios de verano -- Node ya trae los datos de zonas horarias.
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Mexico_City",
    hour: "2-digit",
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const obj = {};
  for (const p of partes) obj[p.type] = p.value;
  return { hora: Number(obj.hour), fecha: `${obj.year}-${obj.month}-${obj.day}` };
}

function iniciarPruebaDiaria() {
  logger.info(`Prueba interna diaria activa -> se ejecuta ~${HORA_OBJETIVO}:00 hora CDMX, reporta por WhatsApp al dueno`);
  setInterval(async () => {
    const { hora, fecha } = horaLocalMexico();
    if (hora === HORA_OBJETIVO && ultimaFechaEjecutada !== fecha) {
      ultimaFechaEjecutada = fecha;
      try {
        await ejecutarPruebaDiaria();
      } catch (error) {
        logger.error("Error ejecutando prueba diaria: " + error.message);
      }
    }
  }, 10 * 60 * 1000);
}

module.exports = { iniciarPruebaDiaria, ejecutarPruebaDiaria };
