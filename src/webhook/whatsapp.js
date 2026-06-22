// src/webhook/whatsapp.js
const express = require("express");
const router = express.Router();
const NodeCache = require("node-cache");
const { procesarMensaje, detectarSucursalPorZona } = require("../agent/agente");
const logger = require("../utils/logger");
const db = require("../db/database");

const estadosPedido = new NodeCache({ stdTTL: 3600 });

function getTwilioClient() {
  return require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

// Detecta confirmacion corta del cliente
function esConfirmacion(texto) {
  const t = texto.toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const frases = ["si","ahi","esa","ok","dale","listo","adelante","perfecto",
    "ahi esta bien","esa esta bien","de ahi","me parece bien","claro","va",
    "por favor","esta bien","ahi por favor","de esa","bueno","sale","andale",
    "desde ahi","esa sucursal","si por favor","ok por favor"];
  return frases.some(f => t === f || t.startsWith(f + " ") || t.endsWith(" " + f));
}

// Detecta si el mensaje pide domicilio
function pideDomicilio(texto) {
  const t = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /\b(domicilio|a mi casa|a casa|llevar|delivery|me lo llevan|me lo mandan|me traen)\b/.test(t);
}

// Detecta si el mensaje contiene una direccion
function tieneDireccion(texto) {
  const t = texto.toLowerCase();
  return /\b(calle|avenida|av[. ]|col[. ]|colonia|blvd|boulevard|calzada|privada|cerrada|circuito|fracc|fraccionamiento|\d{5})\b/.test(t);
}

// Extrae productos del historial reciente
function extraerItemsDelHistorial(historial) {
  // Busca en el ultimo mensaje del asistente los items confirmados
  for (let i = historial.length - 1; i >= 0; i--) {
    if (historial[i].role === "assistant") {
      const texto = historial[i].content;
      // Busca patron de JSON de pedido en el historial
      const match = texto.match(/\[PEDIDO\]([\s\S]*?)\[\/PEDIDO\]/i);
      if (match) {
        try {
          const datos = JSON.parse(match[1].trim());
          return datos.pedido?.items || null;
        } catch(e) {}
      }
    }
  }
  return null;
}

router.post("/webhook", async (req, res) => {
  res.set("Content-Type", "text/xml").send("<Response></Response>");
  try {
    const telefono = req.body.From;
    if (!telefono) return;

    // ── Ubicacion GPS ─────────────────────────────────────────────────────
    const latitude  = req.body.Latitude;
    const longitude = req.body.Longitude;
    if (latitude && longitude) {
      logger.info(`GPS recibido de ${telefono}: ${latitude}, ${longitude}`);
      const mapsUrl = `https://maps.google.com/?q=${latitude},${longitude}`;
      await db.actualizarGPSPedido(telefono, { latitude, longitude, maps_url: mapsUrl });
      await enviarMensaje(telefono, "Ubicacion recibida! Ya la guardamos para la entrega.");
      return;
    }

    // ── Mensaje de texto ──────────────────────────────────────────────────
    const mensaje = req.body.Body;
    if (!mensaje) return;
    logger.info(`Msg de ${telefono}: ${mensaje.substring(0, 80)}`);

    // ── CASO 1: Confirmacion de sucursal sugerida ─────────────────────────
    const estado = estadosPedido.get(telefono);
    if (estado && estado.fase === "esperando_confirmacion_sucursal" && esConfirmacion(mensaje)) {
      logger.info(`Confirmacion directa: ${telefono} -> ${estado.sucursal_sugerida}`);
      const pedido = {
        id: `PED-${Date.now()}`,
        fecha: new Date().toISOString(),
        estado: "pendiente",
        telefono_cliente: telefono,
        sucursal: estado.sucursal_sugerida,
        items: estado.items,
        tipo: "domicilio",
        direccion: estado.direccion || null,
        colonia: estado.colonia || null,
        referencias: estado.referencias || null,
        ubicacion_gps: null,
      };
      await db.guardarPedido(pedido);
      estadosPedido.del(telefono);
      const total = estado.items.reduce((s, i) => s + (i.precio * (i.cantidad || 1)), 0);
      const itemsTexto = estado.items.map(i => `${i.cantidad || 1}x ${i.nombre} ($${i.precio})`).join("\n");
      await enviarMensaje(telefono,
        `Perfecto! Tu pedido esta registrado:\n${itemsTexto}\n\nTotal: $${total}\nSucursal: ${estado.sucursal_sugerida}\nDireccion: ${estado.direccion}\n\nTiempo estimado: 40 min. Envio GRATIS!`
      );
      setTimeout(async () => {
        await enviarMensaje(telefono,
          "Una cosa mas: podrias compartir tu ubicacion por WhatsApp para que la sucursal llegue exactamente a tu puerta? Toca el clip -> Ubicacion -> Enviar mi ubicacion actual. Es opcional."
        );
      }, 3000);
      return;
    }

    // ── CASO 2: Mensaje tiene domicilio + direccion juntos ────────────────
    // Manejamos esto en codigo para no depender de la IA
    if (pideDomicilio(mensaje) && tieneDireccion(mensaje)) {
      const zonaDetectada = detectarSucursalPorZona(mensaje);
      const historial = await db.obtenerHistorial(telefono);

      if (zonaDetectada) {
        logger.info(`Domicilio+direccion detectados. Zona: ${zonaDetectada}`);
        // Llamar a Groq para que confirme el pedido y extraiga items
        const resultado = await procesarMensaje(historial, mensaje);
        await db.guardarHistorial(telefono, resultado.historialActualizado);

        // Extraer items del resultado si el agente los detectó
        const items = resultado.datos?.pedido?.items || extraerItemsDelHistorial(resultado.historialActualizado);

        if (items && items.length > 0) {
          // Guardar estado para confirmacion rapida
          estadosPedido.set(telefono, {
            fase: "esperando_confirmacion_sucursal",
            sucursal_sugerida: zonaDetectada,
            items: items,
            direccion: mensaje,
            colonia: null,
            referencias: null,
          });
          const total = items.reduce((s, i) => s + (i.precio * (i.cantidad || 1)), 0);
          const itemsTexto = items.map(i => `${i.cantidad || 1}x ${i.nombre} ($${i.precio})`).join("\n");
          await enviarMensaje(telefono,
            `${itemsTexto}\n\nTotal: $${total}\n\nLa sucursal mas cercana a tu zona es *${zonaDetectada}*. Te enviamos desde ahi o prefieres otra?`
          );
        } else {
          // No se pudieron extraer items, dejar que Groq maneje
          await enviarMensaje(telefono, resultado.texto);
          if (resultado.accion) await ejecutarAccion(resultado.accion, resultado.datos, telefono);
        }
        return;
      }
    }

    // ── CASO 3: Flujo normal con Groq ─────────────────────────────────────
    const historial = await db.obtenerHistorial(telefono);
    const resultado = await procesarMensaje(historial, mensaje);
    await db.guardarHistorial(telefono, resultado.historialActualizado);

    // Si el agente sugiere sucursal para domicilio -> guardar estado
    if (resultado.sucursalSugerida && resultado.itemsPedido) {
      estadosPedido.set(telefono, {
        fase: "esperando_confirmacion_sucursal",
        sucursal_sugerida: resultado.sucursalSugerida,
        items: resultado.itemsPedido,
        direccion: resultado.direccionCliente,
        colonia: resultado.coloniaCliente,
        referencias: resultado.referenciasCliente,
      });
    }

    await enviarMensaje(telefono, resultado.texto);

    if (resultado.accion) {
      await ejecutarAccion(resultado.accion, resultado.datos, telefono);
      if (resultado.accion === "REGISTRAR_PEDIDO") estadosPedido.del(telefono);
    }

  } catch (error) {
    logger.error("Error webhook: " + error.message);
  }
});

router.get("/webhook", (req, res) => res.send("Webhook activo"));

async function ejecutarAccion(accion, datos, telefono) {
  try {
    if (accion === "REGISTRAR_PEDIDO") {
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
        ubicacion_gps: null,
      };
      await db.guardarPedido(pedido);
      logger.info(`Pedido en DB: ${pedido.id} -> ${pedido.sucursal}`);
      if (pedido.tipo === "domicilio") {
        setTimeout(async () => {
          await enviarMensaje(telefono,
            "Una cosa mas: podrias compartir tu ubicacion por WhatsApp? Toca el clip -> Ubicacion -> Enviar mi ubicacion actual. Es opcional."
          );
        }, 3000);
      }
    } else if (accion === "REGISTRAR_RESERVACION") {
      const reservacion = {
        id: `RES-${Date.now()}`,
        fecha_registro: new Date().toISOString(),
        estado: "confirmada",
        telefono_cliente: telefono,
        ...datos.reservacion,
      };
      await db.guardarReservacion(reservacion);
      logger.info(`Reservacion en DB: ${reservacion.id}`);
    } else if (accion === "ESCALAR_HUMANO") {
      logger.warn(`ESCALACION para ${telefono}: ${datos.motivo}`);
    }
  } catch (error) {
    logger.error(`Error accion ${accion}: ` + error.message);
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
    logger.info(`Enviado a ${telefono}`);
  } catch (error) {
    logger.error(`Error enviando: ` + error.message);
  }
}

module.exports = router;
