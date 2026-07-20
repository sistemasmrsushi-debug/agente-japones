// scripts/geocodificar_sucursales.js
// =============================================
// Migracion UNICA: obtiene la latitud/longitud real de
// cada sucursal (a partir de su direccion ya guardada en
// la base de datos) usando Google Maps, y las guarda en
// las columnas lat/lng de la tabla "sucursales".
//
// Esto es necesario para poder calcular la distancia real
// entre el domicilio del cliente y cada sucursal (filtro de
// radio de entrega).
//
// Uso (una sola vez, desde la raiz del proyecto):
//   node scripts/geocodificar_sucursales.js
//
// Es seguro correrlo mas de una vez: si una sucursal ya tiene
// lat/lng guardadas, se omite (a menos que uses --forzar).
// =============================================
require("dotenv").config();
const db = require("../src/db/database");
const { validarDireccion } = require("../src/utils/geocoding");

const FORZAR = process.argv.includes("--forzar");

async function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function migrar() {
  await db.initDB();

  const sucursales = await db.obtenerSucursales();
  console.log(`Encontradas ${sucursales.length} sucursales.\n`);

  let geocodificadas = 0;
  let omitidas = 0;
  let fallidas = 0;

  for (const s of sucursales) {
    if (!FORZAR && s.lat && s.lng) {
      console.log(`  [omitida] ${s.nombre} — ya tiene coordenadas (${s.lat}, ${s.lng})`);
      omitidas++;
      continue;
    }

    if (!s.direccion) {
      console.log(`  [SIN DIRECCION] ${s.nombre} — no se puede geocodificar, falta direccion en la base de datos`);
      fallidas++;
      continue;
    }

    const resultado = await validarDireccion(s.direccion);

    if (!resultado.valida || !resultado.coords) {
      console.log(`  [FALLO] ${s.nombre} — Google no pudo geocodificar: "${s.direccion}"`);
      fallidas++;
    } else {
      await db.actualizarCoordenadasSucursal(s.id, resultado.coords.lat, resultado.coords.lng);
      console.log(`  [OK] ${s.nombre} -> (${resultado.coords.lat}, ${resultado.coords.lng})`);
      geocodificadas++;
    }

    // Pausa pequeña para no saturar la API de Google Maps
    await esperar(200);
  }

  console.log(`\nListo. Geocodificadas: ${geocodificadas} | Omitidas (ya tenian): ${omitidas} | Fallidas: ${fallidas}`);
  if (fallidas > 0) {
    console.log(`\nIMPORTANTE: revisa manualmente las sucursales que fallaron -- probablemente su`);
    console.log(`campo "direccion" en la base de datos esta incompleto o mal escrito. Corrigelo`);
    console.log(`desde el panel de Administracion (Sucursales) y vuelve a correr este script.`);
  }
  process.exit(0);
}

migrar().catch((err) => {
  console.error("Error geocodificando sucursales:", err);
  process.exit(1);
});
