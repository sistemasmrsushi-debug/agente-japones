// src/utils/telnet_pos.js
// =============================================
// Integracion con el WS de Pedidos en Linea de Grupo Telnet, para que cada
// pedido pagado/confirmado llegue SOLO a la caja de la sucursal, sin que
// alguien lo tenga que volver a escribir a mano (pedido por Diego,
// 17-nov-2026, a partir de la "Guía de integración: envío de pedidos en
// formato JSON al Punto de Venta", ticket 219646, que Diego compartio).
//
// Credenciales (usuario/password/claveBaseDeDatos) y la URL productiva viven
// SOLO en variables de entorno de Railway -- TELNET_URL, TELNET_USUARIO,
// TELNET_PASSWORD, TELNET_CLAVE_BD -- nunca en el codigo ni en prompts, tal
// como pide el propio manual de Telnet. Mientras no esten configuradas, esta
// integracion es un no-op total: no se manda nada y no se rompe nada.
//
// Por sucursal: Grupo Telnet identifica cada una con SU PROPIO numero
// (columna sucursales.telnet_sucursal_id -- Telnet tiene 40 sucursales
// registradas de su lado, nosotros 25, los numeros NO coinciden) y su propia
// terminal de cobro para pagos con tarjeta (telnet_terminal_tarjeta). El
// envio a Telnet SOLO se dispara si la sucursal tiene telnet_activo=true --
// asi Diego puede activarlo sucursal por sucursal desde el panel de
// administracion (para poder probarlo primero en una sola, antes de prender
// las demas), en vez de que se activen las 25 de golpe.
//
// Los productos: a diferencia de las sucursales, el catalogo de productos
// que did Diego (Excel "Productos_Agente_IA") es UNO SOLO compartido por
// todas las sucursales (las 229 claves empiezan "AP", ninguna trae
// distincion por sucursal) -- por eso la clave vive en menu_items
// (telnet_clave_producto), no en una tabla aparte por sucursal.
//
// Si falta cualquier cosa (credenciales, sucursal sin configurar o
// desactivada, un platillo sin clave de producto confirmada) esto NUNCA
// bloquea ni rompe el flujo real del pedido -- solo se registra en los logs
// y, si hace falta que alguien lo resuelva a mano, se avisa a Diego por SMS
// (ver alertas.js), exactamente igual que las demas integraciones (Uber
// Direct, Netpay).
//
// IMPORTANTE: este modulo se escribio SIN poder probarlo contra el servicio
// real de Telnet (Diego todavia no tenia las credenciales al momento de
// escribirlo) -- esta armado siguiendo el manual al pie de la letra, pero
// hace falta una prueba en vivo con un pedido real (o de prueba) en cuanto
// haya credenciales, antes de confiar en el para producción.
// =============================================
const axios = require("axios");
const logger = require("./logger");
const db = require("../db/database");
const { notificarDueno } = require("./alertas");

function credencialesConfiguradas() {
  return !!(
    process.env.TELNET_URL &&
    process.env.TELNET_USUARIO &&
    process.env.TELNET_PASSWORD &&
    process.env.TELNET_CLAVE_BD
  );
}

function normalizarNombre(nombre) {
  return String(nombre || "").trim().toLowerCase();
}

