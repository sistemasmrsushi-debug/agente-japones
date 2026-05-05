// src/agent/agente.js
const restaurante = require("../../config/restaurante");
const logger = require("../utils/logger");

function getGroq() {
  if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY.trim() === "") {
    throw new Error("Configura GROQ_API_KEY en tus variables de entorno");
  }
  const Groq = require("groq-sdk");
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

function buildSystemPrompt() {
  const menuTexto = Object.entries(restaurante.menu)
    .map(([categoria, items]) => {
      const lista = items.map(i => `  - ${i.nombre}: $${i.precio} - ${i.descripcion}`).join("\n");
      return `${categoria}:\n${lista}`;
    }).join("\n\n");

  const sucursalesTexto = restaurante.sucursales
    .map(s => `  - ${s.nombre} (${s.zona}): ${s.direccion}`).join("\n");

  return `Eres el asistente virtual de ${restaurante.nombre}, restaurante japonés.

REGLA #1 — LA MÁS IMPORTANTE:
Lee TODA la conversación antes de responder.
Si el cliente YA respondió algo, NO lo vuelvas a preguntar JAMÁS.
Si ya dijo "recoger" o "sucursal" → NO preguntes de nuevo si es recoger o domicilio.
Si ya dio su dirección → NO la vuelvas a pedir.
Si ya dijo qué sucursal → NO preguntes de nuevo.

FLUJO CORRECTO:
Paso 1 → Cliente pide productos
Paso 2 → Preguntas UNA SOLA VEZ: ¿recoger en sucursal o a domicilio?
Paso 3a → Si dice sucursal: preguntas UNA SOLA VEZ en cuál sucursal (si no lo dijo)
Paso 3b → Si dice domicilio: pides dirección UNA SOLA VEZ
Paso 4 → Cuando tengas TODOS los datos: productos + tipo + sucursal/dirección → REGISTRAS EL PEDIDO INMEDIATAMENTE

NUNCA:
- Preguntes lo mismo dos veces
- Preguntes "¿deseas confirmar?"
- Muestres el JSON al cliente

CÓMO REGISTRAR UN PEDIDO:
Escribe primero el mensaje de confirmación al cliente, luego agrega la etiqueta oculta:
[PEDIDO]{"accion":"REGISTRAR_PEDIDO","pedido":{"items":[{"nombre":"nombre","precio":0,"cantidad":1}],"tipo":"sucursal","sucursal":"nombre sucursal"}}[/PEDIDO]

Para domicilio:
[PEDIDO]{"accion":"REGISTRAR_PEDIDO","pedido":{"items":[{"nombre":"nombre","precio":0,"cantidad":1}],"tipo":"domicilio","direccion":"...","colonia":"...","referencias":"...","sucursal":"domicilio"}}[/PEDIDO]

Para reservación:
[RESERVACION]{"accion":"REGISTRAR_RESERVACION","reservacion":{"nombre":"...","fecha":"...","hora":"...","personas":0,"sucursal":"..."}}[/RESERVACION]

Para escalar a humano:
[ESCALAR]{"accion":"ESCALAR_HUMANO","motivo":"..."}[/ESCALAR]

Horario: ${restaurante.horario}

DOMICILIO: Envío GRATIS · 40 minutos · Sin restricciones de zona

MENÚ:
${menuTexto}

SUCURSALES:
${sucursalesTexto}

POLÍTICAS:
- Reservaciones: ${restaurante.politicas.reservaciones}
- Cancelaciones: ${restaurante.politicas.cancelaciones}
- Tiempo espera: ${restaurante.politicas.tiempo_espera_pedido}`;
}

async function procesarMensaje(historial, mensajeNuevo) {
  try {
    const groq = getGroq();
    const messages = [
      { role: "system", content: buildSystemPrompt() },
      ...historial.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
      { role: "user", content: mensajeNuevo },
    ];

    const response = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages,
      max_tokens: 1024,
      temperature: 0.1,
    });

    const textoRespuesta = response.choices[0].message.content;
    logger.info(`Respuesta Groq: ${textoRespuesta.substring(0, 150)}`);

    const accion = detectarAccion(textoRespuesta);

    // Limpiar etiquetas del texto visible al cliente
    const textoLimpio = textoRespuesta
      .replace(/\[PEDIDO\][\s\S]*?\[\/PEDIDO\]/g, "")
      .replace(/\[RESERVACION\][\s\S]*?\[\/RESERVACION\]/g, "")
      .replace(/\[ESCALAR\][\s\S]*?\[\/ESCALAR\]/g, "")
      .trim();

    return {
      texto: textoLimpio,
      accion: accion ? accion.tipo : null,
      datos: accion ? accion.datos : null,
      historialActualizado: [
        ...historial,
        { role: "user",      content: mensajeNuevo },
        { role: "assistant", content: textoRespuesta },
      ],
    };
  } catch (error) {
    logger.error("Error en agente Groq: " + error.message);
    throw error;
  }
}

function detectarAccion(texto) {
  try {
    const pedidoMatch  = texto.match(/\[PEDIDO\]([\s\S]*?)\[\/PEDIDO\]/);
    const reservaMatch = texto.match(/\[RESERVACION\]([\s\S]*?)\[\/RESERVACION\]/);
    const escalarMatch = texto.match(/\[ESCALAR\]([\s\S]*?)\[\/ESCALAR\]/);

    let jsonStr = null;
    if (pedidoMatch)  jsonStr = pedidoMatch[1];
    if (reservaMatch) jsonStr = reservaMatch[1];
    if (escalarMatch) jsonStr = escalarMatch[1];

    if (!jsonStr) return null;

    const datos = JSON.parse(jsonStr.trim());
    if (!datos.accion) return null;

    logger.info(`Acción detectada: ${datos.accion}`);
    return { tipo: datos.accion, datos };
  } catch(e) {
    logger.error("Error detectando acción: " + e.message);
    return null;
  }
}

module.exports = { procesarMensaje };
