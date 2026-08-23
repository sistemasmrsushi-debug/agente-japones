// consultar_pedido.js
// Consulta directo a la base de datos (Postgres) los datos de direccion/GPS
// que se guardaron para un pedido especifico -- para diagnosticar por que
// Uber Direct rechazo una entrega con "failed to create location".
//
// Uso (con las variables de Railway, ya que DATABASE_URL solo existe ahi):
//   railway run node consultar_pedido.js PED-1787431859188

require("dotenv").config();
const { Pool } = require("pg");

const id = process.argv[2];
if (!id) {
  console.error("Uso: node consultar_pedido.js <ID_PEDIDO>");
  process.exit(1);
}

// DATABASE_URL es la direccion INTERNA de Railway (postgres.railway.internal)
// -- solo funciona entre servicios dentro de Railway, no desde tu maquina
// aunque uses "railway run". Para conectarnos desde afuera hace falta la
// version publica.
const connectionString = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error("ERROR: no se encontro DATABASE_PUBLIC_URL ni DATABASE_URL. Corre esto con: railway run node consultar_pedido.js " + id);
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  const { rows } = await pool.query(
    `SELECT id, fecha, estado, tipo, direccion, colonia, municipio, estado_direccion, codigo_postal, ubicacion_gps, sucursal
     FROM pedidos WHERE id = $1`,
    [id]
  );
  if (!rows.length) {
    console.log(`No se encontro ningun pedido con id ${id}`);
  } else {
    console.log(JSON.stringify(rows[0], null, 2));
  }
  await pool.end();
})().catch((e) => {
  console.error("Error consultando la base de datos:", e.message);
  process.exit(1);
});
