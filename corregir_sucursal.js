// Script REUTILIZABLE (no de un solo uso): corrige coordenadas + direccion
// estructurada de UNA sucursal a partir de un pin real de Google Maps.
// Reemplaza los scripts sueltos que se hacian por cada sucursal
// (corregir_lomas_verdes.js, corregir_zona_azul.js, etc.) -- con este basta
// pasar el id de la sucursal y las coordenadas del pin como argumentos.
//
// Uso (desde la consola de Railway):
//   node corregir_sucursal.js <id_sucursal> <lat> <lng>
//
// Ejemplo:
//   node corregir_sucursal.js 19 19.50641287668937 -99.24650199600852
//
// Para ver el id y nombre de cada sucursal sin corregir nada, corre:
//   node corregir_sucursal.js
const db = require("./src/db/database");
const { geocodificarInverso } = require("./src/utils/geocoding");

async function listarSucursales() {
  const sucursales = await db.obtenerSucursales();
  console.log("Uso: node corregir_sucursal.js <id_sucursal> <lat> <lng>\n");
  console.log("Sucursales disponibles:");
  for (const s of sucursales.sort((a, b) => a.id - b.id)) {
    console.log(`  [${s.id}] ${s.nombre} (activo=${s.activo}) -- lat=${s.lat}, lng=${s.lng}`);
  }
}

(async () => {
  const [, , idArg, latArg, lngArg] = process.argv;

  if (!idArg || !latArg || !lngArg) {
    await listarSucursales();
    process.exit(0);
  }

  const id = Number(idArg);
  const lat = Number(latArg);
  const lng = Number(lngArg);

  if (!Number.isFinite(id) || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    console.error("Argumentos invalidos. Uso: node corregir_sucursal.js <id_sucursal> <lat> <lng>");
    process.exit(1);
  }

  const sucursales = await db.obtenerSucursales();
  const sucursal = sucursales.find(s => s.id === id);
  if (!sucursal) {
    console.error(`No existe ninguna sucursal con id ${id}.`);
    await listarSucursales();
    process.exit(1);
  }

  const r = await geocodificarInverso(lat, lng);
  console.log("Geocodificacion inversa:", r);

  await db.actualizarCoordenadasSucursal(id, lat, lng);
  await db.actualizarSucursal(id, { direccion: r.direccion });
  await db.actualizarDireccionSucursal(id, {
    colonia: r.colonia,
    municipio: r.municipio,
    estado_direccion: r.estado,
    codigo_postal: r.codigoPostal,
  });

  console.log(`Sucursal ${id} (${sucursal.nombre}) actualizada: coordenadas + direccion + componentes.`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
