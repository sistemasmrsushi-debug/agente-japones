// src/dashboard/dashboard.js
const express = require("express");
const router = express.Router();
const path = require("path");
const bcrypt = require("bcryptjs");
const logger = require("../utils/logger");
const db = require("../db/database");
const { crearSesion, cerrarSesion, requireAuth, requireGerente, obtenerSesionesActivas } = require("./auth");
// CORREGIDO (26-ago-2026, reportado por Diego en una prueba real): el
// despacho a Uber Direct se movio aqui desde webhook_netpay.js -- antes se
// disparaba en cuanto se confirmaba el pago, sin esperar a que la cocina
// aceptara el pedido. Ahora se dispara cuando el pedido pasa a "en_proceso"
// (la cocina lo acepta), ver el endpoint PATCH /api/pedidos/:id/estado.
const { despacharUberDirect } = require("../utils/despacho_uber");

// NOTA: Los usuarios y contraseñas ya NO viven aqui hardcodeados.
// Ahora se administran en la tabla `dashboard_usuarios` de PostgreSQL,
// editable desde el panel de administracion (solo gerente).
// Para la migracion inicial de datos existentes, ver scripts/migrar_config_a_db.js

function getMensajeSeguimiento(estado, pedido) {
  const sucursal = pedido.sucursal || "Mr. Sushi";
  const items = Array.isArray(pedido.items)
    ? pedido.items.map(i => `- ${i.cantidad||1}x ${i.nombre}`).join("\n") : "";
  const msgs = {
    en_proceso: `🍣 Mr. Sushi - Tu pedido está en preparación\n\n¡Hola! Tu pedido en ${sucursal} ya está en preparación. 👨‍🍳\n\n${items}\n\n¡Gracias por tu paciencia!`,
    listo:      `✅ Mr. Sushi - ¡Tu pedido está listo!\n\n¡Hola! Tu pedido en ${sucursal} ya está listo.\n\n${items}\n\n¡Te esperamos! 🍣`,
    cancelado:  `😕 Mr. Sushi - Pedido cancelado\n\nLo sentimos, tu pedido en ${sucursal} fue cancelado.\n\nSi tienes dudas contáctanos directamente.`,
  };
  return msgs[estado] || null;
}

async function notificarCliente(telefono, mensaje) {
  try {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return;
    const dest = telefono.startsWith("whatsapp:") ? telefono : `whatsapp:${telefono}`;
    const client = require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
      to: dest,
      body: mensaje
    });
    logger.info(`Notificacion enviada a ${telefono}`);
  } catch (error) {
    logger.error(`Error notificando: ` + error.message);
  }
}

router.post("/api/login", async (req, res) => {
  try {
    const { usuario, password } = req.body;
    if (!usuario || !password) return res.status(400).json({ error: "Falta usuario o contrasena" });
    const user = await db.obtenerUsuarioDashboardPorUsuario(usuario);
    // Comparacion segura con bcrypt (nunca comparar contrasenas en texto plano).
    const coincide = user && await bcrypt.compare(password, user.password);
    if (!coincide)
      return res.status(401).json({ error: "Usuario o contrasena incorrectos" });
    const token = crearSesion({ usuario: user.usuario, rol: user.rol, sucursal: user.sucursal });
    res.json({ ok: true, token, rol: user.rol, sucursal: user.sucursal, usuario: user.usuario });
  } catch (err) {
    logger.error("Error en login: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

router.post("/api/logout", requireAuth, (req, res) => {
  const token = (req.headers["authorization"] || "").replace("Bearer ", "");
  cerrarSesion(token);
  res.json({ ok: true });
});

router.get("/api/pedidos", requireAuth, async (req, res) => {
  try {
    const { rol, sucursal } = req.sesion; // viene del token, no del query param del cliente
    const pedidos = await db.obtenerPedidos(sucursal, rol);
    res.json(pedidos);
  } catch (err) {
    logger.error("Error obteniendo pedidos: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

router.get("/api/reservaciones", requireAuth, async (req, res) => {
  try {
    const { rol, sucursal } = req.sesion;
    const reservaciones = await db.obtenerReservaciones(sucursal, rol);
    res.json(reservaciones);
  } catch (err) {
    logger.error("Error obteniendo reservaciones: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

router.patch("/api/pedidos/:id/estado", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    const pedido = await db.actualizarEstadoPedido(id, estado);
    if (!pedido) return res.status(404).json({ error: "No encontrado" });
    let mensaje = getMensajeSeguimiento(estado, pedido);

    // CORREGIDO (26-ago-2026, reportado por Diego en una prueba real): el
    // despacho a Uber Direct se dispara AQUI -- cuando la cocina acepta el
    // pedido ("en_proceso") -- en vez de en cuanto se confirma el pago. Asi
    // Uber no busca repartidor hasta que alguien en la sucursal ya sepa del
    // pedido. El guard de "!pedido.uber_delivery_id" evita despachar dos
    // veces si alguien marca "en_proceso" mas de una vez por error.
    if (estado === "en_proceso" && pedido.tipo === "domicilio" && !pedido.uber_delivery_id) {
      const resultadoUber = await despacharUberDirect(pedido);
      if (resultadoUber.trackingUrl) {
        mensaje = (mensaje || "") + `\n\n🛵 Ya estamos buscando tu repartidor. Puedes seguirlo aquí:\n${resultadoUber.trackingUrl}`;
      } else if (!resultadoUber.exito) {
        logger.warn(`Pedido ${id} aceptado pero el despacho a Uber Direct fallo -- revisar manualmente.`);
      }
    }

    if (mensaje && pedido.telefono_cliente)
      await notificarCliente(pedido.telefono_cliente, mensaje);
    res.json(pedido);
  } catch (err) {
    logger.error("Error actualizando pedido: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

router.patch("/api/reservaciones/:id/estado", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    const reservacion = await db.actualizarEstadoReservacion(id, estado);
    if (!reservacion) return res.status(404).json({ error: "No encontrado" });
    res.json(reservacion);
  } catch (err) {
    logger.error("Error actualizando reservacion: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

router.get("/api/stats", requireAuth, async (req, res) => {
  try {
    const stats = await db.obtenerStatsPedidos();
    res.json(stats);
  } catch (err) {
    logger.error("Error obteniendo stats: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

// Solo el gerente puede ver que sucursales tienen el dashboard abierto ahora mismo.
router.get("/api/sesiones-activas", requireGerente, (req, res) => {
  try {
    res.json(obtenerSesionesActivas());
  } catch (err) {
    logger.error("Error obteniendo sesiones activas: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

router.get("/dashboard", (req, res) =>
  res.sendFile(path.join(__dirname, "index.html"))
);

module.exports = router;
