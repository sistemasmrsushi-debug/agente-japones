// src/utils/despacho_uber.js
// NUEVO (26-ago-2026): logica de despacho a Uber Direct, separada de
// webhook_netpay.js para que tambien la pueda usar dashboard.js.
//
// CORREGIDO (26-ago-2026, reportado por Diego en una prueba real): antes el
// despacho a Uber se disparaba automaticamente en cuanto se confirmaba el
// PAGO (webhook de Netpay), sin importar si la cocina ya habia aceptado el
// pedido. Eso significa que Uber podia empezar a buscar repartidor -- y en
// una entrega real, el repartidor podia llegar a la sucursal -- antes de que
// alguien en la cocina supiera siquiera que habia un pedido nuevo. Ahora el
// despacho se dispara desde el dashboard, cuando la cocina marca el pedido
// como "en_proceso" (lo acepta), no desde el webhook de pago. Ver
// dashboard.js.

const db = require("../db/database");
const logger = require("./logger");
const { crearCotizacion, crearEntrega } = require("./uber_direct");
const { credencialesPorSucursal } = require("../../config/uber_credenciales");

// CONFIRMADO (23-ago-2026, con diagnosticar_uber.js): el "failed to create
// location" que fallaba en TODAS las entregas a domicilio no era por la
// direccion -- era el TELEFONO de la sucursal. config/restaurante.js guarda
// varias sucursales con dos numeros en el mismo campo separados por "/" y
// sin codigo de pais (ej. "55 5393 0232 / 55 5572 3088"), y Uber Direct
// rechaza ese formato ("pickup phone number is not valid"). Esta funcion
// toma solo el primer numero y lo convierte a formato E.164 (+52...).
function formatearTelefonoUber(telefono) {
  if (!telefono) return "";
  const primerNumero = telefono.split("/")[0].trim();
  const soloDigitos = primerNumero.replace(/\D/g, "");
  if (!soloDigitos) return "";
  const conCodigoPais = soloDigitos.length === 10 ? `52${soloDigitos}` : soloDigitos;
  return `+${conCodigoPais}`;
}

