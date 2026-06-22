// src/webhook/whatsapp.js
const express = require("express");
const router = express.Router();
const NodeCache = require("node-cache");
const { procesarMensaje } = require("../agent/agente");
const logger = require("../utils/logger");
const fs = require("fs");
const path = require("path");

const conversaciones = new NodeCache({ stdTTL: 86400 });
const PEDIDOS_FILE = path.join(__dirname, "../../data/pedidos.json");
const RESERVACIONES_FILE = path.join(__dirname, "../../data/reservaciones.json");

function getTwilioClient() {
  return require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

function leerArchivo(ruta) {
  if (!fs.existsSync(ruta)) return [];
  try { return JSON.parse(fs.readFileSync(ruta, "utf8")); } catch { return []; }
}

function guardarArchivo(ruta, datos) {
  const dir = path.dirname(ruta);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(ruta, JSON.stringify(datos, null, 2));
}

router.post("/webhook", async (req, res) => {
  res.set("Content-Type", "text/xml").send("<Response></Response>");
  try {
    const telefono = req.body.From;
    if (!telefono) return;

    // ── Detectar si es una ubicación GPS de WhatsApp ──────────────────────
    const latitude  = req.body.Latitude;
    const longitude = req.body.Longitude;
    const esUbicacion = latitude && longitude;

    if (esUbicacion) {
      logger.info(`Ubicación GPS recibida de ${telefono}: ${latitude}, ${longitude}`);
      const mapsUrl = `https://maps.google.com/?q=${latitude},${longitude}`;

      // Buscar el último pedido de domicilio de este cliente y actualizarlo
      const pedidos = leerArchivo(PEDIDOS_FILE);
      const idx = pedidos.map((p, i) => ({ p, i }))
        .reverse()
        .find(({ p }) => p.telefono_cliente === telefono && p.tipo === "domicilio");

      if (idx) {
        pedidos[idx.i].ubicacion_gps = { latitude, longitude, maps_url: mapsUrl };
        pedidos[idx.i].actualizado = new Date().toISOString();
        guardarArchivo(PEDIDOS_FILE, pedidos);
        logger.info(`GPS guardado en pedido ${pedidos[idx.i].id}`);
      }

      // Confirmar al cliente y no procesar más
      await enviarMensaje(telefono, `📍 ¡Ubicación recibida! Ya la guardamos para que la sucursal sepa exactamente dónde entregarte. ¡Tu pedido está en camino! 🍣`);
      return;
    }

    // ── Mensaje de texto normal ───────────────────────────────────────────
    const mensaje = req.body.Body;
    if (!mensaje) return;
    logger.info(`Mensaje de ${telefono}: ${mensaje.substring(0, 80)}`);

    const historial = conversaciones.get(telefono) || [];
    const resultado = await procesarMensaje(historial, mensaje);
    conversaciones.set(telefono, resultado.historialActualizado);

    if (resultado.accion) await ejecutarAccion(resultado.accion, resultado.datos, telefono);
    await enviarMensaje(telefono, resultado.texto);

  } catch (error) {
    logger.error("Error webhook: " + error.message);
  }
});

router.get("/webhook", (req, res) => res.send("Webhook activo"));

async function ejecutarAccion(accion, datos, telefono) {
  try {
    if (accion === "REGISTRAR_PEDIDO") {
      const pedidos = leerArchivo(PEDIDOS_FILE);
      const pedido = {
        id: `PED-${Date.now()}`,
        fecha: new Date().toISOString(),
        estado: "pendiente",
        telefono_cliente: telefono,
        sucursal: datos.pedido?.sucursal || "Por confirmar",
        items: datos.pedido?.items || [],
        tipo: datos.pedido?.tipo || "sucursal",
        direccion: datos.pedido?.direccion || null,
        colonia: datos.pedido?.colonia || null,
        referencias: datos.pedido?.referencias || null,
        ubicacion_gps: null, // se llena cuando el cliente manda su ubicación
      };
      pedidos.push(pedido);
      guardarArchivo(PEDIDOS_FILE, pedidos);
      logger.info(`Pedido guardado: ${pedido.id}`);

      // Si es domicilio, pedir ubicación GPS después de confirmar el pedido
      if (pedido.tipo === "domicilio") {
        setTimeout(async () => {
          await enviarMensaje(telefono,
            `📍 *Una cosa más:* para asegurarnos de llegar exactamente a tu puerta, ¿podrías compartir tu ubicación por WhatsApp?\n\nEs opcional, pero ayuda mucho a nuestra sucursal. Solo toca el 📎 → *Ubicación* → *Enviar mi ubicación actual*.`
          );
        }, 2000); // pequeño delay para que llegue después del mensaje del agente
      }

    } else if (accion === "REGISTRAR_RESERVACION") {
      const reservaciones = leerArchivo(RESERVACIONES_FILE);
      const reservacion = {
        id: `RES-${Date.now()}`,
        fecha_registro: new Date().toISOString(),
        estado: "confirmada",
        telefono_cliente: telefono,
        ...datos.reservacion,
      };
      reservaciones.push(reservacion);
      guardarArchivo(RESERVACIONES_FILE, reservaciones);
      logger.info(`Reservación guardada: ${reservacion.id}`);

    } else if (accion === "ESCALAR_HUMANO") {
      logger.warn(`ESCALACIÓN para ${telefono}: ${datos.motivo}`);
    }
  } catch (error) {
    logger.error(`Error ejecutando acción ${accion}: ` + error.message);
  }
}

async function enviarMensaje(telefono, texto) {
  try {
    const client = getTwilioClient();
    await client.messages.create({
      from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
      to: telefono,
      body: texto,
    });
    logger.info(`Respuesta enviada a ${telefono}`);
  } catch (error) {
    logger.error(`Error enviando a ${telefono}: ` + error.message);
  }
}

module.exports = router;
