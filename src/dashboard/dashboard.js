// src/dashboard/dashboard.js
const express = require("express");
const router = express.Router();
const path = require("path");
const bcrypt = require("bcryptjs");
const logger = require("../utils/logger");
const db = require("../db/database");
const { crearSesion, cerrarSesion, requireAuth, requireGerente, requireReportes, bloquearSoloLectura, obtenerSesionesActivas } = require("./auth");
// CORREGIDO (26-ago-2026, reportado por Diego en una prueba real): el
// despacho a Uber Direct se movio aqui desde webhook_netpay.js -- antes se
// disparaba en cuanto se confirmaba el pago, sin esperar a que la cocina
// aceptara el pedido. Ahora se dispara cuando el pedido pasa a "en_proceso"
// (la cocina lo acepta), ver el endpoint PATCH /api/pedidos/:id/estado.
const { despacharUberDirect } = require("../utils/despacho_uber");
const { notificarDueno } = require("../utils/alertas");
// NUEVO (23-sep-2026, pedido por Diego): boton "Reenviar link" -- reusa la
// misma logica de Netpay/facturacion/cupon que ya usaba el cliente cuando
// escribia "ya pague"/"reintentar" por WhatsApp (ver reenviarLinkPago en
// whatsapp.js), para que Diego pueda mandarle un link nuevo al cliente
// desde el dashboard cuando le llega la alerta de que fallo Netpay.
const { reenviarLinkPago, crearPedidoManualYGenerarLink } = require("../webhook/whatsapp");
// NUEVO (09-oct-2026, pedido por Diego): boton "Reembolsar" -- Diego reporto
// que no se puede reembolsar a mano desde el panel/manager de Netpay, asi
// que hacia falta poder hacerlo desde aqui. Ver el comentario largo junto a
// reembolsarTransaccion en utils/netpay.js para el detalle del endpoint.
const { reembolsarTransaccion } = require("../utils/netpay");
// NUEVO (25-sep-2026, pedido por Diego): reporte financiero/operativo
// descargable en Excel (ventas, cupones/descuentos, quejas, reservaciones).
const { generarReporteExcel } = require("../utils/reportes");

// NOTA: Los usuarios y contraseñas ya NO viven aqui hardcodeados.
// Ahora se administran en la tabla `dashboard_usuarios` de PostgreSQL,
// editable desde el panel de administracion (solo gerente).
// Para la migracion inicial de datos existentes, ver scripts/migrar_config_a_db.js

function getMensajeSeguimiento(estado, pedido) {
  const sucursal = pedido.sucursal || "Mr. Sushi";
  const items = Array.isArray(pedido.items)
    ? pedido.items.map(i => `- ${i.cantidad||1}x ${i.nombre}${i.modificaciones ? ` (${i.modificaciones})` : ""}`).join("\n") : "";
  const msgs = {
    en_proceso: `🍣 Mr. Sushi - Tu pedido está en preparación\n\n¡Hola! Tu pedido en ${sucursal} ya está en preparación. 👨‍🍳\n\n${items}\n\n¡Gracias por tu paciencia!`,
    listo:      `✅ Mr. Sushi - ¡Tu pedido está listo!\n\n¡Hola! Tu pedido en ${sucursal} ya está listo.\n\n${items}\n\n¡Te esperamos! 🍣`,
    cancelado:  `😕 Mr. Sushi - Pedido cancelado\n\nLo sentimos, tu pedido en ${sucursal} fue cancelado.\n\nSi tienes dudas contáctanos directamente.`,
  };
  return msgs[estado] || null;
}

async function notificarCliente(telefono, mensaje) {
  try {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return;
    const dest = telefono.startsWith("whatsapp:") ? telefono : `whatsapp:${telefono}`;
    const client = require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
      to: dest,
      body: mensaje
    });
    logger.info(`Notificacion enviada a ${telefono}`);
  } catch (error) {
    logger.error(`Error notificando: ` + error.message);
  }
}

