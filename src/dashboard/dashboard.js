// src/dashboard/dashboard.js
const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

const PEDIDOS_FILE       = path.join(__dirname, "../../data/pedidos.json");
const RESERVACIONES_FILE = path.join(__dirname, "../../data/reservaciones.json");

const USUARIOS = {
  "vallejo":           { password: "mrsushi01", sucursal: "Vallejo",               rol: "sucursal" },
  "zonaesmeralda":     { password: "mrsushi02", sucursal: "Zona Esmeralda",        rol: "sucursal" },
  "arboledas":         { password: "mrsushi03", sucursal: "Arboledas",             rol: "sucursal" },
  "zonaazulrest":      { password: "mrsushi05", sucursal: "Zona Azul Restaurante", rol: "sucursal" },
  "mundoe":            { password: "mrsushi06", sucursal: "Mundo E",               rol: "sucursal" },
  "fuentessatelite":   { password: "mrsushi11", sucursal: "Fuentes de Satélite",   rol: "sucursal" },
  "patriotismo":       { password: "mrsushi12", sucursal: "Patriotismo",           rol: "sucursal" },
  "hahhaazul":         { password: "mrsushi13", sucursal: "Hahha Azul",            rol: "sucursal" },
  "masaryk":           { password: "mrsushi14", sucursal: "Masaryk",               rol: "sucursal" },
  "americana":         { password: "mrsushi15", sucursal: "Americana",             rol: "sucursal" },
  "tecamachalco":      { password: "mrsushi16", sucursal: "Tecamachalco",          rol: "sucursal" },
  "galeriasmetepec":   { password: "mrsushi19", sucursal: "Galerías Metepec",      rol: "sucursal" },
  "galeriasserdan":    { password: "mrsushi22", sucursal: "Galerías Serdán",       rol: "sucursal" },
  "urbancenter":       { password: "mrsushi23", sucursal: "Urban Center",          rol: "sucursal" },
  "hahhaesmeralda":    { password: "mrsushi24", sucursal: "Hahha Esmeralda",       rol: "sucursal" },
  "patiosantafe":      { password: "mrsushi25", sucursal: "Patio Santa Fe",        rol: "sucursal" },
  "atizapan":          { password: "mrsushi04", sucursal: "Atizapán",              rol: "sucursal" },
  "zonaazuldom":       { password: "mrsushi07", sucursal: "Zona Azul Domicilio",   rol: "sucursal" },
  "perisur":           { password: "mrsushi08", sucursal: "Perisur",               rol: "sucursal" },
  "lomasverdes":       { password: "mrsushi09", sucursal: "Lomas Verdes",          rol: "sucursal" },
  "delta":             { password: "mrsushi10", sucursal: "Delta",                 rol: "sucursal" },
  "coapa":             { password: "mrsushi17", sucursal: "Coapa",                 rol: "sucursal" },
  "galeriástoluca":    { password: "mrsushi18", sucursal: "Galerías Toluca",       rol: "sucursal" },
  "galeriascuernavaca":{ password: "mrsushi20", sucursal: "Galerías Cuernavaca",   rol: "sucursal" },
  "ccsantafe":         { password: "mrsushi21", sucursal: "CC Santa Fe",           rol: "sucursal" },
  "gerente":           { password: "gerente2024", sucursal: null,                  rol: "gerente"  },
};

function leer(ruta) {
  if (!fs.existsSync(ruta)) return [];
  try { return JSON.parse(fs.readFileSync(ruta, "utf8")); } catch { return []; }
}

function guardar(ruta, datos) {
  const dir = path.dirname(ruta);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(ruta, JSON.stringify(datos, null, 2));
}

