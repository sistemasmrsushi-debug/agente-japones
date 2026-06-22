// src/webhook/whatsapp.js
const express = require("express");
const router = express.Router();
const { procesarMensaje, detectarSucursalPorZona } = require("../agent/agente");
const logger = require("../utils/logger");
const db = require("../db/database");

function getTwilioClient() {
  return require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

function esConfirmacion(texto) {
  // Detecta confirmacion sin llamar a Groq — regex inteligente
  const t = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  // Negaciones explicitas
  if (/\b(no|otra|diferente|cambia|mejor|prefiero otra|ninguna)\b/.test(t)) return false;
  // Confirmaciones positivas — cualquier mensaje corto con tono afirmativo
  if (t.length <= 50 && /\b(si|ok|dale|bien|listo|claro|va|esa|ahi|perfecto|correcto|adelante|bueno|sale|andale|orale|sale|chevere|excelente|genial|de una|vamos|esa misma|desde ahi|desde esa|ahi mismo|la misma|ahi esta)\b/.test(t)) return true;
  // Mensaje muy corto sin negacion = probablemente confirmacion
  if (t.length <= 20 && !/\b(no|cual|donde|cuando|cuanto|que|como|quien)\b/.test(t)) return true;
  return false;
}

function pideDomicilio(texto) {
  const t = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /\b(domicilio|a mi casa|a casa|llevar|delivery|me lo llevan|me lo mandan|me traen)\b/.test(t);
}

function tieneDireccion(texto) {
  const t = texto.toLowerCase();
  return /\b(calle|avenida|av[. ]|col[. ]|colonia|blvd|boulevard|calzada|privada|cerrada|circuito|fracc|fraccionamiento|\d{5})\b/.test(t);
}

// Extrae items del historial buscando patrones de precio en texto del asistente
function extraerItemsDeTexto(historial) {
  for (let i = historial.length - 1; i >= 0; i--) {
    if (historial[i].role === "assistant") {
      const texto = historial[i].content;
      // Buscar patron: "Nombre cuesta $precio" o "Nombre ($precio)"
      const matches = [...texto.matchAll(/([A-Za-záéíóúÁÉÍÓÚñÑ\s\.]+?)\s*(?:cuesta|cuestan)?\s*\$\s*(\d+)/g)];
      if (matches.length > 0) {
        return matches.map(m => ({
          nombre: m[1].trim(),
          precio: parseInt(m[2]),
          cantidad: 1
        })).filter(i => i.nombre.length > 3 && i.precio > 0);
      }
    }
  }
  return [];
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

    const mensaje = req.body.Body;
    if (!mensaje) return;
    logger.info(`Msg de ${telefono}: ${mensaje.substring(0, 80)}`);

    // ── CASO 1: Confirmacion de sucursal (estado en DB) ───────────────────
    const estado = await db.obtenerEstadoPedido(telefono);
    if (estado && estado.fase === "esperando_confirmacion_sucursal" && esConfirmacion(mensaje)) {
      logger.info(`Confirmacion directa: ${telefono} -> ${estado.sucursal_sugerida}`);

      // Extraer items del historial sin llamar a Groq
      let items = estado.items;
      if (!items || items.length === 0) {
        const historial = await db.obtenerHistorial(telefono);
        // Buscar items en mensajes del asistente en el historial
        for (let i = historial.length - 1; i >= 0; i--) {
          if (historial[i].role === "assistant") {
            const match = historial[i].content.match(/\[PEDIDO\]([\s\S]*?)\[\/PEDIDO\]/i);
            if (match) {
              try {
                const datos = JSON.parse(match[1].trim());
                if (datos.pedido?.items?.length > 0) {
                  items = datos.pedido.items;
                  logger.info(`Items extraidos del historial: ${items.length}`);
                  break;
                }
              } catch(e) {}
            }
          }
        }
        // Si aun no hay items, buscar en el texto del historial por precios
        if (!items || items.length === 0) {
          items = extraerItemsDeTexto(historial);
        }
      }

      const pedido = {
        id: `PED-${Date.now()}`,
        fecha: new Date().toISOString(),
        estado: "pendiente",
        telefono_cliente: telefono,
        sucursal: estado.sucursal_sugerida,
        items: items,
        tipo: "domicilio",
        direccion: estado.direccion || null,
        colonia: estado.colonia || null,
        referencias: estado.referencias || null,
        ubicacion_gps: null,
      };
      await db.guardarPedido(pedido);
      await db.eliminarEstadoPedido(telefono);

      const total = items.reduce((s, i) => s + (i.precio * (i.cantidad || 1)), 0);
      const itemsTexto = items.length > 0
        ? items.map(i => `${i.cantidad || 1}x ${i.nombre} ($${i.precio})`).join("\n")
        : "Pedido registrado";

      await enviarMensaje(telefono,
        `Perfecto! Tu pedido ha sido registrado exitosamente!\n\nID de pedido: ${pedido.id}\n\n${itemsTexto}\n\nTotal: $${total}\nSucursal: ${estado.sucursal_sugerida}\nDireccion: ${estado.direccion}\n\nTiempo estimado: 40 min. Envio GRATIS! Puedes preguntar por el estatus de tu pedido en cualquier momento.`
      );
      setTimeout(async () => {
        await enviarMensaje(telefono,
          "Una cosa mas: podrias compartir tu ubicacion por WhatsApp para que lleguen exactamente a tu puerta? Toca el clip -> Ubicacion -> Enviar mi ubicacion actual. Es opcional."
        );
      }, 3000);
      return;
    }

    // ── CASO 2: Domicilio + direccion en mismo mensaje ────────────────────
    if (pideDomicilio(mensaje) && tieneDireccion(mensaje)) {
      const zonaDetectada = detectarSucursalPorZona(mensaje);
      if (zonaDetectada) {
        logger.info(`Domicilio+direccion detectados. Zona: ${zonaDetectada}`);
        const historial = await db.obtenerHistorial(telefono);
        const resultado = await procesarMensaje(historial, mensaje);
        await db.guardarHistorial(telefono, resultado.historialActualizado);

        // Guardar estado en DB (persiste reinicios)
        const items = resultado.datos?.pedido?.items || null;
        await db.guardarEstadoPedido(telefono, {
          fase: "esperando_confirmacion_sucursal",
          sucursal_sugerida: zonaDetectada,
          items: items,
          direccion: mensaje,
          colonia: null,
          referencias: null,
        });
        logger.info(`Estado guardado en DB para ${telefono}: ${zonaDetectada}, items: ${items ? items.length : 0}`);

        await enviarMensaje(telefono,
          `La sucursal mas cercana a tu zona es *${zonaDetectada}*. Te enviamos desde ahi o prefieres otra?`
        );
        return;
      }
    }

    // ── CASO 3: Flujo normal con Groq ─────────────────────────────────────
    const historial = await db.obtenerHistorial(telefono);
    const resultado = await procesarMensaje(historial, mensaje);
    await db.guardarHistorial(telefono, resultado.historialActualizado);

    // Si el agente sugiere sucursal para domicilio -> guardar estado en DB
    if (resultado.sucursalSugerida && resultado.itemsPedido) {
      await db.guardarEstadoPedido(telefono, {
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
      if (resultado.accion === "REGISTRAR_PEDIDO") {
        await db.eliminarEstadoPedido(telefono);
      }
    } else if (resultado.sucursalSugerida && resultado.itemsPedido && resultado.itemsPedido.length > 0) {
      // Agente sugirió sucursal pero aun no confirma — guardar estado
      await db.guardarEstadoPedido(telefono, {
        fase: "esperando_confirmacion_sucursal",
        sucursal_sugerida: resultado.sucursalSugerida,
        items: resultado.itemsPedido,
        direccion: resultado.direccionCliente,
        colonia: resultado.coloniaCliente,
        referencias: resultado.referenciasCliente,
      });
      logger.info(`Estado guardado: ${telefono} -> ${resultado.sucursalSugerida}`);
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
