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
  return restaurante.sucursales.map(s => s.nombre).join(", ");
}

function menuCompacto() {
  return Object.entries(restaurante.menu)
    .map(([categoria, items]) => {
      const lista = items.map(i => `${i.nombre} $${i.precio}`).join(" · ");
      return `[${categoria}] (${items.length}): ${lista}`;
    })
    .join("\n");
}

function detectarSucursalMencionada(mensaje) {
  const texto = mensaje.toLowerCase();
  return restaurante.sucursales.find(s => texto.includes(s.nombre.toLowerCase()));
}

function buildSystemPrompt(sucursalRelevante) {
  let bloqueHorario = "";
  if (sucursalRelevante) {
    const promos = getPromocionesSucursal(sucursalRelevante);
    const promosTexto = promos.length > 0 ? promos.map(p => `${p.nombre} (${(p.dias||[]).join(",")} ${p.hora_inicio||""}-${p.hora_fin||""})`).join(", ") : "ninguna activa";
    bloqueHorario = `\nHORARIO Y PROMOS DE "${sucursalRelevante.nombre}": ${getHorarioSucursal(sucursalRelevante)} | Promos: ${promosTexto}`;
  } else {
    bloqueHorario = `\nHorario general: ${Object.entries(restaurante.horario_general).map(([d,h])=>`${d.slice(0,3)} ${h.abre}-${h.cierra}`).join(", ")}.`;
  }

  return `Eres el asistente virtual de ${restaurante.nombre}, restaurante japonés. Responde breve, directo, y SIEMPRE con una respuesta completa en texto natural — nunca dejes un mensaje vacío o solo con una palabra como "Sucursal:".

REGLAS:
1. Lee TODA la conversación. Si el cliente ya respondió algo, NO lo preguntes de nuevo.
2. "sucursales" = lugares físicos. "menú/platillos/rollos" = comida. No mezcles.
3. El menú está dividido en categorías entre corchetes [Categoría]. Cada platillo SOLO pertenece a su categoría, no las mezcles.
4. Al listar una categoría completa, enumera TODOS sus platillos salvo que pidan "ejemplos".

FLUJO DE PEDIDO — sigue estos pasos EXACTOS, en orden, sin saltarte ninguno:
Paso A: Cliente menciona productos → confirmas qué pidió con precios y preguntas: "¿Lo quieres recoger en sucursal o que te lo enviemos a domicilio?"
Paso B1: Si responde "sucursal" o "recoger" → preguntas: "¿En cuál sucursal?" (si no la dijo ya)
Paso B2: Si responde "domicilio" o "a mi casa" → respondes con una frase completa como: "¡Perfecto! ¿Cuál es tu dirección completa, colonia y alguna referencia para la entrega?"
Paso C: Cuando el cliente da la sucursal (B1) o la dirección completa (B2) → en ese mismo mensaje generas la confirmación final con TODOS los datos del pedido y la etiqueta [PEDIDO]. Nunca generes la etiqueta antes de tener tipo + sucursal/dirección.
IMPORTANTE: nunca respondas solo "Sucursal:" ni dejes una respuesta a medias. Siempre da una oración completa.

REGISTRAR — etiquetas ocultas al final del mensaje (el cliente NO las ve):
Sucursal: [PEDIDO]{"accion":"REGISTRAR_PEDIDO","pedido":{"items":[{"nombre":"...","precio":0,"cantidad":1}],"tipo":"sucursal","sucursal":"..."}}[/PEDIDO]
Domicilio: [PEDIDO]{"accion":"REGISTRAR_PEDIDO","pedido":{"items":[{"nombre":"...","precio":0,"cantidad":1}],"tipo":"domicilio","direccion":"...","colonia":"...","referencias":"...","sucursal":"domicilio"}}[/PEDIDO]
Reservación: [RESERVACION]{"accion":"REGISTRAR_RESERVACION","reservacion":{"nombre":"...","fecha":"...","hora":"...","personas":0,"sucursal":"..."}}[/RESERVACION]
Escalar: [ESCALAR]{"accion":"ESCALAR_HUMANO","motivo":"..."}[/ESCALAR]

DOMICILIO: Envío GRATIS · 40 min · Sin restricciones de zona

SUCURSALES: ${listaSucursalesCorta()}
${bloqueHorario}

MENÚ (cada categoría es exclusiva, no mezclar):
${menuCompacto()}

POLÍTICAS: ${restaurante.politicas.reservaciones} ${restaurante.politicas.cancelaciones} Tiempo espera: ${restaurante.politicas.tiempo_espera_pedido}

FACTURACIÓN: Si el cliente pide factura o ticket fiscal, responde de forma natural con este mensaje:
"¡Claro! Para tu factura comunícate al 56 1109 7461. Para agilizar el proceso ten a la mano:
• Constancia de Situación Fiscal o RFC
• Nombre o Razón Social (completo y sin errores)
• Código Postal de tu domicilio fiscal
• Régimen Fiscal (ej. Sueldos y Salarios, Personas Físicas con Actividades Empresariales, etc.)
¿Hay algo más en que te pueda ayudar? 😊"`;
}

function limitarHistorial(historial, maxTurnos = 6) {
  const maxMensajes = maxTurnos * 2;
  if (historial.length <= maxMensajes) return historial;
  return historial.slice(historial.length - maxMensajes);
}

async function procesarMensaje(historial, mensajeNuevo) {
  try {
    const groq = getGroq();
    const historialLimitado = limitarHistorial(historial);
    const textoReciente = [mensajeNuevo, ...historialLimitado.slice(-4).map(m => m.content)].join(" ");
    const sucursalRelevante = detectarSucursalMencionada(textoReciente);

    const response = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: buildSystemPrompt(sucursalRelevante) },
        ...historialLimitado.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
        { role: "user", content: mensajeNuevo },
      ],
      max_tokens: 1200,
      temperature: 0.1,
    });

    let textoRespuesta = response.choices[0].message.content;
    const accion = detectarAccion(textoRespuesta);
    let textoLimpio = textoRespuesta
      .replace(/\[PEDIDO\][\s\S]*?\[\/PEDIDO\]/g, "")
      .replace(/\[RESERVACION\][\s\S]*?\[\/RESERVACION\]/g, "")
      .replace(/\[ESCALAR\][\s\S]*?\[\/ESCALAR\]/g, "")
      .trim();

    // Salvaguarda: si el texto quedó vacío o es solo una etiqueta huérfana
    // (ej. "Sucursal:"), generamos un mensaje de respaldo en vez de mandar vacío.
    if (!textoLimpio || textoLimpio.length < 3 || /^sucursal:?$/i.test(textoLimpio)) {
      logger.warn(`Respuesta vacía o inválida detectada, usando fallback. Original: "${textoRespuesta}"`);
      textoLimpio = "¿Me puedes confirmar de nuevo tu pedido? Quiero asegurarme de registrarlo correctamente. 🍣";
    }

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