// El manual (seccion 4) pide sustituir la comilla simple y el punto y coma,
// y respetar los limites de longitud de cada campo de texto.
function limpiarTexto(valor, maxLen) {
  if (valor === undefined || valor === null) return valor;
  let limpio = String(valor).replace(/'/g, "`").replace(/;/g, "-");
  return maxLen ? limpio.slice(0, maxLen) : limpio;
}

// Arma el cuerpo del pedido en el formato que pide el manual (secciones 4 y
// 5). Regresa { ok:true, body } o { ok:false, error } -- error cuando falta
// la clave de Telnet de algun platillo: el manual es explicito en que "una
// clave inexistente o inactiva rechaza el pedido completo", asi que aqui
// jamas se inventa ni se manda una clave sin confirmar.
async function armarCuerpoPedido(pedido, sucursalRow, { pagadaConTarjeta }) {
  const menu = await db.obtenerMenu();
  const mapaClaves = new Map(menu.map((m) => [normalizarNombre(m.nombre), m.telnet_clave_producto]));

  const faltantes = [];
  const productos = (pedido.items || []).map((item) => {
    const clave = mapaClaves.get(normalizarNombre(item.nombre));
    if (!clave) faltantes.push(item.nombre);
    const linea = {
      claveProducto: clave || "SIN_CLAVE",
      cantidad: item.cantidad || 1,
      precio: Number(item.precio) || 0,
      concepto: limpiarTexto(item.nombre, 100),
    };
    if (item.modificaciones) linea.comentario = limpiarTexto(item.modificaciones, 500);
    return linea;
  });

  if (faltantes.length) {
    return {
      ok: false,
      error: `Faltan claves de producto de Telnet para: ${[...new Set(faltantes)].join(", ")} (configúralas en Administración → Menú).`,
    };
  }

  if (!sucursalRow.telnet_sucursal_id) {
    return { ok: false, error: `La sucursal "${pedido.sucursal}" no tiene configurado su número de sucursal en Telnet.` };
  }

  const esDomicilio = pedido.tipo === "domicilio";
  const totalProductos = productos.reduce((s, p) => s + p.precio * p.cantidad, 0);
  const total = Math.round((totalProductos - Number(pedido.descuento_monto || 0)) * 100) / 100;

  const body = {
    requestType: "pedido",
    usuario: process.env.TELNET_USUARIO,
    password: process.env.TELNET_PASSWORD,
    claveBaseDeDatos: process.env.TELNET_CLAVE_BD,
    sucursal: sucursalRow.telnet_sucursal_id,
    total,
    pagada: pagadaConTarjeta ? 1 : 0,
    tipoVenta: esDomicilio ? "DOMICILIO" : "LLEVAR",
    validar: 0, // Diego ya confirma/rechaza pedidos desde su propio dashboard -- no hace falta pedirle a Telnet que vuelva a confirmar.
    nombre: limpiarTexto(pedido.nombre_cliente || "Cliente Mr. Sushi", 100),
    referencia: pedido.id,
    productos,
  };

  if (pagadaConTarjeta) {
    // Sin terminal configurada, el manual dice que el pedido SE ACEPTA de
    // todos modos (Telnet usa una terminal de respaldo) -- no es motivo para
    // no mandarlo, pero si para avisarle a Diego que falta configurarla
    // (ver el aviso en enviarPedidoATelnet).
    if (sucursalRow.telnet_terminal_tarjeta) body.terminalTarjeta = sucursalRow.telnet_terminal_tarjeta;
  }

  if (esDomicilio) {
    body.telefono = limpiarTexto((pedido.telefono_cliente || "").replace("whatsapp:", ""), 50);
    body.direccion = limpiarTexto(pedido.direccion, 150);
    body.colonia = limpiarTexto(pedido.colonia, 50);
    if (pedido.referencias) body.instrucciones = limpiarTexto(pedido.referencias, 500);
  } else {
    body.telefono = limpiarTexto((pedido.telefono_cliente || "").replace("whatsapp:", ""), 50);
  }

  return { ok: true, body, faltaTerminal: pagadaConTarjeta && !sucursalRow.telnet_terminal_tarjeta };
}

// Mensajes de error que, segun la seccion 7 del manual, valen la pena
// reintentar (fallas temporales del servicio) -- todo lo demas (datos mal
// armados, credenciales, clave de producto invalida, pedido repetido) NO se
// reintenta porque un segundo intento fallaria exactamente igual, o -- en el
// caso de "pedido repetido" -- duplicaria un pedido que Telnet ya recibió.
function esErrorTemporal(mensajeError) {
  const m = (mensajeError || "").toLowerCase();
  return m.includes("no se tiene conexión") || m.includes("no se tiene conexion") || m.includes("error interno al procesar");
}

// El manual dice que Telnet SIEMPRE contesta HTTP 200 (el resultado se lee
// en el JSON, no en el codigo HTTP) -- asi que una falla "temporal" de su
// lado (seccion 7: "No se tiene conexión con base de datos central...",
// "Error interno al procesar...") llega como una respuesta exitosa con ese
// mensaje en "error", no como un fallo de red. Por eso el reintento (hasta
// 3 veces, con una pausa chica entre cada uno, tal como recomienda el
// manual) vive aqui, revisando TANTO fallos de red/timeout como ese tipo de
// mensaje -- nunca se reintenta un error de validacion o de credenciales,
// porque un segundo intento fallaria exactamente igual.
async function llamarWsTelnet(body, intento = 1) {
  let resultado;
  try {
    const { data } = await axios.post(process.env.TELNET_URL, body, {
      headers: { "Content-Type": "application/json" },
      timeout: 15000,
    });
    resultado = { exito: true, data };
  } catch (error) {
    const mensaje = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    resultado = { exito: false, error: mensaje, fueFalloDeRed: true };
  }

  const esTemporal = resultado.fueFalloDeRed || (resultado.exito && esErrorTemporal(resultado.data?.error));
  if (esTemporal && intento < 3) {
    logger.warn(`Telnet POS: intento ${intento} fallo (${resultado.error || resultado.data?.error}), reintentando...`);
    await new Promise((r) => setTimeout(r, 2000 * intento));
    return llamarWsTelnet(body, intento + 1);
  }
  return resultado;
}

// Punto de entrada. pagadaConTarjeta lo decide quien llama (webhook_netpay.js
// para pedidos pagados con tarjeta via Netpay; whatsapp.js para pedidos de
// sucursal que se pagan en persona) -- no se adivina aqui, para no
// equivocarse con los casos raros (ej. un pedido a domicilio con cupón de
// 100%, donde no se cobró nada con tarjeta).
//
// Nunca lanza un error hacia quien la llama -- cualquier falla queda
// registrada en la tabla pedidos (telnet_estatus/telnet_error) y, si hace
// falta intervencion humana, como alerta por SMS a Diego.
async function enviarPedidoATelnet(pedido, { pagadaConTarjeta }) {
  try {
    if (!credencialesConfiguradas()) return; // integracion todavia no configurada -- no-op silencioso, nada que avisar

    const sucursalRow = await db.obtenerSucursalPorNombre(pedido.sucursal);
    if (!sucursalRow || !sucursalRow.telnet_activo) return; // sucursal sin activar para Telnet -- no-op silencioso (asi funciona el interruptor del panel)

    const armado = await armarCuerpoPedido(pedido, sucursalRow, { pagadaConTarjeta });
    if (!armado.ok) {
      logger.error(`Telnet POS: no se pudo armar el pedido ${pedido.id} -- ${armado.error}`);
      await db.guardarResultadoTelnet(pedido.id, { estatus: "ERROR", error: armado.error });
      await notificarDueno(`🔴 Pedido ${pedido.id} (${pedido.sucursal}) NO se pudo mandar al POS de Telnet.\n\n${armado.error}`);
      return;
    }

    if (armado.faltaTerminal) {
      logger.warn(`Telnet POS: sucursal "${pedido.sucursal}" sin terminal de cobro configurada -- el pedido ${pedido.id} se manda de todos modos, pero la conciliación de ese cobro puede no cuadrar.`);
    }

    const resultado = await llamarWsTelnet(armado.body);
    if (!resultado.exito) {
      logger.error(`Telnet POS: fallo de conexión mandando el pedido ${pedido.id}: ${resultado.error}`);
      await db.guardarResultadoTelnet(pedido.id, { estatus: "ERROR", error: resultado.error });
      await notificarDueno(`🔴 Pedido ${pedido.id} (${pedido.sucursal}) NO se pudo mandar al POS de Telnet (falla de conexión). Hay que registrarlo a mano en la caja.\n\n${resultado.error}`);
      return;
    }

    const { data } = resultado;
    const pedidoTelnet = Number(data?.pedido);
    const errorTelnet = (data?.error || "").trim();

    if (pedidoTelnet > 0 && !errorTelnet) {
      logger.info(`Telnet POS: pedido ${pedido.id} registrado en la caja como #${pedidoTelnet} (sucursal ${pedido.sucursal}).`);
      await db.guardarResultadoTelnet(pedido.id, { telnetPedidoId: String(pedidoTelnet), estatus: "ENVIADO" });
      return;
    }

    if (pedidoTelnet > 0 && errorTelnet) {
      // "Se registra pedido, pero no se ha podido entregar en sucursal..." --
      // SI quedo registrado (no reenviar), pero la caja no lo recibio en el
      // momento. El manual recomienda consultar el estatus despues; por ahora
      // se avisa a Diego para que alguien lo confirme a mano con la sucursal.
      logger.warn(`Telnet POS: pedido ${pedido.id} registrado (#${pedidoTelnet}) pero no entregado a la sucursal: ${errorTelnet}`);
      await db.guardarResultadoTelnet(pedido.id, { telnetPedidoId: String(pedidoTelnet), estatus: "ENVIADO_SIN_CONFIRMAR", error: errorTelnet });
      await notificarDueno(`🟡 Pedido ${pedido.id} (${pedido.sucursal}) se registró en Telnet (#${pedidoTelnet}) pero la caja de la sucursal no lo recibió en el momento. Confirma con la sucursal que sí les llegó.`);
      return;
    }

    // pedidoTelnet === 0 (o no vino): algo no se proceso.
    if (errorTelnet.toLowerCase().includes("pedido repetido")) {
      // Ya esta registrado de un envio anterior -- no es un error real.
      logger.info(`Telnet POS: pedido ${pedido.id} ya estaba registrado (Telnet lo marcó como repetido), se omite.`);
      await db.guardarResultadoTelnet(pedido.id, { estatus: "YA_REGISTRADO" });
      return;
    }

    logger.error(`Telnet POS: pedido ${pedido.id} rechazado por Telnet: ${errorTelnet}`);
    await db.guardarResultadoTelnet(pedido.id, { estatus: "ERROR", error: errorTelnet });
    await notificarDueno(`🔴 Pedido ${pedido.id} (${pedido.sucursal}) fue RECHAZADO por el POS de Telnet. Hay que registrarlo a mano en la caja.\n\nMotivo: ${errorTelnet}`);
  } catch (error) {
    // Ultimo resguardo: pase lo que pase aqui, JAMAS debe tumbar el flujo
    // real del pedido (pago, aviso al cliente, etc.) -- se registra y listo.
    logger.error(`Telnet POS: error inesperado mandando el pedido ${pedido?.id}: ${error.message}`);
    try { await db.guardarResultadoTelnet(pedido.id, { estatus: "ERROR", error: error.message }); } catch {}
  }
}

module.exports = { enviarPedidoATelnet };
