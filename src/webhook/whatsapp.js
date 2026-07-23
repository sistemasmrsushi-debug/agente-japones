// src/webhook/whatsapp.js
const express = require("express");
const router = express.Router();
const twilioLib = require("twilio");
const { procesarMensaje, detectarSucursalPorZona, buscarPlatillo } = require("../agent/agente");
const logger = require("../utils/logger");
const db = require("../db/database");
const { validarDireccion, calcularDistanciaKm } = require("../utils/geocoding");
const { generarLinkPago } = require("../utils/netpay");

function getTwilioClient() {
  return require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

// ── VALIDACION DE FIRMA TWILIO ────────────────────────────────────────────────
// Verifica que la peticion realmente viene de Twilio y no es falsificada
function validarFirmaTwilio(req, res, next) {
  // En desarrollo local sin HTTPS publico, permitir saltar validacion
  if (process.env.SKIP_TWILIO_VALIDATION === "true") {
    return next();
  }

  const firmaTwilio = req.headers["x-twilio-signature"];
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const url = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}${req.originalUrl}`;

  if (!firmaTwilio) {
    logger.warn(`Webhook sin firma Twilio - posible peticion falsa. IP: ${req.ip}`);
    return res.status(403).send("Forbidden");
  }

  const esValida = twilioLib.validateRequest(authToken, firmaTwilio, url, req.body);

  if (!esValida) {
    logger.warn(`Firma Twilio invalida - peticion rechazada. IP: ${req.ip}`);
    return res.status(403).send("Forbidden");
  }

  next();
}

// ── Detecta confirmacion simple ───────────────────────────────────────────────
function esConfirmacion(texto) {
  const t = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  // Negaciones — NO es confirmacion
  if (/\b(no quiero|prefiero otra|cambia|ninguna|otra sucursal)\b/.test(t)) return false;
  // Palabras que parecen confirmacion pero NO lo son
  if (/^(gracias|adios|bye|hasta luego|de nada|con gusto|perfecto gracias|ok gracias|listo gracias|muchas gracias|thank)/.test(t)) return false;
  // Confirmacion explicita — incluye typos comunes
  if (/\b(si|sí|ok|dale|va|claro|adelante|andale|orale|correcto|sale|ahi|esa|de ahi|desde ahi)\b/.test(t) && t.length <= 40) return true;
  // "si, esa sucursa esta bien" — patron: empieza con si/ok + menciona sucursal
  if (/^(si|ok|dale|claro|va)/.test(t) && t.length <= 50) return true;
  return false;
}

// ── Detecta si el cliente quiere reintentar un pago rechazado ─────────────────
// Tolerante a errores de tecleo comunes (ej. "reitentar" en vez de "reintentar")
// -- en vez de exigir la frase exacta, busca "pago" combinado con alguna palabra
// relacionada a intentar de nuevo.
function esReintentarPago(texto) {
  const t = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (/\b(otra tarjeta|nuevo link|reenviar link|manda(me)? el link|mandar link|nueva tarjeta)\b/.test(t)) return true;
  const mencionaPago = /\bpago\b|\bpagar\b/.test(t);
  const mencionaReintento = t.includes("tent") /* intentar, reintentar, reitentar, etc. */ || /\bde nuevo\b|\botra vez\b/.test(t);
  return mencionaPago && mencionaReintento;
}

// ── Detecta si el mensaje pide domicilio ──────────────────────────────────────
function pideDomicilio(texto) {
  const t = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /\b(domicilio|a mi casa|a casa|delivery|me lo llevan|me traen|enviar|envio a)\b/.test(t);
}

// ── Detecta si el mensaje tiene una direccion ─────────────────────────────────
function tieneDireccion(texto) {
  if (/\b(calle|avenida|av[. ]|col[. ]|colonia|blvd|calzada|privada|cerrada|circuito|fracc|\d{5})\b/i.test(texto)) {
    return true;
  }
  // Respaldo: direcciones reales a veces no usan ninguna de esas palabras
  // (ej. "20 de tenayuca 134, arbolillo, Gustavo a Madero"). Un numero + coma
  // es tipico del patron "calle numero, colonia, municipio".
  return /\d/.test(texto) && texto.includes(",");
}

const RADIO_ENTREGA_KM = 5;

// Decide la sucursal final que atendera un domicilio, respetando un radio maximo
// de entrega. Mantiene el sistema de palabras clave (zonaSugerida) como primer
// intento -- solo busca alternativas si esa sucursal queda demasiado lejos.
async function resolverSucursalPorDistancia(zonaSugerida, coordsCliente) {
  // Sin coordenadas del cliente no hay forma de medir distancia -- se deja
  // pasar tal cual (mismo comportamiento que antes de este cambio).
  if (!coordsCliente) {
    return { sucursal: zonaSugerida, dentroDeRadio: true, cambio: false };
  }

  const sucursales = await db.obtenerSucursales();
  const conCoords = sucursales.filter(s => s.lat && s.lng);

  // Si todavia no se ha corrido el script de geocodificacion de sucursales,
  // no hay con que comparar -- no bloquear pedidos por esto.
  if (conCoords.length === 0) {
    return { sucursal: zonaSugerida, dentroDeRadio: true, cambio: false };
  }

  const distanciaA = (s) => calcularDistanciaKm(coordsCliente.lat, coordsCliente.lng, Number(s.lat), Number(s.lng));

  if (zonaSugerida) {
    const sucursalAsignada = conCoords.find(s => s.nombre === zonaSugerida);
    if (sucursalAsignada) {
      const dist = distanciaA(sucursalAsignada);
      if (dist <= RADIO_ENTREGA_KM) {
        return { sucursal: zonaSugerida, dentroDeRadio: true, cambio: false };
      }
      logger.info(`${zonaSugerida} queda a ${dist.toFixed(1)} km del cliente (fuera del radio de ${RADIO_ENTREGA_KM} km). Buscando otra sucursal...`);
    }
  }

  // La sugerida por zona no existe o quedo fuera de rango -- buscar la mas
  // cercana entre TODAS las sucursales geocodificadas.
  let mejor = null, mejorDist = Infinity;
  for (const s of conCoords) {
    const d = distanciaA(s);
    if (d < mejorDist) { mejorDist = d; mejor = s; }
  }

  if (mejor && mejorDist <= RADIO_ENTREGA_KM) {
    return { sucursal: mejor.nombre, dentroDeRadio: true, cambio: mejor.nombre !== zonaSugerida };
  }

  return { sucursal: null, dentroDeRadio: false, cambio: false };
}

// ── Extrae items del historial con precios REALES del menu ────────────────────
function extraerItemsConPreciosReales(historial) {
  const items = [];
  for (let i = historial.length - 1; i >= 0; i--) {
    if (historial[i].role === "assistant") {
      const texto = historial[i].content;
      // Buscar nombres de platillos mencionados y verificar en el menu
      const matches = [...texto.matchAll(/([A-Za-záéíóúÁÉÍÓÚñÑ\s\.]+?)\s*\$\s*(\d+)/g)];
      for (const m of matches) {
        const nombre = m[1].trim();
        if (nombre.length > 3) {
          const platillo = buscarPlatillo(nombre);
          if (platillo && !items.find(x => x.nombre === platillo.nombre)) {
            items.push({ nombre: platillo.nombre, precio: platillo.precio, cantidad: 1 });
          }
        }
      }
      if (items.length > 0) break;
    }
  }
  return items;
}

router.post("/webhook", validarFirmaTwilio, async (req, res) => {
  res.set("Content-Type", "text/xml").send("<Response></Response>");
  try {
    const telefono = req.body.From;
    if (!telefono) return;

    // ── Ignorar mensajes que no son de WhatsApp (ej: SMS de verificacion de Meta) ──
    // El mismo webhook recibe tanto WhatsApp como SMS del numero nuevo. Sin este
    // filtro, un SMS (From sin prefijo "whatsapp:") se procesaba como si fuera un
    // cliente, y al intentar responder por WhatsApp fallaba con error 21910
    // (mezcla de canales: SMS entrante / WhatsApp saliente).
    if (!telefono.startsWith("whatsapp:")) {
      logger.info(`Mensaje ignorado (no es WhatsApp, probablemente SMS): ${telefono}`);
      return;
    }

    // ── GPS ───────────────────────────────────────────────────────────────
    if (req.body.Latitude && req.body.Longitude) {
      const { Latitude: lat, Longitude: lng } = req.body;
      await db.actualizarGPSPedido(telefono, {
        latitude: lat, longitude: lng,
        maps_url: `https://maps.google.com/?q=${lat},${lng}`
      });
      await enviarMensaje(telefono, "Ubicacion recibida! Ya la guardamos para la entrega.");
      return;
    }

    const mensaje = req.body.Body;
    if (!mensaje || mensaje.trim().length === 0) return;
    // Ignorar mensajes que son solo puntuacion o simbolos sin contenido real
    if (/^[?!.,;:\-_*#@$%^&()]+$/.test(mensaje.trim())) {
      logger.info(`Mensaje ignorado (solo simbolos): "${mensaje}"`);
      return;
    }
    logger.info(`Msg de ${telefono}: ${mensaje.substring(0, 80)}`);

    // ── CASO 0: Cliente quiere reintentar un pago rechazado ────────────────
    if (esReintentarPago(mensaje)) {
      const pedidoPendiente = await db.obtenerPedidoPendientePagoPorTelefono(telefono);

      if (!pedidoPendiente) {
        await enviarMensaje(telefono,
          `No encontramos ningun pedido tuyo esperando pago en este momento. Si quieres hacer un pedido nuevo, dime que te gustaria pedir.`
        );
        return;
      }

      const resultadoPago = await generarLinkPago({
        items: pedidoPendiente.items,
        referencia: pedidoPendiente.id,
        telefono: telefono,
        nombreCliente: pedidoPendiente.nombre_cliente,
        direccion: pedidoPendiente.direccion,
        colonia: pedidoPendiente.colonia,
        municipio: pedidoPendiente.municipio,
        estadoDireccion: pedidoPendiente.estado_direccion,
        codigoPostal: pedidoPendiente.codigo_postal,
      });

      if (resultadoPago.exito) {
        // No se reinicia el temporizador de cancelacion automatica (sigue
        // corriendo desde la creacion original del pedido) -- el cliente
        // conserva el mismo limite total de 15 minutos que ya se le informo.
        await enviarMensaje(telefono,
          `Aqui tienes un nuevo link de pago para tu pedido ${pedidoPendiente.id}:\n${resultadoPago.linkPago}`
        );
        logger.info(`Nuevo link de pago generado (reintento) para ${pedidoPendiente.id}`);
      } else {
        await enviarMensaje(telefono,
          `Tuvimos un problema generando tu nuevo link de pago. Te contactaremos en breve para ayudarte a completar el pago.`
        );
        logger.error(`Fallo generacion de link de pago (reintento) para ${pedidoPendiente.id}: ${resultadoPago.error}`);
      }
      return;
    }

    // ── CASO 1: Cliente confirma sucursal sugerida ────────────────────────
    let estado = await db.obtenerEstadoPedido(telefono);

    // Si el estado quedo abandonado (el cliente nunca respondio, o se fue a otra
    // cosa y regreso horas despues), ignorarlo -- si no, un saludo nuevo como
    // "hola quiero hacer un pedido" se intentaria validar como si fuera una
    // direccion, porque el sistema seguiria pensando que la esta esperando.
    const ESTADO_EXPIRA_MS = 30 * 60 * 1000; // 30 minutos
    if (estado?._ts && (Date.now() - estado._ts > ESTADO_EXPIRA_MS)) {
      logger.info(`Estado abandonado (fase=${estado.fase}) ignorado por antiguedad para ${telefono}`);
      await db.eliminarEstadoPedido(telefono);
      estado = null;
    }

    // Si el cliente claramente quiere empezar de nuevo, no tratar su mensaje
    // como si fuera la direccion/confirmacion que se estaba esperando.
    const quiereReiniciar = /\b(hola|buenas|buenos dias|buenas tardes|buenas noches|otro pedido|nuevo pedido|cancelar)\b/i.test(mensaje.trim());
    if (estado && quiereReiniciar && mensaje.trim().split(/\s+/).length <= 8) {
      logger.info(`Cliente reinicio conversacion (estaba en fase=${estado.fase}) para ${telefono}`);
      await db.eliminarEstadoPedido(telefono);
      estado = null;
    }

    if (estado?.fase === "esperando_confirmacion_sucursal" && esConfirmacion(mensaje)) {
      // Verificar si el cliente eligio una sucursal diferente
      const restaurante = require("../../config/restaurante");
      const sucursalElegida = restaurante.sucursales.find(s =>
        mensaje.toLowerCase().includes(s.nombre.toLowerCase())
      );
      if (sucursalElegida) {
        estado.sucursal_sugerida = sucursalElegida.nombre;
        logger.info(`Cliente eligio sucursal diferente: ${sucursalElegida.nombre}`);
      }
      logger.info(`Confirmacion: ${telefono} -> ${estado.sucursal_sugerida}`);

      // Obtener items con precios reales
      let items = estado.items || [];
      if (items.length === 0) {
        const historial = await db.obtenerHistorial(telefono);
        items = extraerItemsConPreciosReales(historial);
      }
      // Verificar precios reales en todos los items
      items = items.map(item => {
        const real = buscarPlatillo(item.nombre);
        return real ? { nombre: real.nombre, precio: real.precio, cantidad: item.cantidad || 1 } : item;
      });

      const pedido = {
        id: `PED-${Date.now()}`,
        fecha: new Date().toISOString(),
        estado: "pendiente_pago",
        telefono_cliente: telefono,
        nombre_cliente: estado.nombre_cliente || null,
        sucursal: estado.sucursal_sugerida,
        items,
        tipo: "domicilio",
        direccion: estado.direccion || null,
        colonia: estado.colonia || null,
        municipio: estado.municipio || null,
        estado_direccion: estado.estado_direccion || null,
        codigo_postal: estado.codigo_postal || null,
        referencias: estado.referencias || null,
        ubicacion_gps: estado.coords ? {
          latitude: estado.coords.lat,
          longitude: estado.coords.lng,
          maps_url: estado.maps_url || `https://maps.google.com/?q=${estado.coords.lat},${estado.coords.lng}`
        } : null,
      };
      await db.guardarPedido(pedido);
      await db.eliminarEstadoPedido(telefono);
      await db.guardarHistorial(telefono, []);
      logger.info(`Pedido pre-registrado (pendiente de pago): ${pedido.id} -> ${pedido.sucursal}`);

      const total = items.reduce((s, i) => s + (i.precio * (i.cantidad || 1)), 0);
      const itemsTexto = items.map(i => `${i.cantidad || 1}x ${i.nombre} ($${i.precio})`).join("\n");

      // Generar link de pago con Netpay
      const resultadoPago = await generarLinkPago({
        items,
        referencia: pedido.id,
        telefono: telefono,
        nombreCliente: pedido.nombre_cliente,
        direccion: pedido.direccion,
        colonia: pedido.colonia,
        municipio: pedido.municipio,
        estadoDireccion: pedido.estado_direccion,
        codigoPostal: pedido.codigo_postal,
      });

      if (resultadoPago.exito) {
        await enviarMensaje(telefono,
          `Tu pedido esta listo para confirmar!\n\nID: ${pedido.id}\n\n${itemsTexto}\n\nTotal: $${total}\nSucursal: ${estado.sucursal_sugerida}\nDireccion: ${estado.direccion}\n\nPara confirmar tu pedido realiza tu pago aqui:\n${resultadoPago.linkPago}\n\nTienes 15 minutos para completar el pago.`
        );
        // Recordatorio a los 10 minutos si sigue sin pagar
        setTimeout(async () => {
          const pedidoActual = (await db.obtenerPedidos(null, "gerente")).find(p => p.id === pedido.id);
          if (pedidoActual && pedidoActual.estado === "pendiente_pago") {
            await enviarMensaje(telefono,
              `Recordatorio: tu pedido ${pedido.id} sigue esperando confirmacion de pago. Tienes 5 minutos mas antes de que se cancele.\n\n${resultadoPago.linkPago}`
            );
          }
        }, 10 * 60 * 1000);
        // Cancelar automaticamente a los 15 minutos si no ha pagado
        setTimeout(async () => {
          const pedidoActual = (await db.obtenerPedidos(null, "gerente")).find(p => p.id === pedido.id);
          if (pedidoActual && pedidoActual.estado === "pendiente_pago") {
            await db.actualizarEstadoPedido(pedido.id, "cancelado");
            await enviarMensaje(telefono,
              `Tu pedido ${pedido.id} fue cancelado por falta de pago. Si quieres intentar de nuevo, escribenos!`
            );
            logger.info(`Pedido ${pedido.id} cancelado automaticamente por falta de pago`);
          }
        }, 15 * 60 * 1000);
      } else {
        // Si falla la generacion del link, avisar y dejar pedido pendiente para revision manual
        await enviarMensaje(telefono,
          `Tu pedido fue registrado (ID: ${pedido.id}) pero tuvimos un problema generando el link de pago. Te contactaremos en breve para confirmar el pago.`
        );
        logger.error(`Fallo generacion de link de pago para ${pedido.id}: ${resultadoPago.error}`);
      }
      return;
    }

    // ── CASO 2: Cliente da su direccion (viene del flujo normal) ──────────
    // NOTA: ya no exige tieneDireccion(mensaje) aqui. Si el bot ya pidio la direccion
    // en el turno anterior (fase=esperando_direccion), CUALQUIER respuesta del cliente
    // es su intento de direccion -- depender de palabras clave (calle/avenida/CP, etc.)
    // causaba que reintentos sin esas palabras (ej. sin repetir el CP) se perdieran
    // en silencio, sin validar ni responder nada mas.
    if (estado?.fase === "esperando_direccion") {
      logger.info(`Direccion recibida, validando con Google Maps...`);

      // Validar direccion con Google Maps
      const geoResult = await validarDireccion(mensaje);

      if (!geoResult.valida) {
        await enviarMensaje(telefono,
          `No encontramos esa direccion. Por favor verifica e intenta de nuevo con calle, numero, colonia y municipio.`
        );
        return;
      }

      // Usar direccion normalizada por Google
      const dirFinal = geoResult.direccion;
      const zona = detectarSucursalPorZona(dirFinal) || detectarSucursalPorZona(mensaje);

      // Filtro de radio de entrega: confirma que la sucursal (por zona) quede
      // razonablemente cerca del cliente; si no, busca la sucursal real mas
      // cercana; si ninguna cae dentro del radio, se ofrece recoger en sucursal
      // en vez de domicilio.
      const resolucion = await resolverSucursalPorDistancia(zona, geoResult.coords);

      if (!resolucion.dentroDeRadio) {
        await db.eliminarEstadoPedido(telefono); // limpiar estado para que el siguiente mensaje fluya normal con la IA
        await enviarMensaje(telefono,
          `Tu direccion (${dirFinal}) queda fuera de nuestra zona de entrega a domicilio (radio de ${RADIO_ENTREGA_KM} km de cualquiera de nuestras sucursales). ¿Prefieres recoger tu pedido en alguna sucursal? Tenemos: ${require("../../config/restaurante").sucursales.map(s=>s.nombre).join(", ")}`
        );
        return;
      }

      const sucursalSugerida = resolucion.sucursal || "Por confirmar";
      logger.info(`Direccion validada: "${dirFinal}" -> Zona: ${sucursalSugerida}`);

      await db.guardarEstadoPedido(telefono, {
        ...estado,
        fase: "esperando_confirmacion_sucursal",
        sucursal_sugerida: sucursalSugerida,
        direccion: dirFinal,
        colonia: geoResult.colonia || null,
        municipio: geoResult.municipio || null,
        estado_direccion: geoResult.estado || null,
        codigo_postal: geoResult.codigoPostal || null,
        coords: geoResult.coords || null,
        maps_url: geoResult.maps_url || null,
      });

      if (resolucion.cambio) {
        // La sucursal por zona quedaba fuera de rango; se ofrece la real mas cercana.
        await enviarMensaje(telefono,
          `Direccion confirmada: ${dirFinal}\n\n${zona ? `La sucursal de tu zona (${zona}) queda un poco lejos, pero ` : ""}*${sucursalSugerida}* si te puede atender dentro de nuestro rango de entrega. Te enviamos desde ahi o prefieres otra?`
        );
      } else if (resolucion.sucursal) {
        await enviarMensaje(telefono,
          `Direccion confirmada: ${dirFinal}\n\nLa sucursal mas cercana a tu zona es *${sucursalSugerida}*. Te enviamos desde ahi o prefieres otra?`
        );
      } else {
        await enviarMensaje(telefono,
          `Direccion confirmada: ${dirFinal}\n\nCual sucursal prefieres? Tenemos: ${require("../../config/restaurante").sucursales.map(s=>s.nombre).join(", ")}`
        );
      }
      return;
    }

    // ── CASO 3: Domicilio + direccion en mismo mensaje ────────────────────
    if (pideDomicilio(mensaje) && tieneDireccion(mensaje)) {
      const historial = await db.obtenerHistorial(telefono);
      const resultado = await procesarMensaje(historial, mensaje);
      await db.guardarHistorial(telefono, resultado.historialActualizado);

      // Validar direccion con Google Maps
      const geoResult = await validarDireccion(mensaje);

      if (!geoResult.valida) {
        await enviarMensaje(telefono,
          `No pudimos confirmar esa direccion. Por favor verifica e intenta de nuevo con calle, numero, colonia y municipio.`
        );
        return;
      }

      const dirFinal = geoResult.direccion;
      const zona = detectarSucursalPorZona(dirFinal) || detectarSucursalPorZona(mensaje);

      if (zona) {
        const items = resultado.datos?.pedido?.items
          ? resultado.datos.pedido.items.map(i => {
              const real = buscarPlatillo(i.nombre);
              return real ? { nombre: real.nombre, precio: real.precio, cantidad: i.cantidad || 1 } : i;
            })
          : extraerItemsConPreciosReales(resultado.historialActualizado);

        // Filtro de radio de entrega, igual que en el CASO 2.
        const resolucion = await resolverSucursalPorDistancia(zona, geoResult.coords);

        if (!resolucion.dentroDeRadio) {
          await db.eliminarEstadoPedido(telefono);
          await enviarMensaje(telefono,
            `Tu direccion (${dirFinal}) queda fuera de nuestra zona de entrega a domicilio (radio de ${RADIO_ENTREGA_KM} km de cualquiera de nuestras sucursales). ¿Prefieres recoger tu pedido en alguna sucursal? Tenemos: ${require("../../config/restaurante").sucursales.map(s=>s.nombre).join(", ")}`
          );
          return;
        }

        const sucursalFinal = resolucion.sucursal;

        await db.guardarEstadoPedido(telefono, {
          fase: "esperando_confirmacion_sucursal",
          sucursal_sugerida: sucursalFinal,
          items,
          direccion: dirFinal,
          colonia: geoResult.colonia || null,
          municipio: geoResult.municipio || null,
          estado_direccion: geoResult.estado || null,
          codigo_postal: geoResult.codigoPostal || null,
          coords: geoResult.coords || null,
          maps_url: geoResult.maps_url || null,
        });
        logger.info(`Estado guardado (caso3): ${sucursalFinal}, items: ${items.length}`);

        if (resolucion.cambio) {
          await enviarMensaje(telefono,
            `Direccion confirmada: ${dirFinal}\n\nLa sucursal de tu zona (${zona}) queda un poco lejos, pero *${sucursalFinal}* si te puede atender dentro de nuestro rango de entrega. Te enviamos desde ahi o prefieres otra?`
          );
        } else {
          await enviarMensaje(telefono,
            `Direccion confirmada: ${dirFinal}\n\nLa sucursal mas cercana a tu zona es *${sucursalFinal}*. Te enviamos desde ahi o prefieres otra?`
          );
        }
        return;
      }
    }

    // ── CASO 4: Detectar si pide menu -> mandar PDF directo sin pasar por GPT ─
    const msgNorm = mensaje.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const pideMenu = /\b(menu|carta|platillos|que tienen|que ofrecen|ver menu|mostrar menu)\b/.test(msgNorm);
    if (pideMenu) {
      logger.info(`Cliente pidio menu -> enviando PDF directo`);
      await enviarMensaje(telefono, "Claro! Aqui tienes nuestro menu completo:");
      await enviarMenuPDF(telefono);
      return;
    }

    // ── CASO 5: Flujo normal con Groq ─────────────────────────────────────
    const historial = await db.obtenerHistorial(telefono);
    const resultado = await procesarMensaje(historial, mensaje);
    await db.guardarHistorial(telefono, resultado.historialActualizado);

    // Detectar si el agente esta pidiendo la direccion al cliente
    const textoBajo = resultado.texto.toLowerCase();
    const pidioDir = /direcci[oó]n|colonia|referencia/.test(textoBajo);
    const tieneProductos = resultado.datos?.pedido?.items?.length > 0 ||
      extraerItemsConPreciosReales(resultado.historialActualizado).length > 0;

    if (pidioDir && tieneProductos && !estado) {
      const items = resultado.datos?.pedido?.items ||
        extraerItemsConPreciosReales(resultado.historialActualizado);
      // Detectar si el agente ya menciono una sucursal en su respuesta
      const restauranteConfig = require("../../config/restaurante");
      const sucursalEnTexto = restauranteConfig.sucursales.find(s =>
        resultado.texto.toLowerCase().includes(s.nombre.toLowerCase())
      );
      await db.guardarEstadoPedido(telefono, {
        fase: sucursalEnTexto ? "esperando_confirmacion_sucursal" : "esperando_direccion",
        items: items.map(i => {
          const real = buscarPlatillo(i.nombre);
          return real ? { nombre: real.nombre, precio: real.precio, cantidad: i.cantidad || 1 } : i;
        }),
        sucursal_sugerida: sucursalEnTexto?.nombre || null,
        direccion: null,
      });
      logger.info(`Estado guardado: fase=${sucursalEnTexto ? "esperando_confirmacion_sucursal" : "esperando_direccion"}, sucursal=${sucursalEnTexto?.nombre || "null"}`);
    }

    // Si el agente registro pedido directamente
    if (resultado.accion === "REGISTRAR_PEDIDO") {
      await ejecutarAccion(resultado.accion, resultado.datos, telefono);
      await db.eliminarEstadoPedido(telefono);
    } else if (resultado.accion === "REGISTRAR_RESERVACION" || resultado.accion === "ESCALAR_HUMANO") {
      await ejecutarAccion(resultado.accion, resultado.datos, telefono);
    }

    await enviarMensaje(telefono, resultado.texto);

  } catch (error) {
    logger.error("Error webhook: " + error.message);
  }
});

