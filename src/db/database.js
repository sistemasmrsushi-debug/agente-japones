// src/db/database.js
// =============================================
// Conexion PostgreSQL — reemplaza archivos JSON
// =============================================
const { Pool } = require("pg");
const logger = require("../utils/logger");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS pedidos (
        id TEXT PRIMARY KEY,
        fecha TIMESTAMPTZ NOT NULL,
        estado TEXT NOT NULL DEFAULT 'pendiente',
        telefono_cliente TEXT,
        sucursal TEXT,
        items JSONB,
        tipo TEXT DEFAULT 'sucursal',
        direccion TEXT,
        colonia TEXT,
        referencias TEXT,
        ubicacion_gps JSONB,
        actualizado TIMESTAMPTZ
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS reservaciones (
        id TEXT PRIMARY KEY,
        fecha_registro TIMESTAMPTZ NOT NULL,
        estado TEXT NOT NULL DEFAULT 'confirmada',
        telefono_cliente TEXT,
        nombre TEXT,
        fecha TEXT,
        hora TEXT,
        personas INTEGER,
        sucursal TEXT,
        actualizado TIMESTAMPTZ
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversaciones (
        telefono TEXT PRIMARY KEY,
        historial JSONB NOT NULL DEFAULT '[]',
        actualizado TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    logger.info("Base de datos inicializada correctamente");
  } catch (err) {
    logger.error("Error inicializando DB: " + err.message);
    throw err;
  } finally {
    client.release();
  }
}

// ── PEDIDOS ──────────────────────────────────────────────────────────────────

async function guardarPedido(pedido) {
  await pool.query(`
    INSERT INTO pedidos (id, fecha, estado, telefono_cliente, sucursal, items, tipo, direccion, colonia, referencias, ubicacion_gps)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (id) DO UPDATE SET
      estado = EXCLUDED.estado,
      sucursal = EXCLUDED.sucursal,
      items = EXCLUDED.items,
      ubicacion_gps = EXCLUDED.ubicacion_gps,
      actualizado = NOW()
  `, [
    pedido.id, pedido.fecha, pedido.estado, pedido.telefono_cliente,
    pedido.sucursal, JSON.stringify(pedido.items), pedido.tipo,
    pedido.direccion, pedido.colonia, pedido.referencias,
    pedido.ubicacion_gps ? JSON.stringify(pedido.ubicacion_gps) : null
  ]);
}

async function obtenerPedidos(sucursal, rol) {
  let query = "SELECT * FROM pedidos ORDER BY fecha DESC LIMIT 200";
  let params = [];
  if (rol !== "gerente" && sucursal) {
    query = "SELECT * FROM pedidos WHERE sucursal ILIKE $1 ORDER BY fecha DESC LIMIT 200";
    params = [`%${sucursal}%`];
  }
  const { rows } = await pool.query(query, params);
  return rows;
}

async function actualizarEstadoPedido(id, estado) {
  const { rows } = await pool.query(
    "UPDATE pedidos SET estado=$1, actualizado=NOW() WHERE id=$2 RETURNING *",
    [estado, id]
  );
  return rows[0] || null;
}

async function actualizarGPSPedido(telefono, ubicacion) {
  await pool.query(`
    UPDATE pedidos SET ubicacion_gps=$1, actualizado=NOW()
    WHERE telefono_cliente=$2 AND tipo='domicilio'
    AND fecha = (SELECT MAX(fecha) FROM pedidos WHERE telefono_cliente=$2 AND tipo='domicilio')
  `, [JSON.stringify(ubicacion), telefono]);
}

async function obtenerStatsPedidos() {
  const hoy = new Date().toISOString().split("T")[0];
  const { rows } = await pool.query(`
    SELECT
      sucursal,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE fecha::date = $1::date) as hoy,
      COUNT(*) FILTER (WHERE estado = 'pendiente') as pendientes
    FROM pedidos
    GROUP BY sucursal
    ORDER BY sucursal
  `, [hoy]);
  return rows;
}

// ── RESERVACIONES ─────────────────────────────────────────────────────────────

async function guardarReservacion(reservacion) {
  await pool.query(`
    INSERT INTO reservaciones (id, fecha_registro, estado, telefono_cliente, nombre, fecha, hora, personas, sucursal)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
  `, [
    reservacion.id, reservacion.fecha_registro, reservacion.estado,
    reservacion.telefono_cliente, reservacion.nombre, reservacion.fecha,
    reservacion.hora, reservacion.personas, reservacion.sucursal
  ]);
}

async function obtenerReservaciones(sucursal, rol) {
  let query = "SELECT * FROM reservaciones ORDER BY fecha_registro DESC LIMIT 200";
  let params = [];
  if (rol !== "gerente" && sucursal) {
    query = "SELECT * FROM reservaciones WHERE sucursal ILIKE $1 ORDER BY fecha_registro DESC LIMIT 200";
    params = [`%${sucursal}%`];
  }
  const { rows } = await pool.query(query, params);
  return rows;
}

async function actualizarEstadoReservacion(id, estado) {
  const { rows } = await pool.query(
    "UPDATE reservaciones SET estado=$1, actualizado=NOW() WHERE id=$2 RETURNING *",
    [estado, id]
  );
  return rows[0] || null;
}

// ── CONVERSACIONES ────────────────────────────────────────────────────────────

async function obtenerHistorial(telefono) {
  const { rows } = await pool.query(
    "SELECT historial FROM conversaciones WHERE telefono=$1",
    [telefono]
  );
  return rows[0]?.historial || [];
}

async function guardarHistorial(telefono, historial) {
  // Limitar a 12 mensajes (6 turnos) para no crecer indefinidamente
  const historialLimitado = historial.slice(-12);
  await pool.query(`
    INSERT INTO conversaciones (telefono, historial, actualizado)
    VALUES ($1, $2, NOW())
    ON CONFLICT (telefono) DO UPDATE SET
      historial = $2,
      actualizado = NOW()
  `, [telefono, JSON.stringify(historialLimitado)]);
}

module.exports = {
  initDB,
  guardarPedido,
  obtenerPedidos,
  actualizarEstadoPedido,
  actualizarGPSPedido,
  obtenerStatsPedidos,
  guardarReservacion,
  obtenerReservaciones,
  actualizarEstadoReservacion,
  obtenerHistorial,
  guardarHistorial,
};
