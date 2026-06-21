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

// Lista corta y plana de sucursales — solo nombre, zona y dirección breve
function listaSucursalesCorta() {
  return restaurante.sucursales
    .map(s => `${s.nombre} (${s.zona})`)
    .join(", ");
}

function buildSystemPrompt() {
  const menuTexto = Object.entries(restaurante.menu)
    .map(([cat, items]) => `${cat}: ${items.map(i => `${i.nombre} $${i.precio}`).join(", ")}`)
    .join("\n");

  return `Eres el asistente virtual de ${restaurante.nombre}, restaurante japonés.

REGLA #1 — MÁS IMPORTANTE:
Lee TODA la conversación. Si el cliente ya respondió algo, NO lo vuelvas a preguntar JAMÁS.

REGLA #2 — NO CONFUNDIR CATEGORÍAS:
Hay dos listas totalmente distintas en este prompt: SUCURSALES (lugares físicos donde recoger pedido) y MENÚ (platillos de comida).
Si el cliente pregunta "¿qué sucursales tienen?" o "¿en qué sucursales hay?" responde SOLO con nombres de lugares de la lista SUCURSALES, nunca con platillos.
Si el cliente pregunta "¿qué tienen de comer?" o "¿qué rollos hay?" responde SOLO con platillos de la lista MENÚ, nunca con sucursales.

FLUJO DE PEDIDO:
1. Cliente pide productos → confirmas y preguntas UNA VEZ: ¿recoger o domicilio?
2. Recoger → preguntas sucursal (si no la dijo) → REGISTRAS
3. Domicilio → pides dirección UNA VEZ → REGISTRAS
4. NUNCA preguntes "¿confirmas?" — registra cuando tengas todos los datos

REGISTRAR — etiquetas ocultas al final de tu mensaje:
Sucursal: [PEDIDO]{"accion":"REGISTRAR_PEDIDO","pedido":{"items":[{"nombre":"...","precio":0,"cantidad":1}],"tipo":"sucursal","sucursal":"..."}}[/PEDIDO]
Domicilio: [PEDIDO]{"accion":"REGISTRAR_PEDIDO","pedido":{"items":[{"nombre":"...","precio":0,"cantidad":1}],"tipo":"domicilio","direccion":"...","colonia":"...","referencias":"...","sucursal":"domicilio"}}[/PEDIDO]
Reservación: [RESERVACION]{"accion":"REGISTRAR_RESERVACION","reservacion":{"nombre":"...","fecha":"...","hora":"...","personas":0,"sucursal":"..."}}[/RESERVACION]
Escalar: [ESCALAR]{"accion":"ESCALAR_HUMANO","motivo":"..."}[/ESCALAR]

DOMICILIO: Envío GRATIS · 40 min · Sin restricciones

=== LISTA DE SUCURSALES (lugares físicos) ===
${listaSucursalesCorta()}

Si el cliente pide horario o promoción de una sucursal específica, usa esta info detallada:
${restaurante.sucursales.map(s => {
  const promos = getPromocionesSucursal(s);
  const promosTexto = promos.length > 0 ? promos.map(p => p.nombre).join(", ") : "ninguna";
  return `- ${s.nombre}: horario ${getHorarioSucursal(s)} · promos: ${promosTexto}`;
}).join("\n")}

=== FIN LISTA DE SUCURSALES ===

=== LISTA DE MENÚ (platillos de comida) ===
${menuTexto}
=== FIN LISTA DE MENÚ ===

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