// scripts/migrar_config_a_db.js
// =============================================
// Migracion UNICA: carga las sucursales y el menu
// desde config/restaurante.js, y los usuarios del
// dashboard (con sus contraseñas ya actualizadas)
// hacia las tablas nuevas de PostgreSQL.
//
// Uso (una sola vez, desde la raiz del proyecto):
//   node scripts/migrar_config_a_db.js
//
// Es seguro correrlo mas de una vez: usa
// "ON CONFLICT DO NOTHING", asi que no duplica ni
// sobreescribe filas que ya existan.
// =============================================
require("dotenv").config();
const db = require("../src/db/database");
const restaurante = require("../config/restaurante");

// Usuarios del dashboard con las contraseñas YA actualizadas
// (las mismas que quedaron activas en el ultimo deploy).
const USUARIOS = [
  { usuario: "vallejo",             password: "X@xBEAFBw4!K2v",  sucursal: "Vallejo",               rol: "sucursal" },
  { usuario: "zonaesmeralda",       password: "SV8j5ek3Vjq%vU",  sucursal: "Zona Esmeralda",        rol: "sucursal" },
  { usuario: "arboledas",           password: "R%y7S-Hd2u@t!u",  sucursal: "Arboledas",             rol: "sucursal" },
  { usuario: "zonaazulrest",        password: "GG%ta4H-2yDkGQ",  sucursal: "Zona Azul Restaurante", rol: "sucursal" },
  { usuario: "mundoe",              password: "ENKcUw5c--grEc",  sucursal: "Mundo E",               rol: "sucursal" },
  { usuario: "fuentessatelite",     password: "D=Yg3#4sjsxZeN",  sucursal: "Fuentes de Satelite",   rol: "sucursal" },
  { usuario: "patriotismo",         password: "Ed5vpnxBW-74ys",  sucursal: "Patriotismo",           rol: "sucursal" },
  { usuario: "hahhaazul",           password: "Zh@R6d@=pKKy4c",  sucursal: "Hahha Azul",            rol: "sucursal" },
  { usuario: "masaryk",             password: "Kd9U@kgxHK@zFc",  sucursal: "Masaryk",               rol: "sucursal" },
  { usuario: "americana",           password: "Ws#at8t*8mghZ=",  sucursal: "Americana",             rol: "sucursal" },
  { usuario: "tecamachalco",        password: "H!!r8!%!*4n7#%",  sucursal: "Tecamachalco",          rol: "sucursal" },
  { usuario: "galeriasmetepec",     password: "Yp4zA@4wsDxN!G",  sucursal: "Galerias Metepec",      rol: "sucursal" },
  { usuario: "galeriasserdan",      password: "JG+-hzs4Dq9zFb",  sucursal: "Galerias Serdan",       rol: "sucursal" },
  { usuario: "urbancenter",         password: "S=J*2Pg!W%5uru",  sucursal: "Urban Center",          rol: "sucursal" },
  { usuario: "hahhaesmeralda",      password: "Ns%u=hWX8vpbyz",  sucursal: "Hahha Esmeralda",       rol: "sucursal" },
  { usuario: "patiosantafe",        password: "Q#VXP!*2Zyz9ep",  sucursal: "Patio Santa Fe",        rol: "sucursal" },
  { usuario: "atizapan",            password: "Dc=bHfEws3a4x!",  sucursal: "Atizapan",              rol: "sucursal" },
  { usuario: "zonaazuldom",         password: "P5j9@UySRaR6+Q",  sucursal: "Zona Azul Domicilio",   rol: "sucursal" },
  { usuario: "perisur",             password: "SR+vCyn67Nxmht",  sucursal: "Perisur",               rol: "sucursal" },
  { usuario: "lomasverdes",         password: "FHsM-FjPe95Abq",  sucursal: "Lomas Verdes",          rol: "sucursal" },
  { usuario: "delta",               password: "Ej*5tJ8msMWy8f",  sucursal: "Delta",                 rol: "sucursal" },
  { usuario: "coapa",               password: "NRdVABu5*wghb6",  sucursal: "Coapa",                 rol: "sucursal" },
  { usuario: "galeriástoluca",      password: "S@uT#-R+8RBpmj",  sucursal: "Galerias Toluca",       rol: "sucursal" },
  { usuario: "galeriascuernavaca",  password: "PzP7x2T-ZbU9z%",  sucursal: "Galerias Cuernavaca",   rol: "sucursal" },
  { usuario: "ccsantafe",           password: "U4X+JtH6gc#3m9",  sucursal: "CC Santa Fe",           rol: "sucursal" },
  { usuario: "gerente",             password: "TexbT%%mgt-46zfe", sucursal: null,                   rol: "gerente"  },
];

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

  console.log("Migrando usuarios del dashboard...");
  for (const u of USUARIOS) {
    await db.insertarUsuarioDashboardSiNoExiste(u);
  }
  console.log(`  ${USUARIOS.length} usuarios procesados.`);

  console.log("\nMigracion completa. Es seguro volver a correr este script si hace falta.");
  process.exit(0);
}

migrar().catch((err) => {
  console.error("Error en la migracion:", err);
  process.exit(1);
});
