// src/dashboard/dashboard.js
const express = require("express");
const router = express.Router();
const path = require("path");
const logger = require("../utils/logger");
const db = require("../db/database");
const { crearSesion, cerrarSesion, requireAuth } = require("./auth");

// NOTA: Los usuarios y contraseñas ya NO viven aqui hardcodeados.
// Ahora se administran en la tabla `dashboard_usuarios` de PostgreSQL,
// editable desde el panel de administracion (solo gerente).
// Para la migracion inicial de datos existentes, ver scripts/migrar_config_a_db.js

function getMensajeSeguimiento(estado, pedido) {
  const sucursal = pedido.sucursal || "Mr. Sushi";
  const items = Array.isArray(pedido.items)
    ? pedido.items.map(i => `- ${i.cantidad||1}x ${i.nombre}`).join("\n") : "";
  const msgs = {
    en_proceso: `Mr. Sushi - Tu pedido esta en preparacion\n\nHola! Tu pedido en ${sucursal} ya esta en preparacion.\n\n${items}\n\nGracias por tu paciencia!`,
    listo:      `Mr. Sushi - Tu pedido esta listo!\n\nHola! Tu pedido en ${sucursal} ya esta listo.\n\n${items}\n\nTe esperamos!`,
    cancelado:  `Mr. Sushi - Pedido cancelado\n\nLo sentimos, tu pedido en ${sucursal} fue cancelado.\n\nSi tienes dudas contactanos directamente.`,
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
    if (!user || user.password !== password)
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
    const mensaje = getMensajeSeguimiento(estado, pedido);
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

router.get("/dashboard", (req, res) =>
  res.sendFile(path.join(__dirname, "index.html"))
);

module.exports = router;