router.get("/webhook", (req, res) => res.send("Webhook activo"));

async function ejecutarAccion(accion, datos, telefono) {
  try {
    if (accion === "REGISTRAR_PEDIDO") {
      const items = (datos.pedido?.items || []).map(i => {
        const real = buscarPlatillo(i.nombre);
        return real ? { nombre: real.nombre, precio: real.precio, cantidad: i.cantidad || 1 } : i;
      });
      const pedido = {
        id: `PED-${Date.now()}`,
        fecha: new Date().toISOString(),
        estado: "pendiente",
        telefono_cliente: telefono,
        nombre_cliente: datos.pedido?.nombre_cliente || null,
        sucursal: datos.pedido?.sucursal || "Por confirmar",
        items,
        tipo: datos.pedido?.tipo || "sucursal",
        direccion: datos.pedido?.direccion || null,
        colonia: datos.pedido?.colonia || null,
        referencias: datos.pedido?.referencias || null,
        ubicacion_gps: null,
      };
      await db.guardarPedido(pedido);
      logger.info(`Pedido en DB: ${pedido.id} -> ${pedido.sucursal}`);
      const total = items.reduce((s, i) => s + (i.precio * (i.cantidad || 1)), 0);
      const itemsTexto = items.map(i => `${i.cantidad || 1}x ${i.nombre} ($${i.precio})`).join("\n");
      await enviarMensaje(telefono,
        `Pedido registrado!\n\nID: ${pedido.id}\n\n${itemsTexto}\n\nTotal: $${total}\nSucursal: ${pedido.sucursal}\n\nTiempo: ~40 min.${pedido.tipo === "domicilio" ? " Envio GRATIS!" : ""}`
      );
      if (pedido.tipo === "domicilio") {
        setTimeout(async () => {
          await enviarMensaje(telefono, "Opcional: comparte tu ubicacion GPS para que lleguen exactamente a tu puerta. Clip -> Ubicacion -> Enviar mi ubicacion actual.");
        }, 3000);
      }
    } else if (accion === "REGISTRAR_RESERVACION") {
      const reservacion = {
        id: `RES-${Date.now()}`,
        fecha_registro: new Date().toISOString(),
        estado: "confirmada",
        telefono_cliente: telefono,
        ...datos.reservacion,
      };
      await db.guardarReservacion(reservacion);
      logger.info(`Reservacion en DB: ${reservacion.id}`);
    } else if (accion === "ESCALAR_HUMANO") {
      logger.warn(`ESCALACION para ${telefono}: ${datos.motivo}`);
    }
  } catch (error) {
    logger.error(`Error accion: ` + error.message);
  }
}

