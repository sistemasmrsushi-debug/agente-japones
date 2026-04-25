// src/dashboard/dashboard.js
// =============================================
// DASHBOARD DE GESTIÓN DE PEDIDOS
// Accesible en: http://localhost:3000/dashboard
// =============================================

const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

const PEDIDOS_FILE = path.join(__dirname, "../../data/pedidos.json");
const RESERVACIONES_FILE = path.join(__dirname, "../../data/reservaciones.json");

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

// --- API JSON para el dashboard ---

router.get("/api/pedidos", (req, res) => {
  const pedidos = leerArchivo(PEDIDOS_FILE);
  res.json(pedidos.reverse()); // más recientes primero
});

router.get("/api/reservaciones", (req, res) => {
  const reservaciones = leerArchivo(RESERVACIONES_FILE);
  res.json(reservaciones.reverse());
});

router.patch("/api/pedidos/:id/estado", (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;
  const pedidos = leerArchivo(PEDIDOS_FILE);
  const idx = pedidos.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ error: "Pedido no encontrado" });
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
  if (idx === -1) return res.status(404).json({ error: "Reservación no encontrada" });
  reservaciones[idx].estado = estado;
  reservaciones[idx].actualizado = new Date().toISOString();
  guardarArchivo(RESERVACIONES_FILE, reservaciones);
  res.json(reservaciones[idx]);
});

// --- Servir el HTML del dashboard ---
router.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

module.exports = router;