// Arma los datos de recoleccion (la sucursal) y entrega (el domicilio del
// cliente, ya validado con Google Maps) y crea la entrega en Uber Direct.
async function despacharUberDirect(pedido) {
  try {
    const sucursales = await db.obtenerSucursales();
    const sucursal = sucursales.find(s => s.nombre === pedido.sucursal);

    if (!sucursal || !sucursal.lat || !sucursal.lng) {
      logger.warn(`No se pudo despachar Uber Direct para ${pedido.id}: sucursal "${pedido.sucursal}" sin coordenadas registradas. Corre el script de geocodificacion de sucursales.`);
      return { exito: false };
    }
    if (!pedido.ubicacion_gps?.latitude) {
      logger.warn(`No se pudo despachar Uber Direct para ${pedido.id}: el pedido no tiene coordenadas de domicilio guardadas.`);
      return { exito: false };
    }

    // Direcciones estructuradas (calle separada de colonia/ciudad/estado/CP)
    // -- ver comentarios en uber_direct.js sobre armarDireccionUber() y su
    // fallback seguro a texto completo si faltan estos campos.
    const pickup = {
      nombre: sucursal.nombre,
      direccionCompleta: sucursal.direccion,
      colonia: sucursal.colonia || null,
      ciudad: sucursal.municipio || null,
      estado: sucursal.estado_direccion || null,
      codigoPostal: sucursal.codigo_postal || null,
      telefono: formatearTelefonoUber(sucursal.telefono),
      lat: Number(sucursal.lat),
      lng: Number(sucursal.lng),
    };
    const dropoff = {
      nombre: pedido.nombre_cliente || "Cliente Mr. Sushi",
      direccionCompleta: pedido.direccion,
      colonia: pedido.colonia || null,
      ciudad: pedido.municipio || null,
      estado: pedido.estado_direccion || null,
      codigoPostal: pedido.codigo_postal || null,
      telefono: formatearTelefonoUber((pedido.telefono_cliente || "").replace("whatsapp:", "")),
      lat: pedido.ubicacion_gps.latitude,
      lng: pedido.ubicacion_gps.longitude,
    };

    // Interruptor de pruebas: mientras UBER_DIRECT_MODO_PRUEBA=true este
    // configurado en Railway, todos los despachos se crean en modo "Robo
    // Courier" (repartidor SIMULADO, sin costo ni despacho real), para poder
    // probar el flujo completo del bot (WhatsApp -> pago -> aceptar -> despacho)
    // sin afectar operacion real. Quitar la variable (o ponerla en "false")
    // antes de operar con clientes reales.
    const modoPrueba = process.env.UBER_DIRECT_MODO_PRUEBA === "true";
    if (modoPrueba) {
      logger.warn(`UBER_DIRECT_MODO_PRUEBA activo -- el despacho de ${pedido.id} sera SIMULADO (Robo Courier), no se manda repartidor real.`);
    }

    // Credenciales de Uber Direct por razon social (ver config/uber_credenciales.js).
    // SEGURIDAD: en modo de prueba SIEMPRE se usan credenciales de sandbox
    // dedicadas y explicitas (nunca produccion), ver comentario original en
    // el historial de webhook_netpay.js.
    let credenciales;
    if (modoPrueba && process.env.UBER_DIRECT_CLIENT_ID_SANDBOX && process.env.UBER_DIRECT_CLIENT_SECRET_SANDBOX) {
      credenciales = {
        clientId: process.env.UBER_DIRECT_CLIENT_ID_SANDBOX,
        clientSecret: process.env.UBER_DIRECT_CLIENT_SECRET_SANDBOX,
        razonSocial: "SANDBOX (modo de prueba)",
      };
      logger.info(`Despachando ${pedido.id} en modo de prueba con credenciales de SANDBOX dedicadas (nunca produccion).`);
    } else {
      credenciales = credencialesPorSucursal(pedido.sucursal);
      if (credenciales) {
        logger.info(`Despachando ${pedido.id} con credenciales de "${credenciales.razonSocial}" (sucursal: ${pedido.sucursal})`);
      }
    }

    // Flujo Quote -> Create obligatorio (exigido por Uber para certificacion).
    const cotizacion = await crearCotizacion({ pickup, dropoff, credenciales });
    if (!cotizacion.exito) {
      logger.error(`Fallo al cotizar entrega de Uber Direct para ${pedido.id}: ${cotizacion.error}`);
      return { exito: false };
    }

    const externalStoreId = `sucursal-${sucursal.id}`;

    const resultado = await crearEntrega({
      pickup,
      dropoff,
      items: pedido.items,
      referencia: pedido.id,
      quoteId: cotizacion.quoteId,
      externalStoreId,
      dropoffNotes: pedido.referencias || undefined,
      activarPincode: false, // incompatible con undeliverable_action=leave_at_door
      testSpecifications: modoPrueba ? { robo_courier_specification: { mode: "auto" } } : undefined,
      credenciales,
    });

    if (resultado.exito) {
      await db.guardarEntregaUber(pedido.id, {
        deliveryId: resultado.deliveryId,
        trackingUrl: resultado.trackingUrl,
        estadoUber: resultado.estado,
      });
      logger.info(`Entrega de Uber Direct creada para ${pedido.id}: deliveryId=${resultado.deliveryId}`);
      return { exito: true, trackingUrl: resultado.trackingUrl || null };
    }
    logger.error(`Fallo al crear entrega de Uber Direct para ${pedido.id}: ${resultado.error}`);
    return { exito: false };
  } catch (error) {
    logger.error(`Error inesperado despachando Uber Direct para ${pedido.id}: ${error.message}`);
    return { exito: false };
  }
}

module.exports = { despacharUberDirect, formatearTelefonoUber };