async function enviarMenuPDF(telefono) {
  try {
    const client = getTwilioClient();
    const menuUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/public/menu_mrsushi.pdf`;
    logger.info(`Enviando PDF a ${telefono}: ${menuUrl}`);
    await client.messages.create({
      from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
      to: telefono,
      body: "Aqui esta nuestro menu completo:",
      mediaUrl: [menuUrl],
    });
    logger.info(`Menu PDF enviado a ${telefono}`);
  } catch(error) {
    logger.error(`Error enviando PDF: ` + error.message);
    // Fallback: mandar link al sitio web
    await enviarMensaje(telefono, "Puedes ver nuestro menu completo con fotos en: https://www.mrsushi.mx/pedir");
  }
}

async function enviarMensaje(telefono, texto) {
  try {
    const client = getTwilioClient();
    const LIMITE = 1500;

    if (texto.length <= LIMITE) {
      await client.messages.create({
        from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
        to: telefono,
        body: texto,
      });
      logger.info(`Enviado a ${telefono}`);
      return;
    }

    // Dividir por saltos de linea respetando el limite
    const partes = [];
    const lineas = texto.split("\n");
    let parteActual = "";

    for (const linea of lineas) {
      if ((parteActual + "\n" + linea).length > LIMITE) {
        if (parteActual) partes.push(parteActual.trim());
        parteActual = linea;
      } else {
        parteActual = parteActual ? parteActual + "\n" + linea : linea;
      }
    }
    if (parteActual) partes.push(parteActual.trim());

    // Enviar cada parte con delay de 500ms
    for (let i = 0; i < partes.length; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 500));
      await client.messages.create({
        from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
        to: telefono,
        body: partes[i],
      });
      logger.info(`Enviado parte ${i+1}/${partes.length} a ${telefono}`);
    }
  } catch (error) {
    logger.error(`Error enviando: ` + error.message);
  }
}

module.exports = router;
