// src/dashboard/dashboard.js
const express = require("express");
const router = express.Router();
const path = require("path");
const logger = require("../utils/logger");
const db = require("../db/database");

const USUARIOS = {
  "vallejo":           { password: "mrsushi01", sucursal: "Vallejo",               rol: "sucursal" },
  "zonaesmeralda":     { password: "mrsushi02", sucursal: "Zona Esmeralda",        rol: "sucursal" },
  "arboledas":         { password: "mrsushi03", sucursal: "Arboledas",             rol: "sucursal" },
  "zonaazulrest":      { password: "mrsushi05", sucursal: "Zona Azul Restaurante", rol: "sucursal" },
  "mundoe":            { password: "mrsushi06", sucursal: "Mundo E",               rol: "sucursal" },
  "fuentessatelite":   { password: "mrsushi11", sucursal: "Fuentes de Satelite",   rol: "sucursal" },
  "patriotismo":       { password: "mrsushi12", sucursal: "Patriotismo",           rol: "sucursal" },
  "hahhaazul":         { password: "mrsushi13", sucursal: "Hahha Azul",            rol: "sucursal" },
  "masaryk":           { password: "mrsushi14", sucursal: "Masaryk",               rol: "sucursal" },
  "americana":         { password: "mrsushi15", sucursal: "Americana",             rol: "sucursal" },
  "tecamachalco":      { password: "mrsushi16", sucursal: "Tecamachalco",          rol: "sucursal" },
  "galeriasmetepec":   { password: "mrsushi19", sucursal: "Galerias Metepec",      rol: "sucursal" },
  "galeriasserdan":    { password: "mrsushi22", sucursal: "Galerias Serdan",       rol: "sucursal" },
  "urbancenter":       { password: "mrsushi23", sucursal: "Urban Center",          rol: "sucursal" },
  "hahhaesmeralda":    { password: "mrsushi24", sucursal: "Hahha Esmeralda",       rol: "sucursal" },
  "patiosantafe":      { password: "mrsushi25", sucursal: "Patio Santa Fe",        rol: "sucursal" },
  "atizapan":          { password: "mrsushi04", sucursal: "Atizapan",              rol: "sucursal" },
  "zonaazuldom":       { password: "mrsushi07", sucursal: "Zona Azul Domicilio",   rol: "sucursal" },
  "perisur":           { password: "mrsushi08", sucursal: "Perisur",               rol: "sucursal" },
  "lomasverdes":       { password: "mrsushi09", sucursal: "Lomas Verdes",          rol: "sucursal" },
  "delta":             { password: "mrsushi10", sucursal: "Delta",                 rol: "sucursal" },
  "coapa":             { password: "mrsushi17", sucursal: "Coapa",                 rol: "sucursal" },
  "galeriástoluca":    { password: "mrsushi18", sucursal: "Galerias Toluca",       rol: "sucursal" },
  "galeriascuernavaca":{ password: "mrsushi20", sucursal: "Galerias Cuernavaca",   rol: "sucursal" },
  "ccsantafe":         { password: "mrsushi21", sucursal: "CC Santa Fe",           rol: "sucursal" },
  "gerente":           { password: "gerente2024", sucursal: null,                  rol: "gerente"  },
};

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

router.post("/api/login", (req, res) => {
  const { usuario, password } = req.body;
  const user = USUARIOS[usuario?.toLowerCase()];
  if (!user || user.password !== password)
    return res.status(401).json({ error: "Usuario o contrasena incorrectos" });
  res.json({ ok: true, rol: user.rol, sucursal: user.sucursal, usuario });
});

router.get("/api/pedidos", async (req, res) => {
  try {
    const { sucursal, rol } = req.query;
    const pedidos = await db.obtenerPedidos(sucursal, rol);
    res.json(pedidos);
  } catch (err) {
    logger.error("Error obteniendo pedidos: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

router.get("/api/reservaciones", async (req, res) => {
  try {
    const { sucursal, rol } = req.query;
    const reservaciones = await db.obtenerReservaciones(sucursal, rol);
    res.json(reservaciones);
  } catch (err) {
    logger.error("Error obteniendo reservaciones: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

router.patch("/api/pedidos/:id/estado", async (req, res) => {
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

router.patch("/api/reservaciones/:id/estado", async (req, res) => {
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

router.get("/api/stats", async (req, res) => {
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
