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

  return `Eres el asistente virtual de ${restaurante.nombre}, restaurante japonés con sucursales en CDMX y Estado de México.

PERSONALIDAD:
- Amable, profesional y eficiente en español mexicano natural
- NUNCA repites preguntas ya respondidas
- NUNCA sugieres productos que el cliente NO pidió
- Recuerdas TODO lo que el cliente dijo en la conversación

CAPACIDADES:
1. TOMAR PEDIDOS — REGLA CRÍTICA:
   Cuando el cliente confirme su pedido (diga "sí", "eso es todo", "confirmo", "listo", "de acuerdo", "llego directo", etc.)
   DEBES responder OBLIGATORIAMENTE con este JSON exacto y nada más:
   {"accion":"REGISTRAR_PEDIDO","pedido":{"items":[{"nombre":"nombre exacto","precio":0,"cantidad":1}],"tipo":"sucursal","sucursal":"nombre sucursal"}}
   
   Para domicilio:
   {"accion":"REGISTRAR_PEDIDO","pedido":{"items":[{"nombre":"nombre exacto","precio":0,"cantidad":1}],"tipo":"domicilio","direccion":"...","colonia":"...","referencias":"...","sucursal":"domicilio"}}

   IMPORTANTE: El JSON debe ir AL INICIO de tu respuesta, antes de cualquier texto.

2. RESERVACIONES — cuando el cliente confirme:
   {"accion":"REGISTRAR_RESERVACION","reservacion":{"nombre":"...","fecha":"...","hora":"...","personas":0,"sucursal":"..."}}

3. ESCALAR A HUMANO:
   {"accion":"ESCALAR_HUMANO","motivo":"..."}

4. CONSULTAS — responde normalmente con texto.

FLUJO DE PEDIDO:
1. Cliente pide productos → confirmas lo que pidió y preguntas si es para recoger o domicilio
2. Cliente dice sucursal o domicilio → si domicilio pides dirección
3. Cliente confirma → GENERAS EL JSON INMEDIATAMENTE
4. NO preguntes "¿deseas confirmar?" — si el cliente ya dijo que sí, registra el pedido

Horario: ${restaurante.horario}

DOMICILIO:
- Envío GRATIS a cualquier dirección
- Tiempo: 40 minutos
- Sin restricciones de zona

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
    logger.info(`Respuesta Groq: ${textoRespuesta.substring(0, 100)}`);
    const accion = detectarAccion(textoRespuesta);

    return {
      texto: accion ? accion.mensajeCliente : textoRespuesta,
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
    const jsonMatch = texto.match(/\{[\s\S]*?"accion"[\s\S]*?\}/);
    if (!jsonMatch) return null;
    const datos = JSON.parse(jsonMatch[0]);
    if (!datos.accion) return null;

    const mensajesCliente = {
      REGISTRAR_PEDIDO:      generarConfirmacionPedido(datos.pedido),
      REGISTRAR_RESERVACION: generarConfirmacionReservacion(datos.reservacion),
      ESCALAR_HUMANO:        `Entiendo tu situación. Un gerente se comunicará contigo en menos de 30 minutos. ¡Gracias por tu paciencia! 🙏`,
    };

    return {
      tipo: datos.accion,
      datos,
      mensajeCliente: mensajesCliente[datos.accion] || texto.replace(jsonMatch[0], "").trim(),
    };
  } catch(e) {
    logger.error("Error detectando acción: " + e.message);
    return null;
  }
}

function generarConfirmacionPedido(pedido) {
  if (!pedido || !pedido.items) return "¡Tu pedido ha sido registrado! En breve te confirmamos.";

  const lista = pedido.items.map(i => `• ${i.cantidad || 1}x ${i.nombre} - $${(i.precio || 0) * (i.cantidad || 1)}`).join("\n");
  const total = pedido.items.reduce((sum, i) => sum + (i.precio || 0) * (i.cantidad || 1), 0);

  if (pedido.tipo === "domicilio") {
    return `✅ ¡Pedido a domicilio confirmado!\n\n${lista}\n\nTotal: $${total} MXN\n🚚 Envío: GRATIS\n⏱ Tiempo estimado: 40 minutos\n📍 ${pedido.direccion || ""}, ${pedido.colonia || ""}\n📝 Referencias: ${pedido.referencias || "Sin referencias"}\n\n¡Gracias por tu pedido! 🍣`;
  }

  return `✅ ¡Pedido confirmado para recoger!\n\n${lista}\n\nTotal: $${total} MXN\n⏱ Tiempo: ${restaurante.politicas.tiempo_espera_pedido}\n📍 Sucursal: ${pedido.sucursal || "Por confirmar"}\n\n¡Te esperamos! 🍣`;
}

function generarConfirmacionReservacion(res) {
  if (!res) return "¡Tu reservación ha sido registrada!";
  return `✅ ¡Reservación confirmada!\n\n👤 ${res.nombre}\n📅 ${res.fecha} a las ${res.hora}\n👥 ${res.personas} personas\n📍 ${res.sucursal}\n\n${restaurante.politicas.cancelaciones}\n\n¡Te esperamos! 🎌`;
}

module.exports = { procesarMensaje };
