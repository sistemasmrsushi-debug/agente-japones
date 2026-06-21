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

function listaSucursalesCorta() {
  return restaurante.sucursales.map(s => `${s.nombre} (${s.zona})`).join(", ");
}

// Menú con cada platillo en su propia línea, agrupado por categoría
function menuDetallado() {
  return Object.entries(restaurante.menu)
    .map(([categoria, items]) => {
      const lista = items.map(i => `  - ${i.nombre}: $${i.precio}`).join("\n");
      return `${categoria.toUpperCase()} (${items.length} opciones):\n${lista}`;
    })
    .join("\n\n");
}

function buildSystemPrompt() {
  return `Eres el asistente virtual de ${restaurante.nombre}, restaurante japonés.

REGLA #1 — MÁS IMPORTANTE:
Lee TODA la conversación. Si el cliente ya respondió algo, NO lo vuelvas a preguntar JAMÁS.

REGLA #2 — NO CONFUNDIR CATEGORÍAS:
Hay dos listas totalmente distintas: SUCURSALES (lugares físicos) y MENÚ (platillos de comida).
"¿qué sucursales tienen?" → responde con lugares de la lista SUCURSALES.
"¿qué tienen de comer?" o "¿qué rollos hay?" → responde con platillos de la lista MENÚ.

REGLA #3 — LISTAS COMPLETAS:
Cuando el cliente pregunte qué rollos, platillos o productos de una categoría hay, DEBES enumerar TODOS los que aparecen en esa categoría del MENÚ, no solo algunos. Por ejemplo si pregunta "qué rollos tienen" debes listar TODOS los rollos de las categorías "Rollos Tradicionales", "Rollos Especialidades" y "Sushi 2x1" — son más de 40 en total. No resumas ni acortes la lista a menos que el cliente pida solo "unos ejemplos" o "recomendación".

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

Horarios y promociones por sucursal:
${restaurante.sucursales.map(s => {
  const promos = getPromocionesSucursal(s);
  const promosTexto = promos.length > 0 ? promos.map(p => p.nombre).join(", ") : "ninguna";
  return `- ${s.nombre}: horario ${getHorarioSucursal(s)} · promos: ${promosTexto}`;
}).join("\n")}
=== FIN LISTA DE SUCURSALES ===

=== MENÚ COMPLETO (platillos de comida) ===
${menuDetallado()}
=== FIN MENÚ ===

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
      max_tokens: 2048,
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
