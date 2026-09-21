// src/utils/cupones.js
// =============================================
// Validacion y calculo de cupones de descuento (campañas). Ver
// src/db/database.js para el CRUD de la tabla "cupones" (usado por el panel
// de administracion, src/dashboard/admin.js) y src/webhook/whatsapp.js /
// src/agent/agente.js para donde el cliente da el codigo por WhatsApp.
// =============================================
const db = require("../db/database");

// Fecha de HOY en formato YYYY-MM-DD, en hora de Ciudad de Mexico (no UTC).
// Importante para que un cupon con fecha_fin "hoy" siga siendo valido hasta
// la medianoche LOCAL -- la de UTC va 6 horas adelantada (o 5 en horario de
// verano), asi que sin esto un cupon podria "expirar" varias horas antes de
// lo que dice su propia fecha de fin.
function hoyCDMX() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" }); // en-CA = YYYY-MM-DD
}

// Valida un codigo de cupon contra la base de datos: que exista, que este
// activo, que la fecha de hoy caiga dentro de su vigencia, y que no haya
// alcanzado su limite de usos. NO incrementa el uso -- eso solo debe pasar
// si el pedido se llega a crear con exito (ver db.incrementarUsoCupon,
// llamado desde whatsapp.js una vez que el pedido ya existe).
async function validarCupon(codigoCrudo) {
  const codigo = (codigoCrudo || "").trim().toUpperCase();
  if (!codigo) return { valido: false, motivo: "El código de cupón viene vacío." };

  const cupon = await db.obtenerCuponPorCodigo(codigo);
  if (!cupon) return { valido: false, motivo: `El código "${codigo}" no existe.` };
  if (cupon.activo === false) return { valido: false, motivo: `El código "${codigo}" ya no está activo.` };

  const hoy = hoyCDMX();
  // fecha_inicio/fecha_fin vienen de Postgres como objetos Date -- se
  // comparan como texto YYYY-MM-DD (toISOString().slice(0,10) es seguro
  // porque Postgres las guarda sin hora, a medianoche UTC).
  const inicio = cupon.fecha_inicio ? new Date(cupon.fecha_inicio).toISOString().slice(0, 10) : null;
  const fin = cupon.fecha_fin ? new Date(cupon.fecha_fin).toISOString().slice(0, 10) : null;

  if (inicio && hoy < inicio) {
    return { valido: false, motivo: `El código "${codigo}" todavía no es válido (empieza el ${inicio}).` };
  }
  if (fin && hoy > fin) {
    return { valido: false, motivo: `El código "${codigo}" ya expiró (venció el ${fin}).` };
  }
  if (cupon.usos_maximos !== null && cupon.usos_maximos !== undefined && cupon.usos_actuales >= cupon.usos_maximos) {
    return { valido: false, motivo: `El código "${codigo}" ya alcanzó su límite de usos.` };
  }

  return { valido: true, cupon };
}

// Calcula el monto de descuento (redondeado a centavos) sobre el TOTAL del
// pedido -- confirmado con Diego que el descuento aplica sobre el total
// completo, no platillo por platillo.
function calcularDescuento(totalPedido, porcentaje) {
  const monto = Math.round(totalPedido * (Number(porcentaje) / 100) * 100) / 100;
  return Math.min(monto, totalPedido); // nunca mas que el total mismo
}

module.exports = { validarCupon, calcularDescuento, hoyCDMX };
