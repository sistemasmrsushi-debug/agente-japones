// UN SOLO USO: corrige coordenadas + direccion de "Lomas Verdes" (id 12)
// usando el pin real de Google Maps que dio Diego (19.49615787590437, -99.24715935582559).
// La direccion que tenia registrada ("Col. Colinas de la Gran Torre, Atizapan
// de Zaragoza") corresponde a una ubicacion ~8.5 km mas al norte -- no la
// sucursal real, que segun el pin esta a poco menos de 3 km de Fuentes de
// Satelite. Correr desde la consola de Railway: node corregir_lomas_verdes.js
const db = require("./src/db/database");
const { geocodificarInverso } = require("./src/utils/geocoding");

(async () => {
  const lat = 19.49615787590437, lng = -99.24715935582559;
  const r = await geocodificarInverso(lat, lng);
  console.log("Geocodificacion inversa:", r);

  await db.actualizarCoordenadasSucursal(12, lat, lng);
  await db.actualizarSucursal(12, { direccion: r.direccion });
  await db.actualizarDireccionSucursal(12, {
    colonia: r.colonia,
    municipio: r.municipio,
    estado_direccion: r.estado,
    codigo_postal: r.codigoPostal,
  });

  console.log("Sucursal 12 (Lomas Verdes) actualizada: coordenadas + direccion + componentes.");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
