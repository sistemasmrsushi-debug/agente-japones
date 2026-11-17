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
// CAMBIADO (13-oct-2026, pedido por Diego: "se cierra sesion el dashboard,
// deberia quedarse abierto"): las sesiones ANTES vivian solo en memoria (un
// Map aqui mismo) -- eso significaba que CUALQUIER reinicio del servidor
// (cada redeploy en Railway, y ese dia hubo varios seguidos) cerraba la
// sesion de todo mundo de golpe, sin aviso ni forma de evitarlo. Diego
// confirmo que ademas le pasaba en un dia normal, sin ningun deploy de por
// medio -- la sesion de 8h se cortaba a media jornada sin importar que
// estuviera activamente usando el dashboard. Ahora las sesiones se guardan
// en la base de datos (ver dashboard_sesiones en database.js) para
// sobrevivir a los redeploys, Y se volvieron "deslizantes": cada peticion
// valida empuja la expiracion otras 8h hacia adelante (ver obtenerSesion
// mas abajo), asi que una sesion en uso activo nunca se corta sola -- solo
// expira si de verdad pasan 8h sin ninguna peticion (ej. se quedo la laptop
// cerrada toda la noche).
// =============================================
const crypto = require("crypto");
const db = require("../db/database");

const DURACION_MS = 8 * 60 * 60 * 1000; // 8 horas de INACTIVIDAD (se renueva con cada peticion, ver obtenerSesion)

async function crearSesion({ usuario, rol, sucursal, sucursales }) {
  const token = crypto.randomBytes(32).toString("hex");
  await db.crearSesionDB(token, { usuario, rol, sucursal, sucursales, expira: new Date(Date.now() + DURACION_MS) });
  return token;
}

async function obtenerSesion(token) {
  if (!token) return null;
  const fila = await db.obtenerSesionDB(token);
  if (!fila) return null;
  if (new Date(fila.expira).getTime() < Date.now()) {
    db.eliminarSesionDB(token).catch(() => {}); // ya vencida, se limpia sola
    return null;
  }

  // Sesion deslizante: cada peticion valida renueva la expiracion. No se
  // espera (await) esta escritura antes de regresar la sesion -- si falla
  // por lo que sea, la peticion actual sigue adelante normal (la sesion
  // simplemente no se habra alargado esta vez, no es motivo para tronar la
  // peticion del usuario).
  const nuevaExpira = new Date(Date.now() + DURACION_MS);
  db.extenderSesionDB(token, nuevaExpira).catch((e) => {
    require("../utils/logger").error("Error extendiendo sesion del dashboard: " + e.message);
  });

  return {
    usuario: fila.usuario,
    rol: fila.rol,
    sucursal: fila.sucursal,
    sucursales: fila.sucursales,
    expira: nuevaExpira.getTime(),
    ultimaActividad: Date.now(),
  };
}

async function cerrarSesion(token) {
  if (!token) return;
  await db.eliminarSesionDB(token);
}

// Umbral para considerar que alguien "tiene el dashboard abierto ahora mismo".
// El dashboard consulta datos cada 30s, asi que 60s de margen cubre una consulta
// perdida sin marcar a alguien como desconectado por error.
const UMBRAL_EN_LINEA_MS = 60 * 1000;

// Lista quien tiene el dashboard abierto ahora mismo (actividad reciente),
// para que el gerente pueda ver que sucursales estan conectadas.
async function obtenerSesionesActivas() {
  const ahora = Date.now();
  const filas = await db.obtenerTodasSesionesDB();
  return filas
    .filter(f => (ahora - new Date(f.ultima_actividad).getTime()) <= UMBRAL_EN_LINEA_MS)
    .map(f => ({
      usuario: f.usuario,
      rol: f.rol,
      sucursal: f.sucursal,
      ultimaActividad: new Date(f.ultima_actividad).getTime(),
    }));
}

function extraerToken(req) {
  const header = req.headers["authorization"] || "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  return req.query.token || req.body?.token || null;
}

// Middleware: exige sesion valida (cualquier rol)
async function requireAuth(req, res, next) {
  try {
    const token = extraerToken(req);
    const sesion = await obtenerSesion(token);
    if (!sesion) return res.status(401).json({ error: "Sesion invalida o expirada. Inicia sesion de nuevo." });
    req.sesion = sesion;
    next();
  } catch (error) {
    require("../utils/logger").error("Error validando sesion: " + error.message);
    res.status(500).json({ error: "Error interno validando la sesion" });
  }
}

// Middleware: exige sesion valida Y rol gerente
async function requireGerente(req, res, next) {
  try {
    const token = extraerToken(req);
    const sesion = await obtenerSesion(token);
    if (!sesion) return res.status(401).json({ error: "Sesion invalida o expirada. Inicia sesion de nuevo." });
    if (sesion.rol !== "gerente") return res.status(403).json({ error: "Solo el gerente puede realizar esta accion." });
    req.sesion = sesion;
    next();
  } catch (error) {
    require("../utils/logger").error("Error validando sesion: " + error.message);
    res.status(500).json({ error: "Error interno validando la sesion" });
  }
}

// Middleware: exige sesion valida Y rol gerente O administrativo -- para
// reportes, que ambos pueden descargar (el administrativo solo ve/descarga
// sus sucursales asignadas, forzado en el propio endpoint, no aqui).
async function requireReportes(req, res, next) {
  try {
    const token = extraerToken(req);
    const sesion = await obtenerSesion(token);
    if (!sesion) return res.status(401).json({ error: "Sesion invalida o expirada. Inicia sesion de nuevo." });
    if (sesion.rol !== "gerente" && sesion.rol !== "administrativo")
      return res.status(403).json({ error: "No tienes permiso para descargar reportes." });
    req.sesion = sesion;
    next();
  } catch (error) {
    require("../utils/logger").error("Error validando sesion: " + error.message);
    res.status(500).json({ error: "Error interno validando la sesion" });
  }
}

// Middleware: bloquea al rol "administrativo" (solo ver/descargar) de
// cualquier accion que modifique datos. Se usa DESPUES de requireAuth (que
// ya dejo req.sesion listo) en las rutas que editan/crean pedidos, quejas,
// reservaciones, etc.
function bloquearSoloLectura(req, res, next) {
  if (req.sesion?.rol === "administrativo")
    return res.status(403).json({ error: "Tu usuario es de solo lectura." });
  next();
}

// Limpieza periodica de sesiones vencidas (evita crecer la tabla indefinidamente).
setInterval(() => {
  db.eliminarSesionesVencidas().catch((e) => {
    require("../utils/logger").error("Error limpiando sesiones vencidas: " + e.message);
  });
}, 60 * 60 * 1000).unref();

module.exports = { crearSesion, obtenerSesion, cerrarSesion, requireAuth, requireGerente, requireReportes, bloquearSoloLectura, obtenerSesionesActivas };
