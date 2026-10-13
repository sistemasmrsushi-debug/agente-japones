// verificar_espacio_db.js
// Muestra cuanto espacio esta usando la base de datos en total, y el
// desglose por tabla (para ver cuales pesan mas: pedidos, clientes, etc.)
//
// Uso (necesita las variables del servicio de Postgres en Railway, ya que
// requiere DATABASE_PUBLIC_URL -- corre "railway service" y selecciona
// Postgres antes de este comando):
//   railway run node verificar_espacio_db.js

require("dotenv").config();
const { Pool } = require("pg");

const connectionString = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("ERROR: no se encontro DATABASE_PUBLIC_URL ni DATABASE_URL. Corre esto con: railway service (selecciona Postgres) y luego: railway run node verificar_espacio_db.js");
  process.exit(1);
}

const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

(async () => {
  const { rows: totalRows } = await pool.query(`SELECT pg_size_pretty(pg_database_size(current_database())) AS total`);
  console.log(`\n=== Espacio total usado por la base de datos: ${totalRows[0].total} ===\n`);

  const { rows: tablas } = await pool.query(`
    SELECT
      relname AS tabla,
      pg_size_pretty(pg_total_relation_size(relid)) AS tamano,
      n_live_tup AS filas_aprox
    FROM pg_stat_user_tables
    ORDER BY pg_total_relation_size(relid) DESC
  `);

  console.log("Desglose por tabla (de mas a menos pesada):");
  for (const t of tablas) {
    console.log(`  ${t.tabla.padEnd(20)} ${t.tamano.padStart(10)}   (~${t.filas_aprox} filas)`);
  }

  console.log(`\nRecordatorio de limites por plan de Railway:`);
  console.log(`  Free/Trial: 0.5 GB | Hobby: 5 GB | Pro: 50 GB (ampliable hasta 1 TB)`);

  await pool.end();
})().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
