// Ejecutar UNA SOLA VEZ para limpiar historial de pruebas
// node limpiar_historial.js
require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function limpiar() {
  try {
    const r1 = await pool.query("DELETE FROM conversaciones");
    const r2 = await pool.query("DELETE FROM pedidos");
    const r3 = await pool.query("DELETE FROM reservaciones");
    console.log(`Limpiado: ${r1.rowCount} conversaciones, ${r2.rowCount} pedidos, ${r3.rowCount} reservaciones`);
  } catch(e) {
    console.error("Error:", e.message);
  } finally {
    await pool.end();
  }
}

limpiar();
