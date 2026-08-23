// src/utils/geocoding.js
// Valida y normaliza direcciones usando Google Maps Geocoding API

const logger = require("./logger");

// En muchos fraccionamientos mexicanos, un mismo nombre base se repite en
// varias "etapas" o "secciones" numeradas (ej. "Alteña I", "Alteña II",
// "Alteña III") que son desarrollos FISICAMENTE DISTINTOS, aunque compartan
// el mismo esquema de numeracion de calle. Si el cliente menciono un numero
// de etapa y Google devolvio uno diferente, es una señal fuerte de que
// cambio la ubicacion real, no solo el nombre -- aunque el numero de calle
// coincida.
function extraerNumeroEtapa(texto) {
  const romanosANumero = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };
  const coincidencias = texto.match(/\b(i{1,3}|iv|v)\b|\b\d\b/gi);
  if (!coincidencias || !coincidencias.length) return null;
  // Toma la ultima coincidencia (normalmente el numero de etapa va al final,
  // ej. "...Alteña II", "...Seccion 3")
  const ultima = coincidencias[coincidencias.length - 1].toLowerCase();
  if (romanosANumero[ultima]) return romanosANumero[ultima];
  if (/^\d$/.test(ultima)) return parseInt(ultima);
  return null;
}

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

      // Verificar tambien el numero de etapa/seccion (ver extraerNumeroEtapa).
      // Si ambos textos mencionan una etapa y NO coinciden, es una direccion
      // distinta aunque el numero de calle si coincida (ej. "Alteña II" vs
      // "Alteña III" comparten el "22" de la calle pero son fraccionamientos
      // distintos).
      const etapaCliente = extraerNumeroEtapa(direccionTexto);
      const etapaGoogle = extraerNumeroEtapa(resultado.formatted_address);
      const etapaConflictiva = etapaCliente && etapaGoogle && etapaCliente !== etapaGoogle;

      if (!calleCoincide || etapaConflictiva) {
        logger.warn(`Coincidencia parcial (poco confiable): "${direccionTexto}" -> "${resultado.formatted_address}"${etapaConflictiva ? ` (etapa ${etapaCliente} vs ${etapaGoogle})` : ""}`);
        return { valida: false, direccion: direccionTexto, coords: null, error: etapaConflictiva ? "etapa_no_coincide" : "coincidencia_parcial" };
      }
      logger.info(`Coincidencia parcial aceptada (mismo numero de calle): "${direccionTexto}" -> "${resultado.formatted_address}"`);
    }

    const coords = resultado.geometry.location;
    const direccionNormalizada = resultado.formatted_address
      .replace(", Mexico", "")
      .replace(", México", "")
      .trim();

    // Extraer colonia, municipio, estado y codigo postal (necesarios para
    // precargar los datos de facturacion en el checkout de Netpay).
    const componentes = resultado.address_components;
    const colonia = componentes.find(c => c.types.includes("sublocality_level_1"))?.long_name || null;
    const municipio = componentes.find(c => c.types.includes("locality"))?.long_name || null;
    const estado = componentes.find(c => c.types.includes("administrative_area_level_1"))?.long_name || null;
    const codigoPostal = componentes.find(c => c.types.includes("postal_code"))?.long_name || null;

    logger.info(`Direccion validada: "${direccionTexto}" -> "${direccionNormalizada}" (${coords.lat}, ${coords.lng})`);

    return {
      valida: true,
      direccion: direccionNormalizada,
      direccion_original: direccionTexto,
      colonia,
      municipio,
      estado,
      codigoPostal,
      coords: { lat: coords.lat, lng: coords.lng },
      maps_url: `https://maps.google.com/?q=${coords.lat},${coords.lng}`,
    };

  } catch (error) {
    logger.error("Error geocoding: " + error.message);
    // Si falla Google, aceptar la direccion como viene
    return { valida: true, direccion: direccionTexto, coords: null };
  }
}

// Geocodificacion INVERSA: dado un par de coordenadas (lat/lng, tal como las
// manda WhatsApp cuando el cliente comparte su ubicacion en tiempo real o un
// pin fijo), obtiene la direccion formateada + colonia/municipio/estado/CP,
// usando el mismo endpoint de Google (Geocoding API) con "latlng=" en vez de
// "address=". Se usa como fallback cuando el cliente escribio mal su
// direccion y Google no pudo encontrarla como texto.
async function geocodificarInverso(lat, lng) {
  const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;
  try {
    const apiKey = process.env.GOOGLE_MAPS_KEY;
    if (!apiKey) {
      // Sin API key no se puede obtener direccion/colonia/CP -- se acepta la
      // ubicacion tal cual, con las coordenadas como unico dato (igual que
      // validarDireccion cuando falla la llamada a Google).
      return { valida: true, direccion: `Ubicación compartida (${lat}, ${lng})`, coords: { lat, lng }, maps_url: mapsUrl };
    }

    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}&language=es&region=MX`;

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
      logger.warn(`Geocodificacion inversa sin resultados: (${lat}, ${lng}) -> ${data.status}`);
      return { valida: true, direccion: `Ubicación compartida (${lat}, ${lng})`, coords: { lat, lng }, maps_url: mapsUrl };
    }

    const resultado = data.results[0];
    const direccionNormalizada = resultado.formatted_address
      .replace(", Mexico", "")
      .replace(", México", "")
      .trim();

    const componentes = resultado.address_components;
    const colonia = componentes.find(c => c.types.includes("sublocality_level_1"))?.long_name || null;
    const municipio = componentes.find(c => c.types.includes("locality"))?.long_name || null;
    const estado = componentes.find(c => c.types.includes("administrative_area_level_1"))?.long_name || null;
    const codigoPostal = componentes.find(c => c.types.includes("postal_code"))?.long_name || null;

    logger.info(`Geocodificacion inversa: (${lat}, ${lng}) -> "${direccionNormalizada}"`);

    return {
      valida: true,
      direccion: direccionNormalizada,
      colonia,
      municipio,
      estado,
      codigoPostal,
      coords: { lat, lng },
      maps_url: mapsUrl,
    };

  } catch (error) {
    logger.error("Error geocodificacion inversa: " + error.message);
    return { valida: true, direccion: `Ubicación compartida (${lat}, ${lng})`, coords: { lat, lng }, maps_url: mapsUrl };
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

module.exports = { validarDireccion, calcularDistanciaKm, geocodificarInverso };
