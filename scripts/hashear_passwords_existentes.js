// scripts/hashear_passwords_existentes.js
// =============================================
// Migracion UNICA: encripta (con bcrypt) las contrasenas de los
// usuarios del dashboard que todavia esten guardadas en texto plano.
//
// Es SEGURO correr esto mas de una vez -- si una contrasena ya esta
// encriptada (empieza con $2a$, $2b$ o $2y$), se omite.
//
// IMPORTANTE: corre este script ANTES de desplegar el cambio de login
// que usa bcrypt.compare() -- si no, nadie podra entrar al dashboard,
// porque las contrasenas en texto plano nunca coincidiran con la
// comparacion seudoencriptada.
//
// Uso (una sola vez, desde la raiz del proyecto):
//   node scripts/hashear_passwords_existentes.js
// =============================================
require("dotenv").config();
const bcrypt = require("bcryptjs");
const db = require("../src/db/database");
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

function pareceHashBcrypt(valor) {
  return /^\$2[aby]\$/.test(valor || "");
}

async function migrar() {
  await db.initDB();

  const { rows } = await pool.query("SELECT usuario, password FROM dashboard_usuarios");
  console.log(`Encontrados ${rows.length} usuarios.\n`);

  let encriptados = 0;
  let omitidos = 0;

  for (const u of rows) {
    if (pareceHashBcrypt(u.password)) {
      console.log(`  [omitido] ${u.usuario} — ya esta encriptada`);
      omitidos++;
      continue;
    }

    const hash = await bcrypt.hash(u.password, 10);
    await pool.query("UPDATE dashboard_usuarios SET password = $1 WHERE usuario = $2", [hash, u.usuario]);
    console.log(`  [OK] ${u.usuario} — contrasena encriptada`);
    encriptados++;
  }

  console.log(`\nListo. Encriptados: ${encriptados} | Ya estaban encriptados: ${omitidos}`);
  console.log(`\nLas contrasenas siguen siendo las MISMAS de antes (nadie tiene que`);
  console.log(`cambiarla) -- solo ahora estan guardadas de forma segura.`);
  process.exit(0);
}

migrar().catch((err) => {
  console.error("Error encriptando contrasenas:", err);
  process.exit(1);
});
