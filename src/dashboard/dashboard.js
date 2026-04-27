// src/dashboard/dashboard.js
// =============================================
// DASHBOARD CON LOGIN POR SUCURSAL
// =============================================

const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

const PEDIDOS_FILE       = path.join(__dirname, "../../data/pedidos.json");
const RESERVACIONES_FILE = path.join(__dirname, "../../data/reservaciones.json");

// -----------------------------------------------
// USUARIOS POR SUCURSAL
// -----------------------------------------------
const USUARIOS = {
  "arboledas":         { password: "mrsushi01", sucursal: "Arboledas",            rol: "sucursal" },
  "lomasverdes":       { password: "mrsushi02", sucursal: "Lomas Verdes",         rol: "sucursal" },
  "atizapan":          { password: "mrsushi03", sucursal: "Atizapán",             rol: "sucursal" },
  "fuentessatelite":   { password: "mrsushi04", sucursal: "Fuentes de Satélite",  rol: "sucursal" },
  "zonaazul":          { password: "mrsushi05", sucursal: "Zona Azul Domicilio",  rol: "sucursal" },
  "gerente":           { password: "gerente2024", sucursal: null,                 rol: "gerente"  },
};

function leerArchivo(ruta) {
  if (!fs.existsSync(ruta)) return [];
  try { return JSON.parse(fs.readFileSync(ruta, "utf8")); }
  catch { return []; }
}

function guardarArchivo(ruta, datos) {
  const dir = path.dirname(ruta);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(ruta, JSON.stringify(datos, null, 2));
}

// -----------------------------------------------
// API — LOGIN
// -----------------------------------------------
router.post("/api/login", (req, res) => {
  const { usuario, password } = req.body;
  const user = USUARIOS[usuario?.toLowerCase()];
  if (!user || user.password !== password) {
    return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
  }
  res.json({ ok: true, rol: user.rol, sucursal: user.sucursal, usuario });
});

// -----------------------------------------------
// API — PEDIDOS (filtrados por sucursal)
// -----------------------------------------------
router.get("/api/pedidos", (req, res) => {
  const { sucursal, rol } = req.query;
  let pedidos = leerArchivo(PEDIDOS_FILE).reverse();
  if (rol !== "gerente" && sucursal) {
    pedidos = pedidos.filter(p =>
      (p.sucursal || "").toLowerCase().includes(sucursal.toLowerCase())
    );
  }
  res.json(pedidos);
});

router.get("/api/reservaciones", (req, res) => {
  const { sucursal, rol } = req.query;
  let reservaciones = leerArchivo(RESERVACIONES_FILE).reverse();
  if (rol !== "gerente" && sucursal) {
    reservaciones = reservaciones.filter(r =>
      (r.sucursal || "").toLowerCase().includes(sucursal.toLowerCase())
    );
  }
  res.json(reservaciones);
});

router.patch("/api/pedidos/:id/estado", (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;
  const pedidos = leerArchivo(PEDIDOS_FILE);
  const idx = pedidos.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ error: "No encontrado" });
  pedidos[idx].estado = estado;
  pedidos[idx].actualizado = new Date().toISOString();
  guardarArchivo(PEDIDOS_FILE, pedidos);
  res.json(pedidos[idx]);
});

router.patch("/api/reservaciones/:id/estado", (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;
  const reservaciones = leerArchivo(RESERVACIONES_FILE);
  const idx = reservaciones.findIndex(r => r.id === id);
  if (idx === -1) return res.status(404).json({ error: "No encontrado" });
  reservaciones[idx].estado = estado;
  reservaciones[idx].actualizado = new Date().toISOString();
  guardarArchivo(RESERVACIONES_FILE, reservaciones);
  res.json(reservaciones[idx]);
});

// API — stats para gerente
router.get("/api/stats", (req, res) => {
  const pedidos = leerArchivo(PEDIDOS_FILE);
  const hoy = new Date().toDateString();
  const sucursales = ["Arboledas", "Lomas Verdes", "Atizapán", "Fuentes de Satélite", "Zona Azul Domicilio"];
  const stats = sucursales.map(s => ({
    sucursal: s,
    total:     pedidos.filter(p => (p.sucursal||"").includes(s)).length,
    hoy:       pedidos.filter(p => (p.sucursal||"").includes(s) && new Date(p.fecha).toDateString() === hoy).length,
    pendientes:pedidos.filter(p => (p.sucursal||"").includes(s) && p.estado === "pendiente").length,
  }));
  res.json(stats);
});

// -----------------------------------------------
// SERVIR EL HTML
// -----------------------------------------------
router.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

module.exports = router;
