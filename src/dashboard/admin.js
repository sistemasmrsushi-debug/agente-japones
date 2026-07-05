// src/dashboard/admin.js
// =============================================
// Panel de administracion: CRUD de menu, sucursales
// y usuarios del dashboard. Todo protegido con
// requireGerente (solo el rol "gerente" puede usarlo).
// =============================================
const express = require("express");
const router = express.Router();
const logger = require("../utils/logger");
const db = require("../db/database");
const { requireGerente } = require("./auth");

// ── MENU ──────────────────────────────────────────────────────────────────

router.get("/api/admin/menu", requireGerente, async (req, res) => {
  try {
    const items = await db.obtenerMenu();
    res.json(items);
  } catch (err) {
    logger.error("Error obteniendo menu: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

router.post("/api/admin/menu", requireGerente, async (req, res) => {
  try {
    const { categoria, nombre, precio, descripcion, orden } = req.body;
    if (!categoria || !nombre || precio === undefined)
      return res.status(400).json({ error: "Faltan campos: categoria, nombre y precio son obligatorios" });
    if (isNaN(Number(precio)) || Number(precio) < 0)
      return res.status(400).json({ error: "El precio debe ser un numero positivo" });
    const item = await db.crearItemMenu({ categoria, nombre, precio, descripcion, orden });
    res.json(item);
  } catch (err) {
    logger.error("Error creando item de menu: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

router.put("/api/admin/menu/:id", requireGerente, async (req, res) => {
  try {
    const { id } = req.params;
    const campos = req.body;
    if (campos.precio !== undefined && (isNaN(Number(campos.precio)) || Number(campos.precio) < 0))
      return res.status(400).json({ error: "El precio debe ser un numero positivo" });
    const item = await db.actualizarItemMenu(id, campos);
    if (!item) return res.status(404).json({ error: "Item no encontrado o sin cambios validos" });
    res.json(item);
  } catch (err) {
    logger.error("Error actualizando item de menu: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

router.delete("/api/admin/menu/:id", requireGerente, async (req, res) => {
  try {
    await db.eliminarItemMenu(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    logger.error("Error eliminando item de menu: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

// ── SUCURSALES ────────────────────────────────────────────────────────────
// Nota: el nombre de la sucursal NO es editable desde aqui a proposito.
// El agente de IA usa el nombre para hacer match con las zonas de domicilio
// (config/restaurante.js -> zonas_domicilio). Cambiarlo aqui rompería esa
// asignacion automatica. Si necesitas renombrar una sucursal, avisale a
// quien mantiene el codigo para que actualice zonas_domicilio a la vez.

router.get("/api/admin/sucursales", requireGerente, async (req, res) => {
  try {
    const sucursales = await db.obtenerSucursales();
    res.json(sucursales);
  } catch (err) {
    logger.error("Error obteniendo sucursales: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

router.put("/api/admin/sucursales/:id", requireGerente, async (req, res) => {
  try {
    const { id } = req.params;
    const { direccion, telefono, telefono_transferencia, whatsapp, horario_apertura, horario_cierre } = req.body;
    const sucursal = await db.actualizarSucursal(id, {
      direccion, telefono, telefono_transferencia, whatsapp, horario_apertura, horario_cierre,
    });
    if (!sucursal) return res.status(404).json({ error: "Sucursal no encontrada o sin cambios validos" });
    res.json(sucursal);
  } catch (err) {
    logger.error("Error actualizando sucursal: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

// ── USUARIOS DEL DASHBOARD ────────────────────────────────────────────────

router.get("/api/admin/usuarios", requireGerente, async (req, res) => {
  try {
    const usuarios = await db.obtenerUsuariosDashboard();
    res.json(usuarios); // nunca incluye la columna password
  } catch (err) {
    logger.error("Error obteniendo usuarios: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

router.post("/api/admin/usuarios", requireGerente, async (req, res) => {
  try {
    const { usuario, password, sucursal, rol } = req.body;
    if (!usuario || !password) return res.status(400).json({ error: "Faltan usuario o contrasena" });
    if (password.length < 8) return res.status(400).json({ error: "La contrasena debe tener al menos 8 caracteres" });
    const existente = await db.obtenerUsuarioDashboardPorUsuario(usuario);
    if (existente) return res.status(409).json({ error: "Ese usuario ya existe" });
    const nuevo = await db.crearUsuarioDashboard({ usuario, password, sucursal, rol });
    res.json(nuevo);
  } catch (err) {
    logger.error("Error creando usuario: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

router.put("/api/admin/usuarios/:usuario/password", requireGerente, async (req, res) => {
  try {
    const { usuario } = req.params;
    const { password } = req.body;
    if (!password || password.length < 8)
      return res.status(400).json({ error: "La contrasena debe tener al menos 8 caracteres" });
    const actualizado = await db.actualizarPasswordUsuarioDashboard(usuario, password);
    if (!actualizado) return res.status(404).json({ error: "Usuario no encontrado" });
    res.json(actualizado);
  } catch (err) {
    logger.error("Error actualizando contrasena: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

router.delete("/api/admin/usuarios/:usuario", requireGerente, async (req, res) => {
  try {
    const { usuario } = req.params;
    if (usuario.toLowerCase() === req.sesion.usuario.toLowerCase())
      return res.status(400).json({ error: "No puedes eliminar tu propio usuario mientras tienes sesion activa" });
    await db.eliminarUsuarioDashboard(usuario);
    res.json({ ok: true });
  } catch (err) {
    logger.error("Error eliminando usuario: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

module.exports = router;