function getMensajeSeguimiento(estado, pedido) {
  const sucursal = pedido.sucursal || "Mr. Sushi";
  const items = Array.isArray(pedido.items) ? pedido.items.map(i => `• ${i.cantidad||1}x ${i.nombre}`).join("\n") : "";
  const msgs = {
    en_proceso: `🍣 *Mr. Sushi — Tu pedido está en preparación*\n\nHola! Tu pedido en *${sucursal}* ya está en preparación.\n\n${items}\n\n¡Gracias por tu paciencia! 😊`,
    listo:      `✅ *Mr. Sushi — ¡Tu pedido está listo!*\n\nHola! Tu pedido en *${sucursal}* ya está listo.\n\n${items}\n\n¡Te esperamos! 🍣`,
    cancelado:  `❌ *Mr. Sushi — Pedido cancelado*\n\nLo sentimos, tu pedido en *${sucursal}* fue cancelado.\n\nSi tienes dudas contáctanos directamente.`,
  };
  return msgs[estado] || null;
}

async function notificarCliente(telefono, mensaje) {
  try {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return;
    let dest = telefono.startsWith("whatsapp:") ? telefono : `whatsapp:${telefono}`;
    const client = require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({ from:`whatsapp:${process.env.TWILIO_PHONE_NUMBER}`, to:dest, body:mensaje });
    logger.info(`Notificación enviada a ${telefono}`);
  } catch (error) {
    logger.error(`Error notificando: ` + error.message);
  }
}

router.post("/api/login", (req, res) => {
  const { usuario, password } = req.body;
  const user = USUARIOS[usuario?.toLowerCase()];
  if (!user || user.password !== password) return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
  res.json({ ok:true, rol:user.rol, sucursal:user.sucursal, usuario });
});

router.get("/api/pedidos", (req, res) => {
  const { sucursal, rol } = req.query;
  let pedidos = leer(PEDIDOS_FILE).reverse();
  if (rol !== "gerente" && sucursal) pedidos = pedidos.filter(p => (p.sucursal||"").toLowerCase().includes(sucursal.toLowerCase()));
  res.json(pedidos);
});

router.get("/api/reservaciones", (req, res) => {
  const { sucursal, rol } = req.query;
  let reservaciones = leer(RESERVACIONES_FILE).reverse();
  if (rol !== "gerente" && sucursal) reservaciones = reservaciones.filter(r => (r.sucursal||"").toLowerCase().includes(sucursal.toLowerCase()));
  res.json(reservaciones);
});

router.patch("/api/pedidos/:id/estado", async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;
  const pedidos = leer(PEDIDOS_FILE);
  const idx = pedidos.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ error: "No encontrado" });
  pedidos[idx].estado = estado;
  pedidos[idx].actualizado = new Date().toISOString();
  guardar(PEDIDOS_FILE, pedidos);
  const mensaje = getMensajeSeguimiento(estado, pedidos[idx]);
  if (mensaje && pedidos[idx].telefono_cliente) await notificarCliente(pedidos[idx].telefono_cliente, mensaje);
  res.json(pedidos[idx]);
});

router.patch("/api/reservaciones/:id/estado", (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;
  const reservaciones = leer(RESERVACIONES_FILE);
  const idx = reservaciones.findIndex(r => r.id === id);
  if (idx === -1) return res.status(404).json({ error: "No encontrado" });
  reservaciones[idx].estado = estado;
  reservaciones[idx].actualizado = new Date().toISOString();
  guardar(RESERVACIONES_FILE, reservaciones);
  res.json(reservaciones[idx]);
});

router.get("/api/stats", (req, res) => {
  const pedidos = leer(PEDIDOS_FILE);
  const hoy = new Date().toDateString();
  const sucursales = Object.values(USUARIOS).filter(u => u.rol === "sucursal").map(u => u.sucursal);
  const unicas = [...new Set(sucursales)];
  res.json(unicas.map(s => ({
    sucursal: s,
    total:      pedidos.filter(p => (p.sucursal||"").includes(s)).length,
    hoy:        pedidos.filter(p => (p.sucursal||"").includes(s) && new Date(p.fecha).toDateString() === hoy).length,
    pendientes: pedidos.filter(p => (p.sucursal||"").includes(s) && p.estado === "pendiente").length,
  })));
});

router.get("/dashboard", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

module.exports = router;
