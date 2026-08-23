// probar_uber_direct.js
// Prueba aislada de la integracion con Uber Direct usando el modo "Robo Courier"
// (repartidor SIMULADO -- no se despacha a nadie de verdad, no cuesta nada real).
//
// No toca la base de datos ni el flujo del bot -- solo llama directo a
// src/utils/uber_direct.js, igual que consultar_transaccion.js prueba Netpay
// por separado.
//
// Uso:
//   node probar_uber_direct.js
//
// Pickup y dropoff ya vienen cargados con dos sucursales reales (Masaryk y
// Vallejo, tomadas de config/restaurante.js). OJO: las coordenadas lat/lng
// de produccion solo existen en la base de datos (las genera en runtime
// scripts/geocodificar_sucursales.js via Google Maps) -- no estan comiteadas
// en el repo, asi que aqui puse coordenadas aproximadas de cada zona. Para
// una prueba de Robo Courier (repartidor simulado) esto es suficiente; si
// prefieres las coordenadas exactas de produccion, se pueden sacar con un
// SELECT lat, lng FROM sucursales WHERE nombre IN ('Masaryk','Vallejo');

require("dotenv").config();
const { crearCotizacion, crearEntrega } = require("./src/utils/uber_direct");

const REQUERIDAS = ["UBER_DIRECT_CLIENT_ID", "UBER_DIRECT_CLIENT_SECRET", "UBER_DIRECT_CUSTOMER_ID"];
const faltantes = REQUERIDAS.filter((v) => !process.env[v]);
if (faltantes.length) {
  console.error(`ERROR: faltan estas variables en tu .env local: ${faltantes.join(", ")}`);
  console.error("Si esas credenciales solo existen en Railway, corre esta prueba desde ahi (railway run node probar_uber_direct.js) en vez de local.");
  process.exit(1);
}

const pickup = {
  nombre: "Mr. Sushi Masaryk",
  calle: "Av. Presidente Masaryk",
  ciudad: "CDMX",
  estado: "CDMX",
  codigoPostal: "11560",
  telefono: "+525552805481",
  lat: 19.4335,
  lng: -99.1937,
};
const dropoff = {
  nombre: "Mr. Sushi Vallejo (destino de prueba)",
  calle: "Calle Talavera 14, Via Vallejo",
  ciudad: "CDMX",
  estado: "CDMX",
  codigoPostal: "02300",
  telefono: "+525553082457",
  lat: 19.4867,
  lng: -99.1642,
};

async function main() {
  console.log("1) Pidiendo cotizacion...");
  const cotizacion = await crearCotizacion({ pickup, dropoff });
  console.log(JSON.stringify(cotizacion, null, 2));

  console.log("\n2) Creando entrega de PRUEBA (Robo Courier, sin despacho real)...");
  const entrega = await crearEntrega({
    pickup,
    dropoff,
    items: [{ nombre: "Rollo de prueba", cantidad: 1, precio: 150 }],
    referencia: "PRUEBA-ROBOCOURIER-" + Date.now(),
    quoteId: cotizacion.exito ? cotizacion.quoteId : undefined,
    testSpecifications: { robo_courier_specification: { mode: "auto" } },
  });
  console.log(JSON.stringify(entrega, null, 2));

  if (entrega.exito) {
    console.log(`\nOK -- entrega de prueba creada. deliveryId=${entrega.deliveryId}, trackingUrl=${entrega.trackingUrl || "(sin url)"}`);
  } else {
    console.log(`\nFallo la entrega de prueba: ${entrega.error}`);
  }
}

main().catch((e) => {
  console.error("Error inesperado:", e.message);
  process.exit(1);
});
