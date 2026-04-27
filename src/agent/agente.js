// src/agent/agente.js
// =============================================
// CEREBRO DEL AGENTE IA — Groq (gratis)
// Inicialización lazy (no falla si falta la key al arrancar)
// =============================================

const restaurante = require("../../config/restaurante");
const logger = require("../utils/logger");

// Inicialización lazy — solo cuando se necesita
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

  return `Eres el asistente virtual de ${restaurante.nombre}, un restaurante japonés con 30 sucursales en CDMX y Estado de México.

Tu personalidad:
- Amable, profesional y eficiente
- Conoces perfectamente el menú y las sucursales
- Hablas en español mexicano natural (no robótico)

Tus capacidades:
1. TOMAR PEDIDOS: Ayuda al cliente a armar su pedido, confirma artículos y precios, solicita sucursal.
2. RESERVACIONES: Recopila nombre, fecha, hora, número de personas y sucursal.
3. CONSULTAR MENÚ: Describe platillos, precios e ingredientes.
4. SOPORTE: Atiende quejas con empatía. Si es grave, avisa que un gerente contactará en 30 minutos.

Horario: ${restaurante.horario}

MENÚ COMPLETO:
${menuTexto}

SUCURSALES:
${sucursalesTexto}

POLÍTICAS:
- Reservaciones: ${restaurante.politicas.reservaciones}
- Cancelaciones: ${restaurante.politicas.cancelaciones}
- Tiempo de espera: ${restaurante.politicas.tiempo_espera_pedido}

REGLAS IMPORTANTES:
- Nunca inventes platillos, precios o sucursales que no estén en la lista.
- Al confirmar un pedido, repite los artículos y el total antes de registrarlo.
- Al finalizar un pedido responde con el JSON: {"accion":"REGISTRAR_PEDIDO","pedido":{...}}
- Al confirmar reservación responde con: {"accion":"REGISTRAR_RESERVACION","reservacion":{...}}
- Al escalar a humano responde con: {"accion":"ESCALAR_HUMANO","motivo":"..."}
- Si es consulta normal, responde solo con texto sin JSON.`;
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
      temperature: 0.7,
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
    logger.error("Error en agente Groq:", error.message);
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
  return `✅ ¡Pedido confirmado!\n\n${lista}\n\nTotal: $${total} MXN\nTiempo: ${restaurante.politicas.tiempo_espera_pedido}\nSucursal: ${pedido.sucursal || "Por confirmar"}\n\n¡Gracias! 🍣`;
}

function generarConfirmacionReservacion(res) {
  if (!res) return "¡Tu reservación ha sido registrada!";
  return `✅ ¡Reservación confirmada!\n\n👤 ${res.nombre}\n📅 ${res.fecha} a las ${res.hora}\n👥 ${res.personas} personas\n📍 ${res.sucursal}\n\n${restaurante.politicas.cancelaciones}\n\n¡Te esperamos! 🎌`;
}

module.exports = { procesarMensaje };
