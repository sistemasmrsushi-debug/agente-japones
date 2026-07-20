// src/utils/geocoding.js
// Valida y normaliza direcciones usando Google Maps Geocoding API

const logger = require("./logger");

async function validarDireccion(direccionTexto) {
  try {
    const apiKey = process.env.GOOGLE_MAPS_KEY;
    if (!apiKey) return { valida: true, direccion: direccionTexto, coords: null };

    const query = encodeURIComponent(direccionTexto + ", Mexico");
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${apiKey}&language=es&region=MX`;

    const https = require("https");
    const data = await new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let body = "";
        res.on("data", chunk => body += chunk);
        res.on("end", () => {
          try { resolve(JSON.parse(body)); }
          catch(e) { reject(e); }
        });
      }).on("error", reject);
    });

    if (data.status !== "OK" || !data.results?.length) {
      logger.warn(`Direccion no encontrada: "${direccionTexto}" -> ${data.status}`);
      return { valida: false, direccion: direccionTexto, coords: null, error: "no_encontrada" };
    }

    const resultado = data.results[0];

    // Google marca "partial_match: true" en casos muy distintos: a veces la calle
    // es completamente otra (peligroso, ej. "Faisan Local 72" en vez de "Lomas
    // Verdes 22"), y a veces es la MISMA calle y numero pero con la colonia
    // nombrada un poco distinto o el CP con 1 digito diferente (inofensivo, ej.
    // "la altena" vs "Lomas Verdes Altena III"). Rechazar todo por igual bloqueaba
    // direcciones correctas. Ahora solo se rechaza si el numero de calle que
    // escribio el cliente NO aparece en la respuesta de Google -- esa es la señal
    // confiable de que sí cambio la calle real, no solo el nombre de la colonia.
    if (resultado.partial_match) {
      const numeroCliente = direccionTexto.match(/\d+/)?.[0];
      const calleCoincide = numeroCliente && resultado.formatted_address.includes(numeroCliente);
      if (!calleCoincide) {
        logger.warn(`Coincidencia parcial (poco confiable): "${direccionTexto}" -> "${resultado.formatted_address}"`);
        return { valida: false, direccion: direccionTexto, coords: null, error: "coincidencia_parcial" };
      }
      logger.info(`Coincidencia parcial aceptada (mismo numero de calle): "${direccionTexto}" -> "${resultado.formatted_address}"`);
    }

    const coords = resultado.geometry.location;
    const direccionNormalizada = resultado.formatted_address
      .replace(", Mexico", "")
      .replace(", México", "")
      .trim();

    // Extraer colonia y municipio
    const componentes = resultado.address_components;
    const colonia = componentes.find(c => c.types.includes("sublocality_level_1"))?.long_name || null;
    const municipio = componentes.find(c => c.types.includes("locality"))?.long_name || null;
    const estado = componentes.find(c => c.types.includes("administrative_area_level_1"))?.long_name || null;

    logger.info(`Direccion validada: "${direccionTexto}" -> "${direccionNormalizada}" (${coords.lat}, ${coords.lng})`);

    return {
      valida: true,
      direccion: direccionNormalizada,
      direccion_original: direccionTexto,
      colonia,
      municipio,
      estado,
      coords: { lat: coords.lat, lng: coords.lng },
      maps_url: `https://maps.google.com/?q=${coords.lat},${coords.lng}`,
    };

  } catch (error) {
    logger.error("Error geocoding: " + error.message);
    // Si falla Google, aceptar la direccion como viene
    return { valida: true, direccion: direccionTexto, coords: null };
  }
}

// Distancia en linea recta (km) entre dos coordenadas, usando la formula de
// Haversine. Es una aproximacion (no la distancia real por calle), suficiente
// para decidir si una direccion cae razonablemente cerca de una sucursal.
function calcularDistanciaKm(lat1, lng1, lat2, lng2) {
  const R = 6371; // radio de la Tierra en km
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

module.exports = { validarDireccion, calcularDistanciaKm };
