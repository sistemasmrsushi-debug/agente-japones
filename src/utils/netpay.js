// src/utils/netpay.js
// Integracion con Netpay Payment Link + Webhook
// Basado en documentacion oficial entregada por Netpay Integraciones

const https = require("https");
const logger = require("./logger");

// Hostname correcto segun documentacion de Netpay (sandbox)
const HOSTNAME_SANDBOX = "gateway-154.netpaydev.com";
const HOSTNAME_PROD = "suite.netpay.com.mx";

function getHostname() {
  return process.env.NETPAY_ENV === "production" ? HOSTNAME_PROD : HOSTNAME_SANDBOX;
}

// NUEVO (06-oct-2026, pedido por Diego, root-cause real del incidente del
// 06-oct-2026 con el webhook de pago): RAILWAY_PUBLIC_DOMAIN NO es estable
// cuando el servicio tiene mas de un dominio conectado (ver Settings ->
// Networking -> Domains en Railway) -- confirmado en vivo: el mismo
// deploy registro el webhook con Netpay apuntando a un dominio DISTINTO
// (agentemrsushi-production.up.railway.app) del que se usa en todos lados
// (agente-japones-production.up.railway.app), sin que nadie cambiara nada a
// proposito. Eso hacia que el aviso de pago de Netpay se registrara contra
// un dominio que nadie prueba ni usa, y nunca llegara.
//
// APP_PUBLIC_DOMAIN es una variable de entorno nueva que Diego debe
// configurar UNA VEZ en Railway (Variables) con el valor fijo
// "agente-japones-production.up.railway.app" -- a diferencia de
// RAILWAY_PUBLIC_DOMAIN (que Railway asigna solo y puede cambiar), esta no
// la toca nadie mas que Diego, asi que no puede "voltearse" sola entre
// deploys. Mientras esa variable no exista, se sigue usando
// RAILWAY_PUBLIC_DOMAIN como respaldo para no romper nada de un dia para
// otro.
const DOMINIO_PUBLICO = process.env.APP_PUBLIC_DOMAIN || process.env.RAILWAY_PUBLIC_DOMAIN;

// Mapeo de estados de Mexico a su codigo ISO 3166-2:MX (subdivision, sin el
// prefijo "MX-"). Necesario porque Google Maps regresa el nombre largo del
// estado (ej. "Ciudad de Mexico", "Jalisco"), pero Netpay exige el estandar
// ISO para el objeto de facturacion (Matriz de certificacion Netpay, criterio
// "Estandarizacion de Ubicacion").
const ESTADOS_ISO_MX = {
  "aguascalientes": "AGU", "baja california": "BCN", "baja california sur": "BCS",
  "campeche": "CAM", "chiapas": "CHP", "chihuahua": "CHH",
  "ciudad de mexico": "CMX", "distrito federal": "CMX",
  "coahuila": "COA", "coahuila de zaragoza": "COA",
  "colima": "COL", "durango": "DUR",
  "estado de mexico": "MEX", "mexico": "MEX",
  "guanajuato": "GUA", "guerrero": "GRO", "hidalgo": "HID", "jalisco": "JAL",
  "michoacan": "MIC", "michoacan de ocampo": "MIC", "morelos": "MOR",
  "nayarit": "NAY", "nuevo leon": "NLE", "oaxaca": "OAX", "puebla": "PUE",
  "queretaro": "QUE", "quintana roo": "ROO", "san luis potosi": "SLP",
  "sinaloa": "SIN", "sonora": "SON", "tabasco": "TAB", "tamaulipas": "TAM",
  "tlaxcala": "TLA", "veracruz": "VER", "veracruz de ignacio de la llave": "VER",
  "yucatan": "YUC", "zacatecas": "ZAC",
};

function estadoAIso(nombreEstado) {
  if (!nombreEstado) return "";
  const limpio = nombreEstado.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  return ESTADOS_ISO_MX[limpio] || nombreEstado; // si no se reconoce, se manda tal cual -- mejor que vacio
}

