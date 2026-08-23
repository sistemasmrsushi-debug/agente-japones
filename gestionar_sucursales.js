// gestionar_sucursales.js
// Activa o desactiva sucursales (columna "activo" en la tabla sucursales).
// Una sucursal desactivada deja de ofrecerse/asignarse a pedidos nuevos, sin
// borrarla ni tocar config/restaurante.js.
//
// Uso (con las variables de Railway del servicio de Postgres, ya que se
// necesita DATABASE_PUBLIC_URL -- ver nota abajo):
//   node gestionar_sucursales.js desactivar "Hahha Azul" "Hahha Esmeralda"
//   node gestionar_sucursales.js activar "Hahha Azul"
//   node gestionar_sucursales.js listar

require("dotenv").config();
const { Pool } = require("pg");

const [, , accion, ...nombres] = process.argv;

if (!accion || !["activar", "desactivar", "listar"].includes(accion)) {
  console.error("Uso: node gestionar_sucursales.js <activar|desactivar|listar> [\"Nombre Sucursal\" ...]");
  process.exit(1);
}
if (accion !== "listar" && nombres.length === 0) {
  console.error(`Uso: node gestionar_sucursales.js ${accion} "Nombre Sucursal" ["Otra Sucursal" ...]`);
  process.exit(1);
}

// DATABASE_URL es la direccion INTERNA de Railway -- solo funciona entre
// servicios dentro de Railway. Para correr esto desde tu maquina (aunque sea
// con "railway run") hace falta la version publica, que solo existe en las
// variables del servicio de Postgres (corre "railway service" y selecciona
// Postgres antes de este comando).
const connectionString = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("ERROR: no se encontro DATABASE_PUBLIC_URL ni DATABASE_URL. Corre esto con: railway run node gestionar_sucursales.js " + accion + " ...");
  process.exit(1);
}

const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

(async () => {
  if (accion === "listar") {
    const { rows } = await pool.query("SELECT nombre, activo FROM sucursales ORDER BY nombre");
    for (const r of rows) {
      console.log(`${r.activo ? "ACTIVA  " : "INACTIVA"} - ${r.nombre}`);
    }
    await pool.end();
    return;
  }

  const activo = accion === "activar";
  for (const nombre of nombres) {
    const { rows } = await pool.query(
      "UPDATE sucursales SET activo = $1, actualizado = NOW() WHERE nombre = $2 RETURNING nombre, activo",
      [activo, nombre]
    );
    if (rows.length === 0) {
      console.log(`No se encontro ninguna sucursal con el nombre exacto "${nombre}"`);
    } else {
      console.log(`${rows[0].nombre} -> activo=${rows[0].activo}`);
    }
  }
  await pool.end();
})().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
