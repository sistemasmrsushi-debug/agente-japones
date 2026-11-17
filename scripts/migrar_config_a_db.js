// scripts/migrar_config_a_db.js
// =============================================
// Migracion UNICA: carga las sucursales y el menu
// desde config/restaurante.js hacia las tablas
// nuevas de PostgreSQL.
//
// Uso (una sola vez, desde la raiz del proyecto):
//   node scripts/migrar_config_a_db.js
//
// Es seguro correrlo mas de una vez: usa
// "ON CONFLICT DO NOTHING", asi que no duplica ni
// sobreescribe filas que ya existan.
//
// CORREGIDO (17-nov-2026, hallazgo de seguridad al revisar la integracion
// con Telnet): este archivo traia, en TEXTO PLANO, las contraseñas reales de
// las 26 cuentas del dashboard (las 25 sucursales + gerente) -- cualquiera
// con acceso al repositorio podia leerlas de un vistazo. Esa migracion de
// usuarios ya no hace falta (los 26 usuarios ya existen en la base de
// datos -- este script usa "ON CONFLICT DO NOTHING", asi que de todos modos
// ya no tocaba nada aqui desde hace tiempo). Las contraseñas reales se
// rotaron (ver scripts/rotar_passwords_dashboard.js) y este bloque se quito
// por completo. Si alguna vez hace falta crear un usuario nuevo del
// dashboard, se hace desde el panel de administracion (Administración →
// Usuarios, con el rol "gerente"), nunca escribiendo la contraseña aqui.
// =============================================
require("dotenv").config();
const db = require("../src/db/database");
const restaurante = require("../config/restaurante");

async function migrar() {
  await db.initDB(); // crea las tablas nuevas si no existen

  console.log("Migrando sucursales...");
  for (const s of restaurante.sucursales) {
    await db.insertarSucursalSiNoExiste({
      id: s.id,
      nombre: s.nombre,
      tipo: s.tipo,
      zona: s.zona,
      direccion: s.direccion,
      telefono: s.telefono,
      telefono_transferencia: s.telefono_transferencia,
      whatsapp: s.whatsapp,
      horario_apertura: s.horario_propio?.abre || null,
      horario_cierre: s.horario_propio?.cierra || null,
    });
  }
  console.log(`  ${restaurante.sucursales.length} sucursales procesadas.`);

  console.log("Migrando menu...");
  const menuExistente = await db.obtenerMenu();
  if (menuExistente.length > 0) {
    console.log(`  El menu ya tiene ${menuExistente.length} platillos cargados. Se omite para no duplicar.`);
  } else {
    let totalItems = 0;
    for (const [categoria, items] of Object.entries(restaurante.menu)) {
      let orden = 0;
      for (const item of items) {
        await db.crearItemMenu({
          categoria,
          nombre: item.nombre,
          precio: item.precio,
          descripcion: item.descripcion,
          orden: orden++,
        });
        totalItems++;
      }
    }
    console.log(`  ${totalItems} platillos procesados.`);
  }

  // La migracion de usuarios del dashboard se quito de aqui (ver el
  // comentario al principio del archivo) -- ya no hace falta.

  console.log("\nMigracion completa. Es seguro volver a correr este script si hace falta.");
  process.exit(0);
}

migrar().catch((err) => {
  console.error("Error en la migracion:", err);
  process.exit(1);
});