// ── VALIDACIONES EXIGIDAS POR LA MATRIZ DE CERTIFICACION NETPAY ───────────────
// 1. Ningun monto en $0.
// 2. Ningun campo de billing vacio.
// 3. Ningun campo de billing con caracteres no permitidos. Se aceptan letras
//    (con acentos/enie), numeros, espacios, y puntuacion tipica de
//    direcciones mexicanas (# . , - /) -- una regla que solo permitiera
//    letras y numeros bloquearia direcciones reales como "Av. Reforma #123".
const CAMPO_VALIDO_REGEX = /^[a-zA-Z0-9À-ÿñÑ\s.,#\-\/]+$/;

// NOTA (21-sep-2026, cupones de descuento): antes esta funcion exigia que
// CADA renglon fuera > $0. Ahora que un cupon puede agregar un renglon de
// "Descuento" con monto negativo (ver generarLinkPago), la regla cambia a:
// ningun producto real puede ser <= $0, pero el renglon de descuento si
// puede ser negativo -- lo que nunca puede pasar es que el TOTAL final
// quede en $0 o menos (Netpay no permite cobrar $0; para un cupon de 100%
// el pedido se marca pagado directo sin pasar por aqui, ver whatsapp.js).
function validarLineItems(lineItems) {
  let total = 0;
  for (const item of lineItems) {
    if (item.amount === undefined || item.amount === null || Number(item.amount) === 0) {
      return `El producto "${item.name}" tiene un monto invalido ($${item.amount}).`;
    }
    if (Number(item.amount) < 0 && !item.name.startsWith("Descuento")) {
      return `El producto "${item.name}" tiene un monto negativo invalido ($${item.amount}).`;
    }
    total += Number(item.amount) * (item.quantity || 1);
  }
  if (total <= 0) {
    return `El total del pedido despues del descuento quedo en $${total.toFixed(2)}, invalido para Netpay (debe ser mayor a $0).`;
  }
  return null;
}

// NUEVO (23-sep-2026, reportado por Diego con captura real): un pedido a
// domicilio por ubicacion GPS (sin direccion de texto resuelta) generaba un
// campo de direccion con parentesis ("Ubicación compartida (lat, lng)"),
// que CAMPO_VALIDO_REGEX rechazaba -- el pedido quedaba registrado pero
// SIN link de pago, sin aviso claro al cliente de que hacer. Se corrigio el
// formato en geocoding.js, pero ademas se agrega esta limpieza aqui como
// segunda capa: en vez de rechazar TODO el pedido por un caracter suelto
// no permitido (un apostrofe en un nombre, algun simbolo raro), se quita
// ese caracter y se sigue -- mejor un texto levemente simplificado que un
// cliente sin poder pagar.
function sanitizarCampoFacturacion(valor) {
  return String(valor || "").replace(/[^a-zA-Z0-9À-ÿñÑ\s.,#\-\/]/g, "").trim();
}

function validarBilling(billing) {
  const campos = {
    "Nombre": billing.firstName,
    "Apellido": billing.lastName,
    "Telefono": billing.phone,
    "Direccion": billing.address.street1,
    "Ciudad": billing.address.city,
    "Estado": billing.address.state,
    "Codigo postal": billing.address.postalCode,
    "Pais": billing.address.country,
  };
  for (const [etiqueta, valor] of Object.entries(campos)) {
    if (!valor || !String(valor).trim()) {
      return `El campo de facturacion "${etiqueta}" no puede estar vacio.`;
    }
    if (!CAMPO_VALIDO_REGEX.test(valor)) {
      return `El campo de facturacion "${etiqueta}" contiene caracteres no permitidos: "${valor}"`;
    }
  }
  return null;
}

// ── GENERAR LINK DE PAGO ──────────────────────────────────────────────────────
async function generarLinkPago({ items, referencia, telefono, nombreCliente, direccion, colonia, municipio, estadoDireccion, codigoPostal, secretKey, emailFacturacionOverride, descuentoMonto, cuponCodigo }) {
  return new Promise((resolve, reject) => {
    const key = secretKey || process.env.NETPAY_SECRET_KEY;

    if (!key) {
      logger.error("NETPAY_SECRET_KEY no esta configurada");
      return resolve({ exito: false, error: "Falta configurar NETPAY_SECRET_KEY" });
    }

    // Netpay espera los productos como arreglo "lineItems" (name, amount, quantity, currency),
    // no como un monto plano. Sin esto, el checkout/session responde 404 "StoreUser not found"
    // en vez de un error de validacion claro (confirmado comparando contra una prueba en Postman
    // que si funciono, usando la misma llave, pero con lineItems en vez de "amount").
    const lineItems = (items || []).map(i => ({
      name: i.nombre,
      amount: i.precio,
      quantity: i.cantidad || 1,
      currency: "MXN",
    }));

    // Cupon de descuento (opcional): se manda a Netpay como un renglon mas,
    // con monto negativo, para que el total que se cobra en el checkout ya
    // venga descontado -- asi el cliente ve reflejado el descuento en el
    // propio resumen de pago de Netpay, no solo en el mensaje de WhatsApp.
    if (descuentoMonto && Number(descuentoMonto) > 0) {
      lineItems.push({
        name: `Descuento (${cuponCodigo || "cupón"})`,
        amount: -Math.abs(Number(descuentoMonto)),
        quantity: 1,
        currency: "MXN",
      });
    }

    // Telefono limpio, sin el prefijo "whatsapp:"
    const telefonoLimpio = (telefono || "").replace("whatsapp:", "").replace("+", "");

    // Nombre y apellido separados lo mejor posible a partir del nombre que dio
    // el cliente en la conversacion (ej. "Diego Gonzalez" -> "Diego" / "Gonzalez").
    const partesNombre = (nombreCliente || "Cliente Mr. Sushi").trim().split(/\s+/);
    const firstName = partesNombre[0] || "Cliente";
    const lastName = partesNombre.slice(1).join(" ") || "Mr. Sushi";

    // Precargar los datos de facturacion que ya tenemos de la conversacion, para
    // que el cliente no tenga que volver a escribir todo en el checkout de Netpay.
    //
    // IMPORTANTE sobre el email: en el ambiente de SANDBOX, Netpay usa el correo
    // (no la tarjeta) para decidir si la transaccion se acepta, se rechaza o pasa
    // por 3DS -- ver "Matriz de certificacion Netpay". Por eso aqui se usa
    // accept@netpay.com.mx mientras seguimos en sandbox, para poder probar pagos
    // aprobados de verdad. TODO antes de produccion: reemplazar esto por el email
    // real del cliente (todavia no lo capturamos en la conversacion de WhatsApp).
    const emailFacturacion = process.env.NETPAY_ENV === "production"
      ? "cliente@mrsushi.mx" // placeholder hasta que capturemos el email real del cliente
      : (emailFacturacionOverride || "accept@netpay.com.mx"); // sandbox: permite forzar reject@/review@ para certificacion; sin override, sigue igual que antes

    const billing = {
      firstName: sanitizarCampoFacturacion(firstName),
      lastName: sanitizarCampoFacturacion(lastName),
      email: emailFacturacion,
      phone: telefonoLimpio,
      address: {
        street1: sanitizarCampoFacturacion(direccion),
        street2: "",
        city: sanitizarCampoFacturacion(municipio),
        state: estadoAIso(estadoDireccion),
        postalCode: codigoPostal || "",
        country: "MX", // ISO 3166-1 Alfa-2 (antes decia "Mexico", el nombre completo)
      },
    };

    // Validaciones exigidas por la matriz de certificacion, antes de mandar
    // cualquier cosa a Netpay.
    const errorMonto = validarLineItems(lineItems);
    if (errorMonto) {
      logger.error(`Validacion de monto fallida: ${errorMonto}`);
      return resolve({ exito: false, error: errorMonto });
    }
    const errorBilling = validarBilling(billing);
    if (errorBilling) {
      logger.error(`Validacion de billing fallida: ${errorBilling}`);
      return resolve({ exito: false, error: errorBilling });
    }

    const body = JSON.stringify({
      successUrl: `https://${DOMINIO_PUBLICO}/pago/exitoso`,
      cancelUrl: `https://${DOMINIO_PUBLICO}/pago/cancelado`,
      customerEmail: billing.email,
      customerName: `${firstName} ${lastName}`,
      paymentMethodTypes: ["card"],
      merchantRefCode: referencia,
      lineItems,
      billing,
      linkType: "NETPAY_CHECKOUT",
    });

    logger.info(`Generando link de pago Netpay -> hostname: ${getHostname()}, referencia: ${referencia}, items: ${lineItems.length}`);

    const options = {
      hostname: getHostname(),
      path: "/gateway-ecommerce/v3.2/checkout/session/",
      method: "POST",
      timeout: 10000, // 10 segundos maximo
      headers: {
        "Content-Type": "application/json",
        "Authorization": key,
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        logger.info(`Respuesta Netpay checkout/session -> status: ${res.statusCode}, body: ${data.substring(0, 300)}`);
        try {
          const json = JSON.parse(data);
          // Netpay responde 201 (Created) cuando genera el link correctamente, no 200.
          // Y el link viene en "hostedCheckoutUrl", no en "shortUrl" (se dejaba shortUrl
          // como respaldo por si en otra version de la API si viene con ese nombre).
          const link = json.hostedCheckoutUrl || json.shortUrl;
          if ((res.statusCode === 200 || res.statusCode === 201) && link) {
            logger.info(`Link de pago generado para ${referencia}: ${link}`);
            resolve({
              exito: true,
              linkPago: link,
              sessionId: json.sessionId || json.id || null,
              // NUEVO (06-oct-2026): id numerico interno de Netpay para esta
              // sesion de pago, distinto del sessionId de texto -- ver el
              // comentario junto a consultarEstatusPorSesion mas abajo.
              checkoutId: json.id || null,
              raw: json,
            });
          } else {
            logger.error(`Netpay rechazo la solicitud de link: ${data}`);
            resolve({ exito: false, error: json.message || `Error ${res.statusCode}`, raw: json });
          }
        } catch(e) {
          logger.error("Error parseando respuesta Netpay: " + e.message + " | raw: " + data.substring(0, 300));
          resolve({ exito: false, error: "Respuesta invalida de Netpay" });
        }
      });
    });

    req.on("timeout", () => {
      logger.error("Timeout conectando con Netpay (10s)");
      req.destroy();
      resolve({ exito: false, error: "Timeout conectando con Netpay" });
    });

    req.on("error", (e) => {
      logger.error("Error conectando con Netpay: " + e.message);
      resolve({ exito: false, error: e.message });
    });

    req.write(body);
    req.end();
  });
}

// ── CONSULTAR ESTATUS DE TRANSACCION (respaldo si webhook falla) ──────────────
// Equivalente a la funcion consultaEstatus() del PHP de Netpay
async function consultarEstatusTransaccion(transactionId, secretKey) {
  return new Promise((resolve, reject) => {
    const key = secretKey || process.env.NETPAY_SECRET_KEY;

    const options = {
      hostname: "gateway-154.netpaydev.com",
      path: `/gateway-ecommerce/v3/transactions/${transactionId}`,
      method: "GET",
      headers: { "Content-Type": "application/json", "Authorization": key },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          logger.info(`Estatus consultado para transaccion ${transactionId}: ${json.status}`);
          resolve(json);
        } catch(e) {
          logger.error("Error consultando estatus: " + e.message);
          reject(e);
        }
      });
    });

    req.on("error", (e) => {
      logger.error("Error en consulta de estatus: " + e.message);
      reject(e);
    });

    req.end();
  });
}

