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
        nombre_cliente TEXT,
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
    // La tabla "pedidos" ya existia en produccion antes de agregar nombre_cliente.
    // CREATE TABLE IF NOT EXISTS no modifica tablas ya creadas, por eso este ALTER
    // explicito es necesario para que la columna aparezca en la base de datos real.
    await client.query(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS nombre_cliente TEXT;`);
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
    // ── Panel de administracion: sucursales, menu y usuarios editables ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS sucursales (
        id INTEGER PRIMARY KEY,
        nombre TEXT NOT NULL,
        tipo TEXT NOT NULL,
        zona TEXT,
        direccion TEXT,
        telefono TEXT,
        telefono_transferencia TEXT,
        whatsapp TEXT,
        horario_apertura TEXT,
        horario_cierre TEXT,
        actualizado TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS menu_items (
        id SERIAL PRIMARY KEY,
        categoria TEXT NOT NULL,
        nombre TEXT NOT NULL,
        precio NUMERIC(10,2) NOT NULL,
        descripcion TEXT,
        orden INTEGER DEFAULT 0,
        activo BOOLEAN DEFAULT TRUE,
        actualizado TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS dashboard_usuarios (
        usuario TEXT PRIMARY KEY,
        password TEXT NOT NULL,
        sucursal TEXT,
        rol TEXT NOT NULL DEFAULT 'sucursal',
        actualizado TIMESTAMPTZ DEFAULT NOW()
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
    INSERT INTO pedidos (id, fecha, estado, telefono_cliente, nombre_cliente, sucursal, items, tipo, direccion, colonia, referencias, ubicacion_gps)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (id) DO UPDATE SET
      estado = EXCLUDED.estado,
      nombre_cliente = COALESCE(EXCLUDED.nombre_cliente, pedidos.nombre_cliente),
      sucursal = EXCLUDED.sucursal,
      items = EXCLUDED.items,
      ubicacion_gps = EXCLUDED.ubicacion_gps,
      actualizado = NOW()
  `, [
    pedido.id, pedido.fecha, pedido.estado, pedido.telefono_cliente, pedido.nombre_cliente || null,
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

// ── ESTADO DE PEDIDOS EN CURSO ───────────────────────────────────────────────

async function guardarEstadoPedido(telefono, estado) {
  const key = telefono + "_estado";
  // _ts marca cuando se guardo este estado, para poder detectar conversaciones
  // abandonadas (ej. cliente nunca respondio) y no confundir un mensaje nuevo
  // de horas despues con la respuesta que se estaba esperando.
  const valor = JSON.stringify({ ...estado, _ts: Date.now() });
  await pool.query(
    "INSERT INTO conversaciones (telefono, historial, actualizado) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (telefono) DO UPDATE SET historial = $2::jsonb, actualizado = NOW()",
    [key, valor]
  );
}

async function obtenerEstadoPedido(telefono) {
  const key = telefono + "_estado";
  const { rows } = await pool.query(
    "SELECT historial FROM conversaciones WHERE telefono=$1",
    [key]
  );
  if (!rows[0]) return null;
  try {
    return rows[0].historial;
  } catch(e) { return null; }
}

async function eliminarEstadoPedido(telefono) {
  const key = telefono + "_estado";
  await pool.query("DELETE FROM conversaciones WHERE telefono=$1", [key]);
}

// ── SUCURSALES (editable desde el panel) ─────────────────────────────────────

async function obtenerSucursales() {
  const { rows } = await pool.query("SELECT * FROM sucursales ORDER BY nombre");
  return rows;
}

async function actualizarSucursal(id, campos) {
  const permitidos = ["direccion", "telefono", "telefono_transferencia", "whatsapp", "horario_apertura", "horario_cierre"];
  const sets = [];
  const values = [];
  let i = 1;
  for (const campo of permitidos) {
    if (campos[campo] !== undefined) {
      sets.push(`${campo} = $${i}`);
      values.push(campos[campo]);
      i++;
    }
  }
  if (sets.length === 0) return null;
  values.push(id);
  const { rows } = await pool.query(
    `UPDATE sucursales SET ${sets.join(", ")}, actualizado = NOW() WHERE id = $${i} RETURNING *`,
    values
  );
  return rows[0] || null;
}

async function insertarSucursalSiNoExiste(s) {
  await pool.query(`
    INSERT INTO sucursales (id, nombre, tipo, zona, direccion, telefono, telefono_transferencia, whatsapp, horario_apertura, horario_cierre)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (id) DO NOTHING
  `, [s.id, s.nombre, s.tipo, s.zona, s.direccion, s.telefono, s.telefono_transferencia, s.whatsapp, s.horario_apertura || null, s.horario_cierre || null]);
}

// ── MENU (editable desde el panel) ───────────────────────────────────────────

async function obtenerMenu() {
  const { rows } = await pool.query("SELECT * FROM menu_items WHERE activo = TRUE ORDER BY categoria, orden, nombre");
  return rows;
}

async function crearItemMenu({ categoria, nombre, precio, descripcion, orden }) {
  const { rows } = await pool.query(`
    INSERT INTO menu_items (categoria, nombre, precio, descripcion, orden)
    VALUES ($1,$2,$3,$4,$5) RETURNING *
  `, [categoria, nombre, precio, descripcion || "", orden || 0]);
  return rows[0];
}

async function actualizarItemMenu(id, campos) {
  const permitidos = ["categoria", "nombre", "precio", "descripcion", "orden", "activo"];
  const sets = [];
  const values = [];
  let i = 1;
  for (const campo of permitidos) {
    if (campos[campo] !== undefined) {
      sets.push(`${campo} = $${i}`);
      values.push(campos[campo]);
      i++;
    }
  }
  if (sets.length === 0) return null;
  values.push(id);
  const { rows } = await pool.query(
    `UPDATE menu_items SET ${sets.join(", ")}, actualizado = NOW() WHERE id = $${i} RETURNING *`,
    values
  );
  return rows[0] || null;
}

async function eliminarItemMenu(id) {
  await pool.query("UPDATE menu_items SET activo = FALSE WHERE id = $1", [id]);
}

// ── USUARIOS DEL DASHBOARD (editable desde el panel, solo gerente) ──────────

async function obtenerUsuariosDashboard() {
  const { rows } = await pool.query(
    "SELECT usuario, sucursal, rol, actualizado FROM dashboard_usuarios ORDER BY rol DESC, usuario"
  );
  return rows; // nunca se devuelve la columna password
}

async function obtenerUsuarioDashboardPorUsuario(usuario) {
  const { rows } = await pool.query(
    "SELECT * FROM dashboard_usuarios WHERE usuario = $1",
    [usuario.toLowerCase()]
  );
  return rows[0] || null;
}

async function crearUsuarioDashboard({ usuario, password, sucursal, rol }) {
  const { rows } = await pool.query(`
    INSERT INTO dashboard_usuarios (usuario, password, sucursal, rol)
    VALUES ($1,$2,$3,$4) RETURNING usuario, sucursal, rol, actualizado
  `, [usuario.toLowerCase(), password, sucursal || null, rol || "sucursal"]);
  return rows[0];
}

async function actualizarPasswordUsuarioDashboard(usuario, password) {
  const { rows } = await pool.query(
    "UPDATE dashboard_usuarios SET password = $1, actualizado = NOW() WHERE usuario = $2 RETURNING usuario, sucursal, rol, actualizado",
    [password, usuario.toLowerCase()]
  );
  return rows[0] || null;
}

async function eliminarUsuarioDashboard(usuario) {
  await pool.query("DELETE FROM dashboard_usuarios WHERE usuario = $1", [usuario.toLowerCase()]);
}

async function insertarUsuarioDashboardSiNoExiste(u) {
  await pool.query(`
    INSERT INTO dashboard_usuarios (usuario, password, sucursal, rol)
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (usuario) DO NOTHING
  `, [u.usuario.toLowerCase(), u.password, u.sucursal || null, u.rol || "sucursal"]);
}

// ── ENSAMBLADOR: config completa (para uso futuro del agente de IA) ────────

async function obtenerConfiguracionRestaurante(estaticos) {
  const sucursales = await obtenerSucursales();
  const menuRows = await obtenerMenu();
  const menu = {};
  for (const item of menuRows) {
    if (!menu[item.categoria]) menu[item.categoria] = [];
    menu[item.categoria].push({
      nombre: item.nombre,
      precio: Number(item.precio),
      descripcion: item.descripcion,
    });
  }
  return {
    ...estaticos, // nombre, telefono_principal, horario_general, zonas_domicilio, promociones_generales, politicas
    sucursales: sucursales.map(s => ({
      id: s.id, nombre: s.nombre, tipo: s.tipo, zona: s.zona,
      direccion: s.direccion, telefono: s.telefono,
      telefono_transferencia: s.telefono_transferencia, whatsapp: s.whatsapp,
      horario_propio: s.horario_apertura ? { abre: s.horario_apertura, cierra: s.horario_cierre } : null,
      promociones_propias: [],
    })),
    menu,
  };
}

module.exports = {
  initDB,
  guardarEstadoPedido,
  obtenerEstadoPedido,
  eliminarEstadoPedido,
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
  // Panel de administracion
  obtenerSucursales,
  actualizarSucursal,
  insertarSucursalSiNoExiste,
  obtenerMenu,
  crearItemMenu,
  actualizarItemMenu,
  eliminarItemMenu,
  obtenerUsuariosDashboard,
  obtenerUsuarioDashboardPorUsuario,
  crearUsuarioDashboard,
  actualizarPasswordUsuarioDashboard,
  eliminarUsuarioDashboard,
  insertarUsuarioDashboardSiNoExiste,
  obtenerConfiguracionRestaurante,
};