router.post("/api/login", async (req, res) => {
  try {
    const { usuario, password } = req.body;
    if (!usuario || !password) return res.status(400).json({ error: "Falta usuario o contrasena" });
    const user = await db.obtenerUsuarioDashboardPorUsuario(usuario);
    // Comparacion segura con bcrypt (nunca comparar contrasenas en texto plano).
    const coincide = user && await bcrypt.compare(password, user.password);
    if (!coincide)
      return res.status(401).json({ error: "Usuario o contrasena incorrectos" });
    const token = crearSesion({ usuario: user.usuario, rol: user.rol, sucursal: user.sucursal, sucursales: user.sucursales });
    res.json({ ok: true, token, rol: user.rol, sucursal: user.sucursal, sucursales: user.sucursales, usuario: user.usuario });
  } catch (err) {
    logger.error("Error en login: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

router.post("/api/logout", requireAuth, (req, res) => {
  const token = (req.headers["authorization"] || "").replace("Bearer ", "");
  cerrarSesion(token);
  res.json({ ok: true });
});

router.get("/api/pedidos", requireAuth, async (req, res) => {
  try {
    const { rol, sucursal, sucursales } = req.sesion; // viene del token, no del query param del cliente
    const pedidos = await db.obtenerPedidos(sucursal, rol, sucursales);
    res.json(pedidos);
  } catch (err) {
    logger.error("Error obteniendo pedidos: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

// NUEVO (26-sep-2026, pedido por Diego): lista simple de nombres de
// sucursales para cualquier usuario logueado (no solo gerente) -- la usa el
// selector de sucursal al crear un usuario y el panel de Reportes para el
// rol "administrativo". A proposito solo regresa el nombre, no telefono ni
// horario ni nada mas sensible (eso sigue siendo solo para /api/admin/*).
router.get("/api/sucursales-nombres", requireAuth, async (req, res) => {
  try {
    const sucursales = await db.obtenerSucursales();
    res.json(sucursales.map(s => ({ nombre: s.nombre })));
  } catch (err) {
    logger.error("Error obteniendo nombres de sucursales: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

// NUEVO (23-sep-2026, pedido por Diego): seguimiento de quejas de clientes.
// El agente de IA ya las captura solas en la conversacion de WhatsApp (ver
// QUEJA O PROBLEMA DEL CLIENTE en agente.js) -- aqui solo se listan para que
// el dashboard las muestre, filtradas por sucursal igual que los pedidos.
// NUEVO (29-sep-2026, pedido por Diego): lista de platillos activos (id,
// categoria, nombre, precio) para el selector del panel "Generar link" --
// cualquier rol con acceso de escritura a pedidos la puede consultar (no
// solo gerente), a diferencia de /api/admin/menu que trae TODO (activos e
// inactivos) y es solo para la pestaña de Administracion.
router.get("/api/menu-activo", requireAuth, async (req, res) => {
  try {
    const items = await db.obtenerMenu();
    res.json(items.map(i => ({ id: i.id, categoria: i.categoria, nombre: i.nombre, precio: i.precio })));
  } catch (err) {
    logger.error("Error obteniendo menu activo: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

// NUEVO (29-sep-2026, pedido por Diego): "Generar link" -- una sucursal toma
// un pedido a domicilio por su cuenta (llamada, cliente que llega a
// preguntar, etc., NO por la conversacion del bot de WhatsApp) y solo
// necesita un link de pago de Netpay para mandarselo ella misma al cliente
// por el medio que prefiera. El bot NO le escribe nada al cliente aqui --
// ver crearPedidoManualYGenerarLink en whatsapp.js para el detalle de que
// SI se le sigue avisando automaticamente (la confirmacion de pago, cuando
// Netpay avisa que ya se cobró).
router.post("/api/pedidos/manual", requireAuth, bloquearSoloLectura, async (req, res) => {
  try {
    const { rol, sucursal, sucursales } = req.sesion;
    const { telefono, nombreCliente, items, direccion, referencias } = req.body;
    let sucursalDestino = req.body.sucursal;

    // La sucursal destino SIEMPRE se resuelve desde la sesion, nunca se
    // confia en lo que mande el cliente (ver bloquearSoloLectura -- mismo
    // principio de no ampliar el alcance de un usuario editando el request).
    if (rol === "sucursal") {
      sucursalDestino = sucursal;
    } else if (rol === "supervisor") {
      if (!sucursalDestino || !Array.isArray(sucursales) || !sucursales.includes(sucursalDestino)) {
        return res.status(400).json({ error: "Elige una de tus sucursales asignadas." });
      }
    } else if (rol === "gerente") {
      if (!sucursalDestino) return res.status(400).json({ error: "Elige una sucursal." });
    } else {
      // administrativo ya quedo bloqueado arriba (bloquearSoloLectura), pero
      // por si aparece un rol nuevo en el futuro, no se deja pasar por default.
      return res.status(403).json({ error: "Tu rol no puede generar links de pago manuales." });
    }

    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: "Agrega al menos un platillo." });
    }

    const resultado = await crearPedidoManualYGenerarLink({
      telefono, nombreCliente, sucursal: sucursalDestino, items,
      direccionTexto: direccion, referencias,
    });

    if (resultado.exito) {
      res.json({ ok: true, pedidoId: resultado.pedidoId, linkPago: resultado.linkPago, direccion: resultado.direccionResuelta });
    } else {
      res.status(400).json({ error: resultado.error, pedidoId: resultado.pedidoId || null });
    }
  } catch (err) {
    logger.error("Error creando pedido manual: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

router.get("/api/quejas", requireAuth, async (req, res) => {
  try {
    const { rol, sucursal, sucursales } = req.sesion;
    const quejas = await db.obtenerQuejas(sucursal, rol, sucursales);
    res.json(quejas);
  } catch (err) {
    logger.error("Error obteniendo quejas: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

// Boton "Marcar como resuelta" -- para las quejas que el agente NO pudo
// resolver solo (las que ya llegaron con estado "nueva" y dispararon la
// alerta a Diego). No hay endpoint para "reabrir" por ahora -- si hace
// falta, se agrega despues.
router.patch("/api/quejas/:id/resuelta", requireAuth, bloquearSoloLectura, async (req, res) => {
  try {
    const { id } = req.params;
    const queja = await db.marcarQuejaResuelta(id);
    if (!queja) return res.status(404).json({ error: "Queja no encontrada" });
    res.json(queja);
  } catch (err) {
    logger.error("Error actualizando queja: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

router.get("/api/reservaciones", requireAuth, async (req, res) => {
  try {
    const { rol, sucursal, sucursales } = req.sesion;
    const reservaciones = await db.obtenerReservaciones(sucursal, rol, sucursales);
    res.json(reservaciones);
  } catch (err) {
    logger.error("Error obteniendo reservaciones: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

router.patch("/api/pedidos/:id/estado", requireAuth, bloquearSoloLectura, async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    const pedido = await db.actualizarEstadoPedido(id, estado);
    if (!pedido) return res.status(404).json({ error: "No encontrado" });
    let mensaje = getMensajeSeguimiento(estado, pedido);

    // CORREGIDO (26-ago-2026, reportado por Diego en una prueba real): el
    // despacho a Uber Direct se dispara AQUI -- cuando la cocina acepta el
    // pedido ("en_proceso") -- en vez de en cuanto se confirma el pago. Asi
    // Uber no busca repartidor hasta que alguien en la sucursal ya sepa del
    // pedido. El guard de "!pedido.uber_delivery_id" evita despachar dos
    // veces si alguien marca "en_proceso" mas de una vez por error.
    if (estado === "en_proceso" && pedido.tipo === "domicilio" && !pedido.uber_delivery_id) {
      const resultadoUber = await despacharUberDirect(pedido);
      if (resultadoUber.trackingUrl) {
        mensaje = (mensaje || "") + `\n\n🛵 Ya estamos buscando tu repartidor. Puedes seguirlo aquí:\n${resultadoUber.trackingUrl}`;
      } else if (!resultadoUber.exito) {
        logger.warn(`Pedido ${id} aceptado pero el despacho a Uber Direct fallo -- revisar manualmente.`);
        notificarDueno(`🔴 Uber Direct falló al despachar un repartidor.\n\nPedido: ${id}\nCliente: ${(pedido.telefono_cliente || "").replace("whatsapp:", "")}\nSucursal: ${pedido.sucursal}\nDirección: ${pedido.direccion || "—"}\n\nLa cocina ya aceptó el pedido pero NO se asignó repartidor -- hay que gestionarlo manualmente (llamar a un repartidor o volver a intentar el despacho).`);
      }
    }

    if (mensaje && pedido.telefono_cliente)
      await notificarCliente(pedido.telefono_cliente, mensaje);
    res.json(pedido);
  } catch (err) {
    logger.error("Error actualizando pedido: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

// NUEVO (23-sep-2026, pedido por Diego): boton "Reenviar link" en el
// dashboard para pedidos atorados en "pendiente_pago" (ej. cuando la tarjeta
// del cliente fue rechazada o Netpay fallo al generar el link la primera
// vez). Solo aplica a pedidos a domicilio que sigan esperando pago -- para
// cualquier otro estado/tipo no tiene sentido generar un link nuevo.
router.post("/api/pedidos/:id/reenviar-link", requireAuth, bloquearSoloLectura, async (req, res) => {
  try {
    const { id } = req.params;
    const pedido = await db.obtenerPedidoPorId(id);
    if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
    if (pedido.tipo !== "domicilio" || pedido.estado !== "pendiente_pago") {
      return res.status(400).json({ error: "Este pedido no está esperando pago -- no se puede reenviar el link" });
    }
    const resultado = await reenviarLinkPago(pedido);
    if (resultado.exito) {
      res.json({ ok: true, linkPago: resultado.linkPago });
    } else {
      res.status(502).json({ error: resultado.error || "No se pudo generar el link de pago" });
    }
  } catch (err) {
    logger.error("Error reenviando link de pago: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

// NUEVO (07-oct-2026, pedido por Diego): boton "Solicitar otro repartidor"
// para cuando Uber Direct no pudo completar una entrega (estatus "canceled"
// o "returned", ver src/webhook/webhook_uber.js) o cuando el despacho
// inicial fallo por completo (nunca se asigno repartidor). Antes no habia
// ninguna forma de volver a intentar el despacho desde el dashboard -- el
// comentario viejo en este mismo archivo decia literalmente "hay que
// gestionarlo manualmente" sin dar una forma de hacerlo. Reusa
// despacharUberDirect(), la misma funcion del despacho automatico -- crea
// una entrega NUEVA de Uber Direct (cotizacion + creacion) y sobrescribe
// uber_delivery_id/uber_estado/uber_tracking_url del pedido.
router.post("/api/pedidos/:id/reenviar-repartidor", requireAuth, bloquearSoloLectura, async (req, res) => {
  try {
    const { id } = req.params;
    const pedido = await db.obtenerPedidoPorId(id);
    if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
    if (pedido.tipo !== "domicilio") {
      return res.status(400).json({ error: "Este pedido no es a domicilio -- no aplica un repartidor" });
    }
    if (!["en_proceso", "listo"].includes(pedido.estado)) {
      return res.status(400).json({ error: "Este pedido no está en un estado donde tenga sentido mandar un repartidor" });
    }

    const resultadoUber = await despacharUberDirect(pedido);
    if (resultadoUber.exito) {
      if (resultadoUber.trackingUrl && pedido.telefono_cliente) {
        await notificarCliente(
          pedido.telefono_cliente,
          `🛵 Ya estamos buscando un nuevo repartidor para tu pedido. Puedes seguirlo aquí:\n${resultadoUber.trackingUrl}`
        );
      }
      res.json({ ok: true, trackingUrl: resultadoUber.trackingUrl || null });
    } else {
      logger.warn(`Pedido ${id}: se intento mandar otro repartidor pero el despacho a Uber Direct volvio a fallar.`);
      notificarDueno(`🔴 Uber Direct volvió a fallar al intentar mandar otro repartidor.\n\nPedido: ${id}\nCliente: ${(pedido.telefono_cliente || "").replace("whatsapp:", "")}\nSucursal: ${pedido.sucursal}\nDirección: ${pedido.direccion || "—"}\n\nEsta vez hay que gestionarlo totalmente fuera del sistema (repartidor propio, u otra plataforma).`);
      res.status(502).json({ error: "No se pudo despachar un nuevo repartidor -- revisa los logs o intenta de nuevo en unos minutos" });
    }
  } catch (err) {
    logger.error("Error reenviando repartidor: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

// NUEVO (09-oct-2026, pedido por Diego): boton "Reembolsar" en el dashboard.
// Solo "gerente" puede usarlo (igual que /api/sesiones-activas) -- es dinero
// real saliendo, asi que se restringe mas que las demas acciones (que solo
// bloquean al rol "administrativo" de solo lectura). TODO: por ahora esto se
// probo contra el ambiente de SANDBOX de Netpay -- antes de confiar en esto
// con pagos reales de produccion, hay que confirmar con una transaccion de
// prueba que el 200 de Netpay de verdad regresa el dinero (su documentacion
// no lo aclara, ver el comentario en utils/netpay.js).
router.post("/api/pedidos/:id/reembolsar", requireGerente, async (req, res) => {
  try {
    const { id } = req.params;
    const pedido = await db.obtenerPedidoPorId(id);
    if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
    if (!pedido.netpay_transaction_id) {
      return res.status(400).json({ error: "Este pedido no tiene una transacción de Netpay asociada -- puede ser un pedido anterior a esta función, o uno que nunca se pagó por este medio. Revisa manualmente." });
    }
    if (pedido.reembolsado_en) {
      return res.status(400).json({ error: `Este pedido ya fue reembolsado el ${new Date(pedido.reembolsado_en).toLocaleString("es-MX")}.` });
    }

    const resultado = await reembolsarTransaccion(pedido.netpay_transaction_id);
    if (resultado.exito) {
      await db.marcarPedidoReembolsado(id);
      logger.info(`Pedido ${id} reembolsado por ${req.sesion.usuario} (transactionId=${pedido.netpay_transaction_id})`);
      if (pedido.telefono_cliente) {
        await notificarCliente(
          pedido.telefono_cliente,
          `💸 Tu pedido ${id} fue reembolsado. El dinero puede tardar unos días hábiles en reflejarse en tu tarjeta, dependiendo de tu banco.`
        );
      }
      res.json({ ok: true });
    } else {
      logger.warn(`Pedido ${id}: fallo el reembolso en Netpay -- ${resultado.error}`);
      res.status(502).json({ error: resultado.error || "Netpay no pudo procesar el reembolso" });
    }
  } catch (err) {
    logger.error("Error reembolsando pedido: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

router.patch("/api/reservaciones/:id/estado", requireAuth, bloquearSoloLectura, async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    const reservacion = await db.actualizarEstadoReservacion(id, estado);
    if (!reservacion) return res.status(404).json({ error: "No encontrado" });
    res.json(reservacion);
  } catch (err) {
    logger.error("Error actualizando reservacion: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

router.get("/api/stats", requireAuth, async (req, res) => {
  try {
    const stats = await db.obtenerStatsPedidos();
    res.json(stats);
  } catch (err) {
    logger.error("Error obteniendo stats: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

// Solo el gerente puede ver que sucursales tienen el dashboard abierto ahora mismo.
router.get("/api/sesiones-activas", requireGerente, (req, res) => {
  try {
    res.json(obtenerSesionesActivas());
  } catch (err) {
    logger.error("Error obteniendo sesiones activas: " + err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

// NUEVO (25-sep-2026, pedido por Diego): reporte financiero/operativo en
// Excel para un rango de fechas -- solo gerente. Junta ventas, cupones/
// descuentos, quejas y reservaciones en un solo archivo .xlsx con una hoja
// por tema (ver src/utils/reportes.js). El token llega por query param (no
// por header) porque el navegador dispara esto como una descarga normal,
// no como un fetch -- ver requireGerente/extraerToken en auth.js, que ya
// acepta el token de las dos formas.
router.get("/api/reportes/excel", requireReportes, async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!desde || !hasta) return res.status(400).json({ error: "Faltan las fechas 'desde' y 'hasta'" });

    // "hasta" es inclusivo para quien lo pide (ej. "hasta el 30 de
    // septiembre"), pero la consulta necesita un limite EXCLUSIVO -- se le
    // suma un dia para cubrir el dia completo sin importar la hora exacta
    // de cada registro.
    const desdeFecha = new Date(desde + "T00:00:00");
    const hastaFecha = new Date(hasta + "T00:00:00");
    if (isNaN(desdeFecha.getTime()) || isNaN(hastaFecha.getTime())) {
      return res.status(400).json({ error: "Fechas inválidas" });
    }
    hastaFecha.setDate(hastaFecha.getDate() + 1);

    // NUEVO (26-sep-2026, pedido por Diego): filtro opcional de sucursales
    // para el reporte -- llega como "sucursales=A&sucursales=B" (Express lo
    // arma como arreglo) o "sucursales=A,B" (un solo string), segun como lo
    // mande el navegador. Vacio/omitido = todas (comportamiento de antes).
    let sucursalesFiltro = req.query.sucursales;
    if (typeof sucursalesFiltro === "string") sucursalesFiltro = sucursalesFiltro.split(",").filter(Boolean);
    if (!Array.isArray(sucursalesFiltro) || !sucursalesFiltro.length) sucursalesFiltro = null;

    // NUEVO (26-sep-2026, pedido por Diego): rol "administrativo" -- SIEMPRE
    // se fuerza al reporte a sus sucursales asignadas, sin importar que
    // mande en el query param (para que no pueda ampliar su alcance
    // editando la URL a mano). Si por algun motivo no tiene ninguna
    // asignada, se rechaza en vez de caer sin querer al "todas" que produce
    // un sucursalesFiltro vacio/null.
    if (req.sesion.rol === "administrativo") {
      if (!Array.isArray(req.sesion.sucursales) || !req.sesion.sucursales.length)
        return res.status(403).json({ error: "Tu usuario no tiene sucursales asignadas -- pide al gerente que te asigne al menos una." });
      sucursalesFiltro = req.sesion.sucursales;
    }

    const [pedidos, quejas, reservaciones, cupones] = await Promise.all([
      db.obtenerPedidosPorRango(desdeFecha, hastaFecha, sucursalesFiltro),
      db.obtenerQuejasPorRango(desdeFecha, hastaFecha, sucursalesFiltro),
      db.obtenerReservacionesPorRango(desdeFecha, hastaFecha, sucursalesFiltro),
      db.obtenerCupones(),
    ]);

    const buffer = await generarReporteExcel({ desde, hasta, pedidos, cupones, quejas, reservaciones });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="reporte_mrsushi_${desde}_a_${hasta}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    logger.error("Error generando reporte: " + err.message);
    res.status(500).json({ error: "Error interno generando el reporte" });
  }
});

router.get("/dashboard", (req, res) =>
  res.sendFile(path.join(__dirname, "index.html"))
);

module.exports = router;
