// src/backfill_direccion_sucursales.js
// Script de UN SOLO USO (26-ago-2026): geocodifica la direccion de cada
// sucursal (columna "direccion", texto completo) para extraer colonia,
// municipio, estado y codigo postal por separado, y los guarda en las
// columnas nuevas de la tabla "sucursales" (colonia, municipio,
// estado_direccion, codigo_postal).
//
// Por que hace falta: Uber Direct exige (feedback real de certificacion,
// ver correo de Grupo Telnet) que la direccion se mande ESTRUCTURADA
// (calle separada de colonia/ciudad/estado/CP), no como un solo texto.
// uber_direct.js ya sabe usar estas columnas nuevas si existen -- mientras
// no se corra este script, sigue cayendo de vuelta al texto completo
// (comportamiento identico al de antes, sin riesgo).
//
// Como correrlo (una sola vez, desde la consola de Railway):
//   node src/backfill_direccion_sucursales.js
//
// Es seguro correrlo mas de una vez (solo vuelve a geocodificar y
// sobreescribe con el mismo resultado).

const db = require("./db/database");
const { validarDireccion } = require("./utils/geocoding");

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const sucursales = await db.obtenerSucursales();
  console.log(`Encontradas ${sucursales.length} sucursales. Geocodificando una por una...\n`);

  let ok = 0;
  let fallidas = 0;

  for (const sucursal of sucursales) {
    if (!sucursal.direccion) {
      console.log(`[${sucursal.id}] "${sucursal.nombre}" -- SIN direccion registrada, se omite.`);
      fallidas++;
      continue;
    }

    const resultado = await validarDireccion(sucursal.direccion);

    if (!resultado.valida || !resultado.municipio || !resultado.estado) {
      console.log(`[${sucursal.id}] "${sucursal.nombre}" -- no se pudo geocodificar completa (colonia/municipio/estado). Seguira usando el texto completo como fallback. Respuesta: ${JSON.stringify(resultado)}`);
      fallidas++;
      // Esperar igual antes de la siguiente, para no exceder el limite de Google.
      await esperar(250);
      continue;
    }

    await db.actualizarDireccionSucursal(sucursal.id, {
      colonia: resultado.colonia,
      municipio: resultado.municipio,
      estado_direccion: resultado.estado,
      codigo_postal: resultado.codigoPostal,
    });

    console.log(`[${sucursal.id}] "${sucursal.nombre}" -> colonia="${resultado.colonia}", municipio="${resultado.municipio}", estado="${resultado.estado}", cp="${resultado.codigoPostal}"`);
    ok++;

    // Pequeña pausa entre llamadas para no exceder el limite de la API de Google Maps.
    await esperar(250);
  }

  console.log(`\nListo. ${ok} sucursales geocodificadas correctamente, ${fallidas} sin poder completar (seguiran usando el texto completo de direccion como fallback -- revisar manualmente si son muchas).`);
  process.exit(0);
}

main().catch((error) => {
  console.error("Error corriendo el backfill:", error);
  process.exit(1);
});
