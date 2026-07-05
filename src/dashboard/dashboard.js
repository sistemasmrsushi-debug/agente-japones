// src/dashboard/dashboard.js
const express = require("express");
const router = express.Router();
const path = require("path");
const logger = require("../utils/logger");
const db = require("../db/database");

const USUARIOS = {
  "vallejo":           { password: "X@xBEAFBw4!K2v", sucursal: "Vallejo",               rol: "sucursal" },
  "zonaesmeralda":     { password: "SV8j5ek3Vjq%vU", sucursal: "Zona Esmeralda",        rol: "sucursal" },
  "arboledas":         { password: "R%y7S-Hd2u@t!u", sucursal: "Arboledas",             rol: "sucursal" },
  "zonaazulrest":      { password: "GG%ta4H-2yDkGQ", sucursal: "Zona Azul Restaurante", rol: "sucursal" },
  "mundoe":            { password: "ENKcUw5c--grEc", sucursal: "Mundo E",               rol: "sucursal" },
  "fuentessatelite":   { password: "D=Yg3#4sjsxZeN", sucursal: "Fuentes de Satelite",   rol: "sucursal" },
  "patriotismo":       { password: "Ed5vpnxBW-74ys", sucursal: "Patriotismo",           rol: "sucursal" },
  "hahhaazul":         { password: "Zh@R6d@=pKKy4c", sucursal: "Hahha Azul",            rol: "sucursal" },
  "masaryk":           { password: "Kd9U@kgxHK@zFc", sucursal: "Masaryk",               rol: "sucursal" },
  "americana":         { password: "Ws#at8t*8mghZ=", sucursal: "Americana",             rol: "sucursal" },
  "tecamachalco":      { password: "H!!r8!%!*4n7#%", sucursal: "Tecamachalco",          rol: "sucursal" },
  "galeriasmetepec":   { password: "Yp4zA@4wsDxN!G", sucursal: "Galerias Metepec",      rol: "sucursal" },
  "galeriasserdan":    { password: "JG+-hzs4Dq9zFb", sucursal: "Galerias Serdan",       rol: "sucursal" },
  "urbancenter":       { password: "S=J*2Pg!W%5uru", sucursal: "Urban Center",          rol: "sucursal" },
  "hahhaesmeralda":    { password: "Ns%u=hWX8vpbyz", sucursal: "Hahha Esmeralda",       rol: "sucursal" },
  "patiosantafe":      { password: "Q#VXP!*2Zyz9ep", sucursal: "Patio Santa Fe",        rol: "sucursal" },
  "atizapan":          { password: "Dc=bHfEws3a4x!", sucursal: "Atizapan",              rol: "sucursal" },
  "zonaazuldom":       { password: "P5j9@UySRaR6+Q", sucursal: "Zona Azul Domicilio",   rol: "sucursal" },
  "perisur":           { password: "SR+vCyn67Nxmht", sucursal: "Perisur",               rol: "sucursal" },
  "lomasverdes":       { password: "FHsM-FjPe95Abq", sucursal: "Lomas Verdes",          rol: "sucursal" },
  "delta":             { password: "Ej*5tJ8msMWy8f", sucursal: "Delta",                 rol: "sucursal" },
  "coapa":             { password: "NRdVABu5*wghb6", sucursal: "Coapa",                 rol: "sucursal" },
  "galeriástoluca":    { password: "S@uT#-R+8RBpmj", sucursal: "Galerias Toluca",       rol: "sucursal" },
  "galeriascuernavaca":{ password: "PzP7x2T-ZbU9z%", sucursal: "Galerias Cuernavaca",   rol: "sucursal" },
  "ccsantafe":         { password: "U4X+JtH6gc#3m9", sucursal: "CC Santa Fe",           rol: "sucursal" },
  "gerente":           { password: "TexbT%%mgt-46zfe", sucursal: null,                  rol: "gerente"  },
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
