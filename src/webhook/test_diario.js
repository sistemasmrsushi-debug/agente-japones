// src/webhook/test_diario.js
// =============================================
// NUEVO (06-oct-2026, pedido por Diego): endpoints para la prueba diaria
// automatizada que paga un pedido REAL (en sandbox) de principio a fin, para
// confirmar que el webhook de pago de Netpay sigue llegando -- que es
// justo lo que fallo esta semana sin que nadie se diera cuenta por dias.
//
// La prueba interna de prueba_diaria.js genera un link de pago pero NUNCA
// lo paga, asi que nunca prueba si Netpay de verdad nos avisa. Pagar un
// pedido real solo se puede hacer en la pagina de checkout de Netpay (no
// hay API de servidor a servidor para esto) -- por eso esta parte corre
// desde la computadora de Diego (ver la tarea programada), usando un
// navegador real para pagar con una tarjeta de prueba.
//
// Estos endpoints NO usan el login normal del dashboard (esas sesiones
// duran 8 horas y se perderian de un dia para otro). En vez de eso, usan
// una clave secreta propia (TEST_DIARIO_TOKEN, variable de entorno) que
// SOLO sirve para crear/consultar/borrar pedidos de la "Sucursal de
// Prueba" -- nunca para nada mas. Si esta clave se filtrara, el peor caso
// es que alguien cree pedidos de prueba falsos, no acceso a datos reales.
// =============================================
const express = require("express");
const router = express.Router();
const logger = require("../utils/logger");
const db = require("../db/database");
const { crearPedidoManualYGenerarLink } = require("./whatsapp");

const NOMBRE_SUCURSAL_PRUEBA = "Sucursal de Prueba";

// Direccion para que la validacion contra Google Maps en
// crearPedidoManualYGenerarLink siempre pase -- la prueba no debe depender
// de que una direccion inventada se geocodifique bien. Se usa literal el
// texto que Google Maps ya regreso una vez para un pedido real (PED-
// 1791239589496, 05-oct-2026) -- no una direccion armada a mano -- porque
// la primera version (una direccion de una sucursal copiada de
// config/restaurante.js, nunca antes geocodificada) fallo la validacion en
// la primera corrida real de esta prueba (06-oct-2026): "No encontramos esa
// direccion". Usar el formato EXACTO que Google ya devolvio una vez quita
// esa incertidumbre.
const DIRECCION_PRUEBA = "Avenida Lomas Verdes 22, Lomas Verdes Alteña II, 53120 Naucalpan de Juárez, Méx.";

function validarToken(req, res) {
  const token = process.env.TEST_DIARIO_TOKEN;
  if (!token) {
    res.status(500).json({ error: "TEST_DIARIO_TOKEN no esta configurada en el servidor." });
    return false;
  }
  if (req.query.token !== token) {
    logger.warn(`Intento de acceso a test_diario con token invalido (IP: ${req.ip})`);
    res.status(403).json({ error: "Token invalido." });
    return false;
  }
  return true;
}

// Crea el pedido de prueba y regresa el link de pago de Netpay (JSON, no
// redirect -- asi el navegador que controla la prueba se queda con el
// pedidoId para los pasos siguientes, y navega el mismo al link de pago).
router.get("/test-diario/ejecutar", async (req, res) => {
  if (!validarToken(req, res)) return;
  try {
    const resultado = await crearPedidoManualYGenerarLink({
      telefono: "whatsapp:+525500000000",
      nombreCliente: "Prueba Diaria Automatizada",
      sucursal: NOMBRE_SUCURSAL_PRUEBA,
      items: [{ nombre: "Prueba diaria (ignorar)", precio: 1, cantidad: 1 }],
      direccionTexto: DIRECCION_PRUEBA,
      referencias: "Pedido de prueba automatizado -- no preparar, se borra solo.",
    });
    if (!resultado.exito) {
      logger.error(`Prueba diaria (pago real): fallo creando el pedido de prueba -- ${resultado.error}`);
      return res.status(500).json({ ok: false, error: resultado.error });
    }
    logger.info(`Prueba diaria (pago real): pedido de prueba creado ${resultado.pedidoId}`);
    res.json({ ok: true, pedidoId: resultado.pedidoId, linkPago: resultado.linkPago });
  } catch (error) {
    logger.error("Error en /test-diario/ejecutar: " + error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Consulta el estatus actual del pedido de prueba (para confirmar si ya se
// marco como pagado, lo que demuestra que el webhook de Netpay si llego).
router.get("/test-diario/estado", async (req, res) => {
  if (!validarToken(req, res)) return;
  try {
    const { id } = req.query;
    const pedido = id && await db.obtenerPedidoPorId(id);
    // Verificacion de seguridad: aunque el token ya limita mucho, esto evita
    // que esta ruta se pueda usar para consultar el estatus de un pedido
    // real de un cliente por error o mal uso.
    if (!pedido || pedido.sucursal !== NOMBRE_SUCURSAL_PRUEBA) {
      return res.status(404).json({ ok: false, error: "Pedido de prueba no encontrado." });
    }
    res.json({ ok: true, estado: pedido.estado });
  } catch (error) {
    logger.error("Error en /test-diario/estado: " + error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Borra el pedido de prueba al terminar -- nunca debe quedar acumulandose
// en la base de datos real dia tras dia.
router.get("/test-diario/limpiar", async (req, res) => {
  if (!validarToken(req, res)) return;
  try {
    const { id } = req.query;
    const pedido = id && await db.obtenerPedidoPorId(id);
    if (!pedido || pedido.sucursal !== NOMBRE_SUCURSAL_PRUEBA) {
      return res.status(404).json({ ok: false, error: "Pedido de prueba no encontrado." });
    }
    await db.eliminarPedido(id);
    logger.info(`Prueba diaria (pago real): pedido de prueba ${id} borrado (limpieza)`);
    res.json({ ok: true });
  } catch (error) {
    logger.error("Error en /test-diario/limpiar: " + error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
