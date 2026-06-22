// src/webhook/whatsapp.js
const express = require("express");
const router = express.Router();
const { procesarMensaje, detectarSucursalPorZona, buscarPlatillo } = require("../agent/agente");
const logger = require("../utils/logger");
const db = require("../db/database");

function getTwilioClient() {
  return require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

// ── Detecta confirmacion simple ───────────────────────────────────────────────
function esConfirmacion(texto) {
  const t = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  // Negaciones explicitas
  if (/\b(no|otra|diferente|cambia|prefiero|ninguna|quiero cambiar)\b/.test(t)) return false;
  // Confirmaciones
  if (/\b(si|ok|dale|bien|listo|claro|va|esa|ahi|perfecto|correcto|adelante|bueno|sale|andale|orale|excelente|desde ahi|esa misma|ahi mismo|ahi esta|de ahi)\b/.test(t)) return true;
  // Mensaje muy corto sin negacion ni pregunta
  if (t.length <= 20 && !/\b(no|cual|donde|cuando|cuanto|que|como|quien|por)\b/.test(t)) return true;
  return false;
}

// ── Detecta si el mensaje pide domicilio ──────────────────────────────────────
function pideDomicilio(texto) {
  const t = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /\b(domicilio|a mi casa|a casa|delivery|me lo llevan|me traen|enviar|envio a)\b/.test(t);
}

// ── Detecta si el mensaje tiene una direccion ─────────────────────────────────
function tieneDireccion(texto) {
  return /\b(calle|avenida|av[. ]|col[. ]|colonia|blvd|calzada|privada|cerrada|circuito|fracc|\d{5})\b/i.test(texto);
}

// ── Extrae items del historial con precios REALES del menu ────────────────────
function extraerItemsConPreciosReales(historial) {
  const items = [];
  for (let i = historial.length - 1; i >= 0; i--) {
    if (historial[i].role === "assistant") {
      const texto = historial[i].content;
      // Buscar nombres de platillos mencionados y verificar en el menu
      const matches = [...texto.matchAll(/([A-Za-záéíóúÁÉÍÓÚñÑ\s\.]+?)\s*\$\s*(\d+)/g)];
      for (const m of matches) {
        const nombre = m[1].trim();
        if (nombre.length > 3) {
          const platillo = buscarPlatillo(nombre);
          if (platillo && !items.find(x => x.nombre === platillo.nombre)) {
            items.push({ nombre: platillo.nombre, precio: platillo.precio, cantidad: 1 });
          }
        }
      }
      if (items.length > 0) break;
    }
  }
  return items;
}

router.post("/webhook", async (req, res) => {
  res.set("Content-Type", "text/xml").send("<Response></Response>");
  try {
    const telefono = req.body.From;
    if (!telefono) return;

    // ── GPS ───────────────────────────────────────────────────────────────
    if (req.body.Latitude && req.body.Longitude) {
      const { Latitude: lat, Longitude: lng } = req.body;
      await db.actualizarGPSPedido(telefono, {
        latitude: lat, longitude: lng,
        maps_url: `https://maps.google.com/?q=${lat},${lng}`
      });
      await enviarMensaje(telefono, "Ubicacion recibida! Ya la guardamos para la entrega.");
      return;
    }

    const mensaje = req.body.Body;
    if (!mensaje) return;
    logger.info(`Msg de ${telefono}: ${mensaje.substring(0, 80)}`);

    // ── CASO 1: Cliente confirma sucursal sugerida ────────────────────────
    const estado = await db.obtenerEstadoPedido(telefono);
    if (estado?.fase === "esperando_confirmacion_sucursal" && esConfirmacion(mensaje)) {
      logger.info(`Confirmacion: ${telefono} -> ${estado.sucursal_sugerida}`);

      // Obtener items con precios reales
      let items = estado.items || [];
      if (items.length === 0) {
        const historial = await db.obtenerHistorial(telefono);
        items = extraerItemsConPreciosReales(historial);
      }
      // Verificar precios reales en todos los items
      items = items.map(item => {
        const real = buscarPlatillo(item.nombre);
        return real ? { nombre: real.nombre, precio: real.precio, cantidad: item.cantidad || 1 } : item;
      });

      const pedido = {
        id: `PED-${Date.now()}`,
        fecha: new Date().toISOString(),
        estado: "pendiente",
        telefono_cliente: telefono,
        sucursal: estado.sucursal_sugerida,
        items,
        tipo: "domicilio",
        direccion: estado.direccion || null,
        colonia: estado.colonia || null,
        referencias: estado.referencias || null,
        ubicacion_gps: null,
      };
      await db.guardarPedido(pedido);
      await db.eliminarEstadoPedido(telefono);
      logger.info(`Pedido registrado: ${pedido.id} -> ${pedido.sucursal}`);

      const total = items.reduce((s, i) => s + (i.precio * (i.cantidad || 1)), 0);
      const itemsTexto = items.map(i => `${i.cantidad || 1}x ${i.nombre} ($${i.precio})`).join("\n");
      await enviarMensaje(telefono,
        `Pedido registrado exitosamente!\n\nID: ${pedido.id}\n\n${itemsTexto}\n\nTotal: $${total}\nSucursal: ${estado.sucursal_sugerida}\nDireccion: ${estado.direccion}\n\nTiempo: ~40 min. Envio GRATIS!`
      );
      setTimeout(async () => {
        await enviarMensaje(telefono,
          "Opcional: puedes compartir tu ubicacion GPS para que lleguen exactamente a tu puerta. Toca el clip -> Ubicacion -> Enviar mi ubicacion actual."
        );
      }, 3000);
      return;
    }

    // ── CASO 2: Cliente da su direccion (viene del flujo normal) ──────────
    // El agente ya pregunto la direccion en el paso anterior
    // Aqui detectamos si el mensaje ES una direccion y el estado es "esperando_direccion"
    if (estado?.fase === "esperando_direccion" && tieneDireccion(mensaje)) {
      const zona = detectarSucursalPorZona(mensaje);
      const sucursalSugerida = zona || "Por confirmar";
      logger.info(`Direccion recibida. Zona: ${sucursalSugerida}`);

      // Actualizar estado con la direccion y nueva fase
      await db.guardarEstadoPedido(telefono, {
        ...estado,
        fase: "esperando_confirmacion_sucursal",
        sucursal_sugerida: sucursalSugerida,
        direccion: mensaje,
      });

      if (zona) {
        await enviarMensaje(telefono,
          `La sucursal mas cercana a tu zona es *${zona}*. Te enviamos desde ahi o prefieres otra?`
        );
      } else {
        await enviarMensaje(telefono,
          `Recibimos tu direccion. Cual sucursal prefieres? Tenemos: ${require("../../config/restaurante").sucursales.map(s=>s.nombre).join(", ")}`
        );
      }
      return;
    }

    // ── CASO 3: Domicilio + direccion en mismo mensaje ────────────────────
    if (pideDomicilio(mensaje) && tieneDireccion(mensaje)) {
      const zona = detectarSucursalPorZona(mensaje);
      if (zona) {
        const historial = await db.obtenerHistorial(telefono);
        const resultado = await procesarMensaje(historial, mensaje);
        await db.guardarHistorial(telefono, resultado.historialActualizado);
        const items = resultado.datos?.pedido?.items
          ? resultado.datos.pedido.items.map(i => {
              const real = buscarPlatillo(i.nombre);
              return real ? { nombre: real.nombre, precio: real.precio, cantidad: i.cantidad || 1 } : i;
            })
          : extraerItemsConPreciosReales(resultado.historialActualizado);

        await db.guardarEstadoPedido(telefono, {
          fase: "esperando_confirmacion_sucursal",
          sucursal_sugerida: zona,
          items,
          direccion: mensaje,
          colonia: null,
          referencias: null,
        });
        logger.info(`Estado guardado (caso3): ${zona}, items: ${items.length}`);
        await enviarMensaje(telefono,
          `La sucursal mas cercana a tu zona es *${zona}*. Te enviamos desde ahi o prefieres otra?`
        );
        return;
      }
    }

    // ── CASO 4: Flujo normal con Groq ─────────────────────────────────────
    const historial = await db.obtenerHistorial(telefono);
    const resultado = await procesarMensaje(historial, mensaje);
    await db.guardarHistorial(telefono, resultado.historialActualizado);

    // Detectar si el agente esta pidiendo la direccion al cliente
    const textoBajo = resultado.texto.toLowerCase();
    const pidioDir = /direcci[oó]n|colonia|referencia/.test(textoBajo);
    const tieneProductos = resultado.datos?.pedido?.items?.length > 0 ||
      extraerItemsConPreciosReales(resultado.historialActualizado).length > 0;

    if (pidioDir && tieneProductos && !estado) {
      const items = resultado.datos?.pedido?.items ||
        extraerItemsConPreciosReales(resultado.historialActualizado);
      await db.guardarEstadoPedido(telefono, {
        fase: "esperando_direccion",
        items: items.map(i => {
          const real = buscarPlatillo(i.nombre);
          return real ? { nombre: real.nombre, precio: real.precio, cantidad: i.cantidad || 1 } : i;
        }),
        sucursal_sugerida: null,
        direccion: null,
      });
      logger.info(`Estado esperando_direccion guardado para ${telefono}`);
    }

    // Si el agente registro pedido directamente
    if (resultado.accion === "REGISTRAR_PEDIDO") {
      await ejecutarAccion(resultado.accion, resultado.datos, telefono);
      await db.eliminarEstadoPedido(telefono);
    } else if (resultado.accion === "REGISTRAR_RESERVACION" || resultado.accion === "ESCALAR_HUMANO") {
      await ejecutarAccion(resultado.accion, resultado.datos, telefono);
    }

    await enviarMensaje(telefono, resultado.texto);

  } catch (error) {
    logger.error("Error webhook: " + error.message);
  }
});

router.get("/webhook", (req, res) => res.send("Webhook activo"));

async function ejecutarAccion(accion, datos, telefono) {
  try {
    if (accion === "REGISTRAR_PEDIDO") {
      const items = (datos.pedido?.items || []).map(i => {
        const real = buscarPlatillo(i.nombre);
        return real ? { nombre: real.nombre, precio: real.precio, cantidad: i.cantidad || 1 } : i;
      });
      const pedido = {
        id: `PED-${Date.now()}`,
        fecha: new Date().toISOString(),
        estado: "pendiente",
        telefono_cliente: telefono,
        sucursal: datos.pedido?.sucursal || "Por confirmar",
        items,
        tipo: datos.pedido?.tipo || "sucursal",
        direccion: datos.pedido?.direccion || null,
        colonia: datos.pedido?.colonia || null,
        referencias: datos.pedido?.referencias || null,
        ubicacion_gps: null,
      };
      await db.guardarPedido(pedido);
      logger.info(`Pedido en DB: ${pedido.id} -> ${pedido.sucursal}`);
      const total = items.reduce((s, i) => s + (i.precio * (i.cantidad || 1)), 0);
      const itemsTexto = items.map(i => `${i.cantidad || 1}x ${i.nombre} ($${i.precio})`).join("\n");
      await enviarMensaje(telefono,
        `Pedido registrado!\n\nID: ${pedido.id}\n\n${itemsTexto}\n\nTotal: $${total}\nSucursal: ${pedido.sucursal}\n\nTiempo: ~40 min.${pedido.tipo === "domicilio" ? " Envio GRATIS!" : ""}`
      );
      if (pedido.tipo === "domicilio") {
        setTimeout(async () => {
          await enviarMensaje(telefono, "Opcional: comparte tu ubicacion GPS para que lleguen exactamente a tu puerta. Clip -> Ubicacion -> Enviar mi ubicacion actual.");
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
    logger.error(`Error accion: ` + error.message);
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
