// UN SOLO USO: corrige coordenadas + direccion de "Zona Azul Restaurante"
// (id 19) usando el pin real de Google Maps que dio Diego
// (19.50641287668937, -99.24650199600852).
// Correr desde la consola de Railway: node corregir_zona_azul.js
const db = require("./src/db/database");
const { geocodificarInverso } = require("./src/utils/geocoding");

(async () => {
  const lat = 19.50641287668937, lng = -99.24650199600852;
  const r = await geocodificarInverso(lat, lng);
  console.log("Geocodificacion inversa:", r);

  await db.actualizarCoordenadasSucursal(19, lat, lng);
  await db.actualizarSucursal(19, { direccion: r.direccion });
  await db.actualizarDireccionSucursal(19, {
    colonia: r.colonia,
    municipio: r.municipio,
    estado_direccion: r.estado,
    codigo_postal: r.codigoPostal,
  });

  console.log("Sucursal 19 (Zona Azul Restaurante) actualizada: coordenadas + direccion + componentes.");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
