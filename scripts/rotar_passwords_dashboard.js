// scripts/rotar_passwords_dashboard.js
// =============================================
// Rota (cambia) la contraseña de TODOS los usuarios del dashboard,
// generando una nueva al azar para cada uno y guardando solo su hash
// (bcrypt) en la base de datos -- igual que hace el panel de administracion
// cuando un gerente cambia la contraseña de alguien manualmente.
//
// Por que existe: scripts/migrar_config_a_db.js traia, en texto plano, las
// contraseñas reales de los 26 usuarios (ver el comentario ahi). Aunque ya
// se quitaron de ese archivo, siguen visibles en el HISTORIAL de git -- la
// unica forma de que esas contraseñas viejas dejen de servir para algo es
// cambiarlas todas por unas nuevas. Correr este script una vez resuelve eso
// de raiz (no hace falta limpiar el historial de git para estar a salvo,
// aunque sigue siendo buena idea hacerlo despues si quieres).
//
// Uso (desde la raiz del proyecto, con tu .env de producción apuntando a la
// base de datos real -- igual que los demas scripts de esta carpeta):
//   node scripts/rotar_passwords_dashboard.js
//
// Al terminar, las contraseñas NUEVAS quedan escritas en:
//   data/contrasenas_nuevas_dashboard.txt
// (la carpeta "data/" ya esta en .gitignore, nunca se sube a git). Repartelas
// a cada sucursal por el medio que uses normalmente (WhatsApp, en persona,
// etc.) y DESPUES BORRA ese archivo de tu computadora -- ya cumplio su
// función en cuanto cada quien tiene su contraseña nueva.
// =============================================
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Contraseña facil de leer/dictar por telefono pero dificil de adivinar:
// 4 palabras simples + 2 digitos, ej. "rio-sol-pez-luz42". Evita caracteres
// ambiguos (0/O, 1/l/I) a proposito.
const PALABRAS = [
  "rio","sol","pez","luz","mar","sal","tos","ave","oso","paz","red","gol",
  "bus","can","dia","fin","gas","haz","isla","joya","kilo","lago","masa","nube",
  "olas","piso","queso","roca","seda","tela","uva","vaso","web","yoga","zona",
];

function generarPassword() {
  const elegidas = [];
  for (let i = 0; i < 4; i++) {
    elegidas.push(PALABRAS[crypto.randomInt(PALABRAS.length)]);
  }
  const numero = crypto.randomInt(10, 99);
  return `${elegidas.join("-")}${numero}`;
}

async function rotar() {
  const { rows } = await pool.query("SELECT usuario FROM dashboard_usuarios ORDER BY usuario");
  console.log(`Encontrados ${rows.length} usuarios del dashboard.\n`);

  const lineas = [
    `Contraseñas nuevas del dashboard Mr. Sushi -- generadas ${new Date().toLocaleString("es-MX")}`,
    `Repartelas y DESPUES BORRA este archivo.`,
    "",
  ];

  for (const u of rows) {
    const nueva = generarPassword();
    const hash = await bcrypt.hash(nueva, 10);
    await pool.query("UPDATE dashboard_usuarios SET password = $1 WHERE usuario = $2", [hash, u.usuario]);
    lineas.push(`${u.usuario}: ${nueva}`);
    console.log(`  [OK] ${u.usuario} -- nueva contraseña generada`);
  }

  const carpetaData = path.join(__dirname, "..", "data");
  fs.mkdirSync(carpetaData, { recursive: true });
  const archivoSalida = path.join(carpetaData, "contrasenas_nuevas_dashboard.txt");
  fs.writeFileSync(archivoSalida, lineas.join("\n") + "\n", "utf-8");

  console.log(`\nListo. ${rows.length} contraseñas rotadas.`);
  console.log(`\nLas contraseñas nuevas quedaron en: ${archivoSalida}`);
  console.log(`Repartelas a cada sucursal y DESPUES BORRA ese archivo -- ya no se necesita.`);
  console.log(`\nNadie podra volver a entrar con su contraseña vieja a partir de ahora.`);
  process.exit(0);
}

rotar().catch((err) => {
  console.error("Error rotando contraseñas:", err);
  process.exit(1);
});
