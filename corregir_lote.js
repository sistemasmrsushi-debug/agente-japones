// UN SOLO USO: corrige coordenadas + direccion de varias sucursales de una
// sola vez, usando los pines reales de Google Maps que dio Diego.
// Reusa la misma logica que corregir_sucursal.js (geocodificacion inversa +
// actualizar coordenadas/direccion/componentes), pero para todo el lote en
// un solo comando en vez de uno por uno.
// Correr desde la consola de Railway: node corregir_lote.js

const db = require("./src/db/database");
const { geocodificarInverso } = require("./src/utils/geocoding");

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// [id, lat, lng] -- pines reales confirmados por Diego (comparados contra
// las coordenadas que ya estaban guardadas).
const CORRECCIONES = [
  [2,  19.5584051997752,   -99.2101686166419],   // Arboledas
  [7,  19.302927141877817, -99.12285955411204],  // Coapa
  [8,  18.93619700168463,  -99.19266478538354],  // Cuernavaca
  [13, 19.431661347579123, -99.19573737372392],  // Masaryk
  [15, 19.52469110802491,  -99.22660298478726],  // Mundo E
  [16, 19.39616582096208,  -99.1802819295501],   // Patriotismo
  [17, 19.304879940183934, -99.1890201313959],   // Perisur
  [19, 19.50590378210021,  -99.24676604462063],  // Zona Azul Restaurante
  [20, 19.506010082690054, -99.24705023254249],  // Satélite Anexo
  [21, 19.428507404279873, -99.22672391546794],  // Tecamachalco
  [22, 19.289457500465215, -99.62097409887292],  // Galerías Toluca
  [24, 19.487240795528656, -99.15177523566732],  // Vallejo
];

(async () => {
  const sucursales = await db.obtenerSucursales();

  for (const [id, lat, lng] of CORRECCIONES) {
    const sucursal = sucursales.find(s => s.id === id);
    if (!sucursal) {
      console.log(`[${id}] no encontrada en la BD, se omite.`);
      continue;
    }

    const r = await geocodificarInverso(lat, lng);

    await db.actualizarCoordenadasSucursal(id, lat, lng);
    await db.actualizarSucursal(id, { direccion: r.direccion });
    await db.actualizarDireccionSucursal(id, {
      colonia: r.colonia,
      municipio: r.municipio,
      estado_direccion: r.estado,
      codigo_postal: r.codigoPostal,
    });

    console.log(`[${id}] "${sucursal.nombre}" actualizada -> "${r.direccion}"`);

    // Pequeña pausa entre llamadas para no exceder el limite de la API de Google Maps.
    await esperar(250);
  }

  console.log("\nListo. Lote de correcciones aplicado.");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
