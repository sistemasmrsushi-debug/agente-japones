// diagnosticar_uber.js
// Aisla si el error "failed to create location" de Uber Direct viene del
// pickup (direccion de la sucursal) o del dropoff (direccion del cliente),
// probando varias combinaciones reales directo contra la API -- todas en
// modo Robo Courier (test_specifications), sin costo ni despacho real.
//
// Uso (solo necesita las credenciales de Uber Direct, no toca la base de datos):
//   railway run node diagnosticar_uber.js

require("dotenv").config();
const { crearEntrega } = require("./src/utils/uber_direct");

// Sucursal real (Hahha Azul, de config/restaurante.js). Coordenadas
// aproximadas de la zona (Cd. Satelite, Naucalpan) -- para este diagnostico
// no necesitan ser exactas, lo que se esta probando es si el TEXTO de la
// direccion se puede geocodificar, no la precision del punto.
const SUCURSAL_REAL = {
  direccion: "Cto. Circumvalación Poniente 16 L-R, Ciudad Satélite Zona Azul, Naucalpan, Méx. 53100",
  lat: 19.5075,
  lng: -99.2403,
};

// Direccion de cliente ya conocida por fallar en produccion (PED-1787518041716 / PED-1787431859188)
const DIRECCION_CLIENTE_FALLIDA = {
  direccion: "Avenida Lomas Verdes 22, Lomas Verdes Alteña II, 53120 Naucalpan de Juárez, Méx.",
  colonia: "Lomas Verdes Alteña II",
  municipio: "Naucalpan de Juárez",
  estado_direccion: "Estado de México",
  codigo_postal: "53120",
  lat: 19.5024229,
  lng: -99.2512972,
};

// Direcciones cortas que YA sabemos que funcionan (de la prueba de Robo Courier anterior)
const DROPOFF_CORTO_BUENO = { calle: "Calle Talavera 14, Via Vallejo", ciudad: "CDMX", estado: "CDMX", codigoPostal: "02300", lat: 19.4867, lng: -99.1642 };
const PICKUP_CORTO_BUENO = { calle: "Av. Presidente Masaryk", ciudad: "CDMX", estado: "CDMX", codigoPostal: "11560", lat: 19.4335, lng: -99.1937 };

function extraerCalle(direccionCompleta) {
  if (!direccionCompleta) return "";
  const idx = direccionCompleta.indexOf(",");
  return (idx === -1 ? direccionCompleta : direccionCompleta.slice(0, idx)).trim();
}

async function intentar(nombre, pickup, dropoff) {
  console.log(`\n=== ${nombre} ===`);
  console.log(`pickup.calle="${pickup.calle}" | dropoff.calle="${dropoff.calle}"`);
  const resultado = await crearEntrega({
    pickup: { nombre: "Mr. Sushi (diagnostico)", telefono: "+525500000000", ...pickup },
    dropoff: { nombre: "Cliente (diagnostico)", telefono: "+525500000000", ...dropoff },
    items: [{ nombre: "Rollo de prueba", cantidad: 1, precio: 150 }],
    referencia: "DIAG-" + Date.now(),
    testSpecifications: { robo_courier_specification: { mode: "auto" } },
  });
  if (resultado.exito) {
    console.log(`OK -- deliveryId=${resultado.deliveryId}`);
  } else {
    console.log(`FALLA -- ${resultado.error}`);
  }
  return resultado.exito;
}

