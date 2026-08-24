// src/utils/horario.js
// Determina si el restaurante esta abierto AHORA MISMO, comparando la hora
// actual en la Ciudad de Mexico (America/Mexico_City) contra el horario
// configurado en config/restaurante.js -- sin importar en que zona horaria
// corra el servidor (Railway corre en UTC).
//
// Se agrego porque el bot antes no revisaba horarios en absoluto: un cliente
// podia pedir a cualquier hora y el pedido se registraba igual, aunque la
// sucursal estuviera cerrada.

const restaurante = require("../../config/restaurante");

function horaActualCDMX() {
  const partes = new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const mapa = {};
  for (const p of partes) mapa[p.type] = p.value;

  // Normaliza el nombre del dia (quita acentos/mayusculas por si el runtime
  // de Node lo formatea distinto, ej. "Lunes" vs "lunes").
  // Tras normalize("NFD") los acentos quedan como caracteres combinados
  // separados (ej. "miércoles" -> "mie" + combinado + "rcoles") -- filtrar
  // solo a-z ya los elimina, sin necesidad de un regex de rangos Unicode
  // aparte (mas simple y sin riesgo de problemas de codificacion al mover
  // este archivo entre sistemas).
  const dia = (mapa.weekday || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z]/g, "");

  return {
    dia,
    horaMinutos: parseInt(mapa.hour, 10) * 60 + parseInt(mapa.minute, 10),
  };
}

function horarioDeHoy(sucursal = null) {
  const { dia } = horaActualCDMX();
  const horario = (sucursal && sucursal.horario_propio) || restaurante.horario_general;
  return horario?.[dia] || null;
}

// Sin horario definido para hoy (dato faltante) -- no bloquear al cliente
// por un problema de configuracion, mejor dejar pasar.
function estaAbierto(sucursal = null) {
  const hoy = horarioDeHoy(sucursal);
  if (!hoy) return true;

  const { horaMinutos } = horaActualCDMX();
  const [hA, mA] = hoy.abre.split(":").map(Number);
  const [hC, mC] = hoy.cierra.split(":").map(Number);
  const minAbre = hA * 60 + mA;
  const minCierra = hC * 60 + mC;

  return horaMinutos >= minAbre && horaMinutos < minCierra;
}

// Texto amigable del horario para mostrarle al cliente. Como casi todas las
// sucursales comparten el mismo horario general (lunes a sabado igual,
// domingo distinto), se resume en una sola linea en vez de listar 7 dias.
function textoHorario(sucursal = null) {
  const horario = (sucursal && sucursal.horario_propio) || restaurante.horario_general;
  if (!horario) return "";

  const ls = horario.lunes;
  const dom = horario.domingo;
  const diasEntreSemana = ["martes", "miercoles", "jueves", "viernes", "sabado"];
  const uniforme = ls && diasEntreSemana.every(
    d => horario[d]?.abre === ls.abre && horario[d]?.cierra === ls.cierra
  );

  if (uniforme && dom) {
    return `Lunes a sábado de ${ls.abre} a ${ls.cierra}, domingos de ${dom.abre} a ${dom.cierra}`;
  }

  const orden = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
  const nombres = { lunes: "Lun", martes: "Mar", miercoles: "Mié", jueves: "Jue", viernes: "Vie", sabado: "Sáb", domingo: "Dom" };
  return orden
    .filter(d => horario[d])
    .map(d => `${nombres[d]} ${horario[d].abre}-${horario[d].cierra}`)
    .join(", ");
}

module.exports = { estaAbierto, textoHorario, horarioDeHoy };
