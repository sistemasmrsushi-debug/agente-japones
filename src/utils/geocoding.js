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

    // Google marca "partial_match: true" cuando NO encontro exactamente la direccion
    // pedida, pero regresa "lo mas parecido" (ej. la colonia correcta, pero una calle
    // distinta). Sin este chequeo, se aceptaban direcciones equivocadas como validas.
    if (resultado.partial_match) {
      logger.warn(`Coincidencia parcial (poco confiable): "${direccionTexto}" -> "${resultado.formatted_address}"`);
      return { valida: false, direccion: direccionTexto, coords: null, error: "coincidencia_parcial" };
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

module.exports = { validarDireccion };