(async () => {
  const pickupRealCompleto = { calle: SUCURSAL_REAL.direccion, lat: SUCURSAL_REAL.lat, lng: SUCURSAL_REAL.lng };
  const pickupRealCorto = { calle: extraerCalle(SUCURSAL_REAL.direccion), lat: SUCURSAL_REAL.lat, lng: SUCURSAL_REAL.lng };

  const dropoffRealCompleto = { calle: DIRECCION_CLIENTE_FALLIDA.direccion, lat: DIRECCION_CLIENTE_FALLIDA.lat, lng: DIRECCION_CLIENTE_FALLIDA.lng };
  const dropoffRealEstructurado = {
    calle: extraerCalle(DIRECCION_CLIENTE_FALLIDA.direccion),
    ciudad: DIRECCION_CLIENTE_FALLIDA.municipio,
    estado: DIRECCION_CLIENTE_FALLIDA.estado_direccion,
    codigoPostal: DIRECCION_CLIENTE_FALLIDA.codigo_postal,
    lat: DIRECCION_CLIENTE_FALLIDA.lat,
    lng: DIRECCION_CLIENTE_FALLIDA.lng,
  };

  const resultados = {};
  resultados["1) Pickup REAL completo (como esta en produccion) + dropoff CORTO bueno"] =
    await intentar("1) Pickup REAL completo + dropoff corto bueno", pickupRealCompleto, DROPOFF_CORTO_BUENO);

  resultados["2) Pickup CORTO bueno + dropoff REAL completo (como esta en produccion)"] =
    await intentar("2) Pickup corto bueno + dropoff REAL completo", PICKUP_CORTO_BUENO, dropoffRealCompleto);

  resultados["3) Pickup REAL corto (solo calle) + dropoff REAL estructurado (calle+ciudad+estado+cp)"] =
    await intentar("3) Pickup REAL corto + dropoff REAL estructurado", pickupRealCorto, dropoffRealEstructurado);

  resultados["4) Pickup REAL completo + dropoff REAL completo (EXACTO como en produccion)"] =
    await intentar("4) Pickup REAL completo + dropoff REAL completo (produccion)", pickupRealCompleto, dropoffRealCompleto);

  resultados["5) Pickup REAL corto + dropoff REAL corto (solo calle, sin ciudad/estado/cp en ninguno)"] =
    await intentar("5) Pickup REAL corto + dropoff REAL corto", pickupRealCorto, { calle: extraerCalle(DIRECCION_CLIENTE_FALLIDA.direccion), lat: DIRECCION_CLIENTE_FALLIDA.lat, lng: DIRECCION_CLIENTE_FALLIDA.lng });

  // NUEVA HIPOTESIS: el telefono real de la sucursal Hahha Azul (config/restaurante.js)
  // trae DOS numeros en un solo campo, separados por "/" -- eso nunca se probo
  // arriba porque todos los tests usaron un telefono limpio de prueba.
  resultados["6) TODO real (direcciones Y telefono real de la sucursal, con el '/')"] =
    await intentar("6) Todo real incluyendo telefono con '/'", { ...pickupRealCompleto, telefono: "55 5393 0232 / 55 5572 3088" }, { ...dropoffRealCompleto, telefono: "+5215513162462" });

  // Verificacion del fix: mismo telefono real, pero formateado con la misma
  // logica que se va a aplicar en webhook_netpay.js (formatearTelefonoUber).
  function formatearTelefonoUber(telefono) {
    if (!telefono) return "";
    const primerNumero = telefono.split("/")[0].trim();
    const soloDigitos = primerNumero.replace(/\D/g, "");
    if (!soloDigitos) return "";
    const conCodigoPais = soloDigitos.length === 10 ? `52${soloDigitos}` : soloDigitos;
    return `+${conCodigoPais}`;
  }
  const telefonoFormateado = formatearTelefonoUber("55 5393 0232 / 55 5572 3088");
  console.log(`\nTelefono formateado: "55 5393 0232 / 55 5572 3088" -> "${telefonoFormateado}"`);
  resultados["7) TODO real, con el telefono YA CORREGIDO (verificacion del fix)"] =
    await intentar("7) Todo real con telefono corregido", { ...pickupRealCompleto, telefono: telefonoFormateado }, { ...dropoffRealCompleto, telefono: "+5215513162462" });

  console.log("\n\n========= RESUMEN =========");
  for (const [nombre, ok] of Object.entries(resultados)) {
    console.log(`${ok ? "OK   " : "FALLA"} -- ${nombre}`);
  }
})().catch((e) => {
  console.error("Error inesperado:", e.message);
  process.exit(1);
});
