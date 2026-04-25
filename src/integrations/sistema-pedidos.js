// src/integrations/sistema-pedidos.js
// =============================================
// CONECTOR CON TU SISTEMA PROPIO DE PEDIDOS
// =============================================
// Este archivo tiene 3 modos según tu sistema:
//
//  MODO A: Tu sistema tiene API REST    → usa registrarViaAPI()
//  MODO B: Acceso directo a base datos  → usa registrarEnBD()
//  MODO C: Sin integración aún          → guarda en archivo JSON local
//
// Activa el modo correcto descomentando el bloque correspondiente
// =============================================

const axios = require("axios");
const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

// =============================================
// MODO A: API REST (activa esto si tu sistema tiene endpoints)
// =============================================
// async function registrarPedido(pedido) {
//   const response = await axios.post(
//     `${process.env.SISTEMA_PEDIDOS_URL}/pedidos`,
//     {
//       cliente_telefono: pedido.telefono_cliente,
//       sucursal_id: pedido.sucursal_id,
//       items: pedido.items,
//       total: pedido.items.reduce((s, i) => s + i.precio * i.cantidad, 0),
//       canal: "whatsapp",
//       fecha: new Date().toISOString(),
//     },
//     {
//       headers: { Authorization: `Bearer ${process.env.SISTEMA_PEDIDOS_TOKEN}` }
//     }
//   );
//   return response.data;
// }
//
// async function registrarReservacion(res) {
//   const response = await axios.post(
//     `${process.env.SISTEMA_PEDIDOS_URL}/reservaciones`,
//     {
//       nombre: res.nombre,
//       telefono: res.telefono_cliente,
//       fecha: res.fecha,
//       hora: res.hora,
//       personas: res.personas,
//       sucursal: res.sucursal,
//       canal: "whatsapp",
//     },
//     {
//       headers: { Authorization: `Bearer ${process.env.SISTEMA_PEDIDOS_TOKEN}` }
//     }
//   );
//   return response.data;
// }

// =============================================
// MODO C: Sin integración aún — guarda en JSON local
// (predeterminado para empezar rápido)
// =============================================

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

async function registrarPedido(pedido) {
  const pedidos = leerArchivo(PEDIDOS_FILE);
  const nuevo = {
    id: `PED-${Date.now()}`,
    ...pedido,
    estado: "pendiente",
    canal: "whatsapp",
    fecha: new Date().toISOString(),
  };
  pedidos.push(nuevo);
  guardarArchivo(PEDIDOS_FILE, pedidos);
  logger.info(`Pedido guardado localmente: ${nuevo.id}`);
  return nuevo;
}

async function registrarReservacion(res) {
  const reservaciones = leerArchivo(RESERVACIONES_FILE);
  const nueva = {
    id: `RES-${Date.now()}`,
    ...res,
    estado: "confirmada",
    canal: "whatsapp",
    creada: new Date().toISOString(),
  };
  reservaciones.push(nueva);
  guardarArchivo(RESERVACIONES_FILE, reservaciones);
  logger.info(`Reservación guardada localmente: ${nueva.id}`);
  return nueva;
}

// =============================================
// CONSULTAS (para cuando el agente necesite datos)
// =============================================

async function consultarDisponibilidad(sucursal, fecha, hora) {
  // TODO: Conectar con tu sistema real
  // Por ahora siempre confirma disponibilidad
  return { disponible: true, mesas_libres: 5 };
}

async function consultarEstadoPedido(pedidoId) {
  const pedidos = leerArchivo(PEDIDOS_FILE);
  return pedidos.find(p => p.id === pedidoId) || null;
}

module.exports = {
  registrarPedido,
  registrarReservacion,
  consultarDisponibilidad,
  consultarEstadoPedido,
};
