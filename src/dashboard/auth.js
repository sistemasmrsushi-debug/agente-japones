// src/dashboard/auth.js
// =============================================
// Autenticacion por token para el dashboard y el
// panel de administracion.
//
// Antes, cualquiera podia llamar /api/pedidos?rol=gerente
// directo por URL sin haber iniciado sesion. Este modulo
// agrega tokens de sesion reales: se generan al hacer login
// y se validan en cada request protegido.
//
// Las sesiones se guardan en memoria (no en base de datos).
// Esto es suficiente para un panel interno de pocos usuarios,
// pero significa que todos cierran sesion si el servidor
// se reinicia (por ejemplo, tras un redeploy en Railway).
// =============================================
const crypto = require("crypto");

const SESIONES = new Map(); // token -> { usuario, rol, sucursal, expira }
const DURACION_MS = 8 * 60 * 60 * 1000; // 8 horas

function crearSesion({ usuario, rol, sucursal }) {
  const token = crypto.randomBytes(32).toString("hex");
  SESIONES.set(token, { usuario, rol, sucursal, expira: Date.now() + DURACION_MS });
  return token;
}

function obtenerSesion(token) {
  const sesion = SESIONES.get(token);
  if (!sesion) return null;
  if (Date.now() > sesion.expira) {
    SESIONES.delete(token);
    return null;
  }
  return sesion;
}

function cerrarSesion(token) {
  SESIONES.delete(token);
}

function extraerToken(req) {
  const header = req.headers["authorization"] || "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  return req.query.token || req.body?.token || null;
}

// Middleware: exige sesion valida (cualquier rol)
function requireAuth(req, res, next) {
  const token = extraerToken(req);
  const sesion = token && obtenerSesion(token);
  if (!sesion) return res.status(401).json({ error: "Sesion invalida o expirada. Inicia sesion de nuevo." });
  req.sesion = sesion;
  next();
}

// Middleware: exige sesion valida Y rol gerente
function requireGerente(req, res, next) {
  const token = extraerToken(req);
  const sesion = token && obtenerSesion(token);
  if (!sesion) return res.status(401).json({ error: "Sesion invalida o expirada. Inicia sesion de nuevo." });
  if (sesion.rol !== "gerente") return res.status(403).json({ error: "Solo el gerente puede realizar esta accion." });
  req.sesion = sesion;
  next();
}

// Limpieza periodica de sesiones vencidas (evita crecer memoria indefinidamente)
setInterval(() => {
  const ahora = Date.now();
  for (const [token, sesion] of SESIONES) {
    if (ahora > sesion.expira) SESIONES.delete(token);
  }
}, 60 * 60 * 1000).unref();

module.exports = { crearSesion, obtenerSesion, cerrarSesion, requireAuth, requireGerente };
