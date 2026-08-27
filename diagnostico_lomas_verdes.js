// UN SOLO USO: compara la distancia real desde "Avenida Lomas Verdes 22"
// contra las 4 sucursales de esa zona (Lomas Verdes, Fuentes de Satelite,
// Zona Azul Restaurante, Hahha Azul), ya con las coordenadas corregidas de
// Lomas Verdes, para confirmar cual deberia ganar la asignacion automatica.
// Correr desde la consola de Railway: node diagnostico_lomas_verdes.js
const db = require("./src/db/database");
const { validarDireccion, calcularDistanciaKm } = require("./src/utils/geocoding");

const DIRECCION_PRUEBA = "Avenida Lomas Verdes 22";
const IDS_A_COMPARAR = [12, 5, 19, 10]; // Lomas Verdes, Fuentes de Satelite, Zona Azul Restaurante, Hahha Azul

(async () => {
  const resultado = await validarDireccion(DIRECCION_PRUEBA);
  console.log("Geocodificacion de la direccion de prueba:", resultado);

  if (!resultado.coords) {
    console.error("No se pudo geocodificar la direccion de prueba -- abortando.");
    process.exit(1);
  }

  const sucursales = await db.obtenerSucursales();
  const distancias = [];

  for (const id of IDS_A_COMPARAR) {
    const s = sucursales.find(s => s.id === id);
    if (!s) {
      console.log(`[${id}] no encontrada en la BD, se omite.`);
      continue;
    }
    if (!s.lat || !s.lng) {
      console.log(`[${id}] "${s.nombre}" (activo=${s.activo}) -- sin coordenadas registradas, se omite.`);
      continue;
    }
    const km = calcularDistanciaKm(resultado.coords.lat, resultado.coords.lng, Number(s.lat), Number(s.lng));
    distancias.push({ id, nombre: s.nombre, activo: s.activo, km });
  }

  distancias.sort((a, b) => a.km - b.km);

  console.log("\n--- Distancias desde 'Avenida Lomas Verdes 22' (ordenadas, mas cercana primero) ---");
  for (const d of distancias) {
    console.log(`${d.nombre} (id ${d.id}, activo=${d.activo}): ${d.km.toFixed(2)} km`);
  }

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