// ── CONSULTAR ESTATUS POR SESSION ID (respaldo si el webhook nunca llega) ─────
// NUEVO (06-oct-2026, pedido por Diego, tras el incidente del certificado SSL
// de Netpay del 06-oct-2026 -- mismo problema que ya habia pasado en julio):
// cuando el webhook de pago no llega (por el problema del certificado fijado
// de Netpay, o cualquier otra razon), el pedido se queda "pendiente_pago"
// hasta que se cancela solo a los 15 min, aunque el cliente SI haya pagado.
//
// No hay un endpoint publico documentado para esto en docs.netpay.com.mx (el
// que da el estatus por transactionId -- consultarEstatusTransaccion arriba
// -- no sirve aqui porque el transactionId de Netpay solo se conoce cuando
// SU webhook nos lo manda, que es justo lo que no esta llegando). Esta
// funcion intenta el patron mas comun para este tipo de API (GET sobre el
// mismo recurso que se creo con POST /checkout/session/), usando el
// sessionId que SI tenemos desde que se genero el link de pago.
//
// Como no esta confirmado el formato exacto de la respuesta, esta funcion es
// deliberadamente conservadora: solo reporta "pagado" si encuentra una señal
// explicita e inequivoca en la respuesta. Cualquier otra cosa (error de red,
// formato de respuesta que no se reconoce, o pago que de verdad sigue
// pendiente) regresa pagado=false sin tronar -- es un respaldo adicional,
// nunca debe arriesgarse a marcar como pagado un pedido que no se pudo
// confirmar de verdad. Ver src/utils/pago_respaldo.js para como se usa esto.
//
// ACTUALIZADO (06-oct-2026, tras la primera prueba real en vivo): el primer
// intento (GET .../checkout/session/{sessionId de texto}) dio 404 -- Netpay
// no reconoce ese identificador en esa ruta. Como seguimos sin documentacion
// publica, en vez de apostarle a un solo patron se intentan varias rutas
// plausibles EN ORDEN (son todas lecturas GET, no modifican nada), y se usa
// la primera que responda 2xx con un cuerpo que se pueda interpretar. Si
// ninguna funciona, se sigue fallando de forma segura (pagado=false) igual
// que antes. Cuando se confirme cual es la correcta (por los logs de una
// prueba real, o si Netpay la documenta), se puede simplificar esto a una
// sola llamada.
function intentarGet(path, key) {
  return new Promise((resolve) => {
    const options = {
      hostname: getHostname(),
      path,
      method: "GET",
      timeout: 10000,
      headers: { "Content-Type": "application/json", "Authorization": key },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on("timeout", () => { req.destroy(); resolve({ statusCode: null, error: "timeout" }); });
    req.on("error", (e) => resolve({ statusCode: null, error: e.message }));
    req.end();
  });
}

async function consultarEstatusPorSesion(sessionId, checkoutId, merchantRefCode, secretKey) {
  const key = secretKey || process.env.NETPAY_SECRET_KEY;

  const candidatos = [];
  if (checkoutId) candidatos.push({ label: "id numerico", path: `/gateway-ecommerce/v3.2/checkout/session/${encodeURIComponent(checkoutId)}` });
  if (sessionId) candidatos.push({ label: "sessionId, ruta plural", path: `/gateway-ecommerce/v3.2/checkout/sessions/${encodeURIComponent(sessionId)}` });
  if (checkoutId) candidatos.push({ label: "id numerico, ruta plural", path: `/gateway-ecommerce/v3.2/checkout/sessions/${encodeURIComponent(checkoutId)}` });
  if (merchantRefCode) candidatos.push({ label: "busqueda por referencia", path: `/gateway-ecommerce/v3/transactions?merchantReferenceCode=${encodeURIComponent(merchantRefCode)}` });

  let ultimoIntento = null;

  for (const candidato of candidatos) {
    const resultado = await intentarGet(candidato.path, key);
    ultimoIntento = resultado;

    if (resultado.error) {
      logger.info(`Consulta de respaldo (${candidato.label}) -> error de red: ${resultado.error}`);
      continue;
    }

    logger.info(`Consulta de respaldo (${candidato.label}) -> status ${resultado.statusCode}, body: ${resultado.body.substring(0, 500)}`);

    if (resultado.statusCode < 200 || resultado.statusCode >= 300) continue;

    try {
      const json = JSON.parse(resultado.body);
      // Si la respuesta es una lista (ej. busqueda por referencia), toma el
      // primer elemento -- es lo mas comun en este tipo de endpoints.
      const registro = Array.isArray(json) ? json[0] : (Array.isArray(json.content) ? json.content[0] : (Array.isArray(json.data) ? json.data[0] : json));
      if (!registro) continue;

      // Variantes plausibles de como Netpay podria indicar "ya se pago" --
      // se aceptan varias porque no hay documentacion publica confirmada del
      // formato exacto de esta respuesta.
      const pagado = registro.paidOut === true
        || registro.status === "PAID"
        || registro.status === "paid"
        || registro.status === "COMPLETED"
        || registro.status === "APPROVED"
        || registro.transactionStatus === "PAID"
        || !!registro.transactionId;

      return {
        consultado: true,
        pagado,
        transactionId: registro.transactionId || null,
        lastFourDigits: registro.lastFourDigits || registro.cardLastFour || null,
        statusCode: resultado.statusCode,
        endpointUsado: candidato.label,
        raw: json,
      };
    } catch (e) {
      logger.info(`Consulta de respaldo (${candidato.label}) -> respuesta no es JSON valido: ${e.message}`);
      continue;
    }
  }

  // Ninguna ruta candidata funciono -- se falla de forma segura, igual que
  // si la consulta nunca se hubiera podido hacer.
  return {
    consultado: false,
    pagado: false,
    error: candidatos.length ? "Ninguna ruta candidata de Netpay respondio con datos reconocibles" : "No hay sessionId/checkoutId/referencia para consultar",
    statusCode: ultimoIntento ? ultimoIntento.statusCode : null,
  };
}

// ── REEMBOLSAR UNA TRANSACCION ────────────────────────────────────────────────
// NUEVO (09-oct-2026, pedido por Diego): antes no habia forma de reembolsar
// un pago desde el sistema -- Diego reporto que tampoco se puede hacer a
// mano desde el panel/manager de Netpay, asi que hacia falta este endpoint.
//
// Encontrado en la referencia oficial de Netpay (docs.netpay.com.mx/reference),
// dentro de "Netpay Checkout Hosted" (el mismo producto que ya usamos para
// generar el link de pago): esta documentado con el titulo "Cancelar
// Transaccion", pero la ruta termina en "/refund" y el parametro que pide es
// el "Id de transaccion PROCESADA" -- es decir, el transactionId que llega
// por el webhook de pago (sessionLink.paid), no el sessionId/checkoutId que
// se genera antes de pagar. Eso indica que es un reembolso real sobre una
// transaccion ya cobrada, no una cancelacion de un link sin pagar.
//
// OJO: la documentacion de Netpay NO muestra el formato del cuerpo de la
// peticion ni de la respuesta -- solo el metodo (POST), la ruta, y tres
// codigos de status (200, 404, 409), sin explicar que significa cada uno.
// Por eso esta funcion es conservadora: antes de usarse con dinero real hay
// que probarla en sandbox con una transaccion de prueba y confirmar que el
// 200 de verdad corresponde a un reembolso exitoso. Si en la practica Netpay
// regresa otro formato (como ya paso con el webhook de pago rechazado, que
// trae nombres de campo distintos segun el caso), raw queda disponible para
// depurar sin tener que adivinar a ciegas.
async function reembolsarTransaccion(transactionId, secretKey) {
  return new Promise((resolve) => {
    const key = secretKey || process.env.NETPAY_SECRET_KEY;

    if (!key) {
      logger.error("NETPAY_SECRET_KEY no esta configurada");
      return resolve({ exito: false, error: "Falta configurar NETPAY_SECRET_KEY" });
    }
    if (!transactionId) {
      return resolve({ exito: false, error: "Falta el transactionId de Netpay para poder reembolsar" });
    }

    const options = {
      hostname: getHostname(),
      path: `/gateway-ecommerce/v3/transactions/${encodeURIComponent(transactionId)}/refund`,
      method: "POST",
      timeout: 15000, // un reembolso puede tardar un poco mas que una simple consulta
      headers: {
        "Content-Type": "application/json",
        "Authorization": key,
        "Content-Length": 0,
      },
    };

    logger.info(`Solicitando reembolso a Netpay -> hostname: ${getHostname()}, transactionId: ${transactionId}`);

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        logger.info(`Respuesta Netpay refund -> status: ${res.statusCode}, body: ${data.substring(0, 300)}`);
        let json = null;
        try { json = data ? JSON.parse(data) : null; } catch (e) { /* algunas respuestas pueden venir vacias o no-JSON */ }

        if (res.statusCode === 200) {
          resolve({ exito: true, raw: json });
        } else if (res.statusCode === 404) {
          resolve({ exito: false, error: "Netpay no encontro esa transaccion (transactionId incorrecto o de otro ambiente, ej. sandbox vs produccion)", statusCode: 404, raw: json });
        } else if (res.statusCode === 409) {
          resolve({ exito: false, error: "Netpay rechazo el reembolso por conflicto -- probablemente ya fue reembolsada antes, o ya no se puede reembolsar (revisar directamente en el panel de Netpay)", statusCode: 409, raw: json });
        } else {
          resolve({ exito: false, error: (json && (json.message || json.error)) || `Netpay respondio ${res.statusCode}`, statusCode: res.statusCode, raw: json });
        }
      });
    });

    req.on("timeout", () => {
      logger.error("Timeout conectando con Netpay para reembolso (15s)");
      req.destroy();
      resolve({ exito: false, error: "Timeout conectando con Netpay" });
    });

    req.on("error", (e) => {
      logger.error("Error conectando con Netpay para reembolso: " + e.message);
      resolve({ exito: false, error: e.message });
    });

    req.end();
  });
}

// ── REGISTRAR URL DE WEBHOOK ──────────────────────────────────────────────────
// Se ejecuta UNA SOLA VEZ para dar de alta la URL donde Netpay mandara las notificaciones
async function registrarWebhook(secretKey) {
  return new Promise((resolve, reject) => {
    const key = secretKey || process.env.NETPAY_SECRET_KEY;
    const webhookUrl = `https://${DOMINIO_PUBLICO}/webhook/netpay`;

    const body = JSON.stringify({ webhook: webhookUrl });

    const options = {
      hostname: "gateway-154.netpaydev.com",
      path: "/gateway-ecommerce/v3/webhooks/",
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": key,
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        logger.info(`Webhook registrado en Netpay: ${webhookUrl} -> Status ${res.statusCode}`);
        resolve({ statusCode: res.statusCode, data });
      });
    });

    req.on("error", (e) => {
      logger.error("Error registrando webhook: " + e.message);
      reject(e);
    });

    req.write(body);
    req.end();
  });
}

module.exports = { generarLinkPago, consultarEstatusTransaccion, consultarEstatusPorSesion, registrarWebhook, reembolsarTransaccion };