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

  return `Eres el asistente virtual de ${restaurante.nombre}, un restaurante japonés con sucursales en CDMX y Estado de México.

Tu personalidad:
- Amable, profesional y eficiente
- Hablas en español mexicano natural
- NUNCA sugieres productos que el cliente NO pidió
- NUNCA cambies el tema de lo que el cliente está pidiendo
- Responde EXACTAMENTE lo que el cliente pregunta o pide

Tus capacidades:
1. TOMAR PEDIDOS: 
   - Registra EXACTAMENTE lo que el cliente pide, sin sugerir cambios
   - Pregunta si es para RECOGER EN SUCURSAL o a DOMICILIO
   - Si es domicilio: pide dirección completa, colonia y referencias
   - Si es en sucursal: pregunta en qué sucursal quiere recoger
2. RESERVACIONES: Recopila nombre, fecha, hora, número de personas y sucursal.
3. CONSULTAR MENÚ: Describe platillos, precios e ingredientes SOLO si el cliente pregunta.
4. SOPORTE: Atiende quejas con empatía. Si es grave, escala a gerente.

Horario: ${restaurante.horario}

SERVICIO A DOMICILIO:
- Envío GRATIS a cualquier dirección
- Tiempo estimado: 40 minutos
- Sin restricciones de zona

MENÚ COMPLETO:
${menuTexto}

SUCURSALES:
${sucursalesTexto}

POLÍTICAS:
- Reservaciones: ${restaurante.politicas.reservaciones}
- Cancelaciones: ${restaurante.politicas.cancelaciones}
- Tiempo de espera en sucursal: ${restaurante.politicas.tiempo_espera_pedido}

REGLAS ESTRICTAS:
- NUNCA inventes platillos, precios o sucursales que no estén en la lista
- NUNCA sugieras otros productos si el cliente ya eligió lo que quiere
- Si el cliente pide algo que NO está en el menú, dile amablemente que no lo tenemos
- Al confirmar un pedido, repite EXACTAMENTE lo que pidió el cliente
- Para pedidos a DOMICILIO:
  {"accion":"REGISTRAR_PEDIDO","pedido":{"items":[{"nombre":"...","precio":0,"cantidad":0}],"tipo":"domicilio","direccion":"...","colonia":"...","referencias":"...","sucursal":"..."}}
- Para pedidos en SUCURSAL:
  {"accion":"REGISTRAR_PEDIDO","pedido":{"items":[{"nombre":"...","precio":0,"cantidad":0}],"tipo":"sucursal","sucursal":"..."}}
- Al confirmar reservación: {"accion":"REGISTRAR_RESERVACION","reservacion":{...}}
- Al escalar: {"accion":"ESCALAR_HUMANO","motivo":"..."}
- Si es consulta normal, responde solo con texto sin JSON`;
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
      temperature: 0.1, // Muy bajo para respuestas precisas
    });

    const textoRespuesta = response.choices[0].message.content;
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
    const jsonMatch = texto.match(/\{[\s\S]*"accion"[\s\S]*\}/);
    if (!jsonMatch) return null;
    const datos = JSON.parse(jsonMatch[0]);
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
  } catch { return null; }
}

function generarConfirmacionPedido(pedido) {
  if (!pedido || !pedido.items) return "¡Tu pedido ha sido registrado! En breve te confirmamos.";

  const lista = pedido.items.map(i => `• ${i.cantidad}x ${i.nombre} - $${i.precio * i.cantidad}`).join("\n");
  const total = pedido.items.reduce((sum, i) => sum + i.precio * i.cantidad, 0);

  if (pedido.tipo === "domicilio") {
    return `✅ ¡Pedido a domicilio confirmado!\n\n${lista}\n\nTotal: $${total} MXN\n🚚 Envío: GRATIS\n⏱ Tiempo estimado: 40 minutos\n📍 Dirección: ${pedido.direccion || ""}, ${pedido.colonia || ""}\n📝 Referencias: ${pedido.referencias || "Sin referencias"}\n\n¡Gracias! 🍣`;
  }

  return `✅ ¡Pedido confirmado para recoger!\n\n${lista}\n\nTotal: $${total} MXN\n⏱ Tiempo: ${restaurante.politicas.tiempo_espera_pedido}\n📍 Sucursal: ${pedido.sucursal || "Por confirmar"}\n\n¡Te esperamos! 🍣`;
}

function generarConfirmacionReservacion(res) {
  if (!res) return "¡Tu reservación ha sido registrada!";
  return `✅ ¡Reservación confirmada!\n\n👤 ${res.nombre}\n📅 ${res.fecha} a las ${res.hora}\n👥 ${res.personas} personas\n📍 ${res.sucursal}\n\n${restaurante.politicas.cancelaciones}\n\n¡Te esperamos! 🎌`;
}

module.exports = { procesarMensaje };
