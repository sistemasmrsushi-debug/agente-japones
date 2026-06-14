// src/agent/agente.js
const restaurante = require("../../config/restaurante");
const logger = require("../utils/logger");

function getGroq() {
  const Groq = require("groq-sdk");
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

function getHorarioSucursal(sucursal) {
  const horario = sucursal.horario_propio || restaurante.horario_general;
  const dias = { lunes:"Lun", martes:"Mar", miercoles:"Mié", jueves:"Jue", viernes:"Vie", sabado:"Sáb", domingo:"Dom" };
  return Object.entries(horario).map(([dia, h]) => `${dias[dia]}: ${h.abre}–${h.cierra}`).join(" · ");
}

function getPromocionesSucursal(sucursal) {
  const hoy = new Date();
  const filtrar = p => p.vigencia === "hasta_nuevo_aviso" || hoy <= new Date(p.vigencia);
  const generales = (restaurante.promociones_generales || []).filter(p => {
    if (p.aplica_a === "restaurante" && sucursal.tipo !== "restaurante") return false;
    if (p.aplica_a === "fast_food" && sucursal.tipo !== "fast_food") return false;
    return filtrar(p);
  });
  return [...generales, ...(sucursal.promociones_propias || []).filter(filtrar)];
}

function buildSystemPrompt() {
  const menuTexto = Object.entries(restaurante.menu)
    .map(([cat, items]) => `${cat}:\n${items.map(i => `  - ${i.nombre}: $${i.precio} - ${i.descripcion}`).join("\n")}`)
    .join("\n\n");

  const sucursalesTexto = restaurante.sucursales.map(s => {
    const promos = getPromocionesSucursal(s);
    const promosTexto = promos.length > 0
      ? promos.map(p => `    🎉 ${p.nombre}: ${p.descripcion} · ${(p.dias||[]).join(", ")} ${p.hora_inicio||""}–${p.hora_fin||""} · ${p.vigencia === "hasta_nuevo_aviso" ? "hasta nuevo aviso" : `hasta ${p.vigencia}`}`).join("\n")
      : "    Sin promociones activas";
    return `  - ${s.nombre} [${s.tipo.toUpperCase()}] · ${s.zona}\n    Dir: ${s.direccion}\n    Horario: ${getHorarioSucursal(s)}\n    Promociones:\n${promosTexto}`;
  }).join("\n\n");

  return `Eres el asistente virtual de ${restaurante.nombre}, restaurante japonés.

PERSONALIDAD: Amable, profesional, español mexicano natural.
REGLA #1: Lee TODA la conversación. Si el cliente ya respondió algo, NO lo vuelvas a preguntar JAMÁS.

TIPOS DE SUCURSAL:
- RESTAURANTE: Aplican todas las promociones incluyendo barra libre
- FAST_FOOD: NO aplican promociones de restaurante

FLUJO DE PEDIDO:
1. Cliente pide → confirmas y preguntas UNA VEZ: ¿recoger o domicilio?
2. Recoger → preguntas sucursal (si no la dijo) → REGISTRAS
3. Domicilio → pides dirección UNA VEZ → REGISTRAS
4. NUNCA preguntes "¿confirmas?" — registra cuando tengas todos los datos

REGISTRAR — etiquetas ocultas al final de tu mensaje:
Sucursal: [PEDIDO]{"accion":"REGISTRAR_PEDIDO","pedido":{"items":[{"nombre":"...","precio":0,"cantidad":1}],"tipo":"sucursal","sucursal":"..."}}[/PEDIDO]
Domicilio: [PEDIDO]{"accion":"REGISTRAR_PEDIDO","pedido":{"items":[{"nombre":"...","precio":0,"cantidad":1}],"tipo":"domicilio","direccion":"...","colonia":"...","referencias":"...","sucursal":"domicilio"}}[/PEDIDO]
Reservación: [RESERVACION]{"accion":"REGISTRAR_RESERVACION","reservacion":{"nombre":"...","fecha":"...","hora":"...","personas":0,"sucursal":"..."}}[/RESERVACION]
Escalar: [ESCALAR]{"accion":"ESCALAR_HUMANO","motivo":"..."}[/ESCALAR]

DOMICILIO: Envío GRATIS · 40 min · Sin restricciones

MENÚ:\n${menuTexto}

SUCURSALES:\n${sucursalesTexto}

POLÍTICAS:
- ${restaurante.politicas.reservaciones}
- ${restaurante.politicas.cancelaciones}
- Tiempo espera: ${restaurante.politicas.tiempo_espera_pedido}`;
}

async function procesarMensaje(historial, mensajeNuevo) {
  try {
    const groq = getGroq();
    const response = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: buildSystemPrompt() },
        ...historial.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
        { role: "user", content: mensajeNuevo },
      ],
      max_tokens: 1024,
      temperature: 0.1,
    });

    const textoRespuesta = response.choices[0].message.content;
    const accion = detectarAccion(textoRespuesta);
    const textoLimpio = textoRespuesta
      .replace(/\[PEDIDO\][\s\S]*?\[\/PEDIDO\]/g, "")
      .replace(/\[RESERVACION\][\s\S]*?\[\/RESERVACION\]/g, "")
      .replace(/\[ESCALAR\][\s\S]*?\[\/ESCALAR\]/g, "")
      .trim();

    return {
      texto: textoLimpio,
      accion: accion?.tipo || null,
      datos: accion?.datos || null,
      historialActualizado: [...historial, { role:"user", content:mensajeNuevo }, { role:"assistant", content:textoRespuesta }],
    };
  } catch (error) {
    logger.error("Error agente: " + error.message);
    throw error;
  }
}

function detectarAccion(texto) {
  try {
    const m = texto.match(/\[(PEDIDO|RESERVACION|ESCALAR)\]([\s\S]*?)\[\/\1\]/);
    if (!m) return null;
    const datos = JSON.parse(m[2].trim());
    logger.info(`Acción: ${datos.accion}`);
    return { tipo: datos.accion, datos };
  } catch(e) { return null; }
}

module.exports = { procesarMensaje };
