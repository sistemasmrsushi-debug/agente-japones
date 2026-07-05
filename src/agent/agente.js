// src/agent/agente.js
const restaurante = require("../../config/restaurante");
const logger = require("../utils/logger");

function getOpenAI() {
  const OpenAI = require("openai");
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// ── INDICE DE PLATILLOS ───────────────────────────────────────────────────────
function buscarPlatillo(nombre) {
  const t = nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let resultado = null;
  for (const [cat, items] of Object.entries(restaurante.menu)) {
    for (const item of items) {
      const k = item.nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (k === t || k.includes(t) || t.includes(k)) {
        const match = { ...item, categoria: cat };
        if (cat === "Sushi 2x1") return match;
        if (!resultado) resultado = match;
      }
    }
  }
  return resultado;
}

function menuCompacto() {
  return Object.entries(restaurante.menu)
    .map(([cat, items]) => `[${cat}]: ${items.map(i => {
      const desc = i.descripcion ? " ("+i.descripcion+")" : "";
      return `${i.nombre} $${i.precio}${desc}`;
    }).join(" | ")}`)
    .join("\n");
}

// ── ZONA DOMICILIO ────────────────────────────────────────────────────────────
function detectarSucursalPorZona(texto) {
  if (!texto) return null;
  const t = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let mejorMatch = null;
  let mejorLongitud = 0;
  for (const zona of (restaurante.zonas_domicilio || [])) {
    for (const keyword of zona.keywords) {
      const kw = keyword.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (t.includes(kw) && kw.length > mejorLongitud) {
        mejorMatch = zona.sucursal;
        mejorLongitud = kw.length;
      }
    }
  }
  if (mejorMatch) logger.info(`Zona detectada: "${mejorMatch}" (${mejorLongitud} chars)`);
  return mejorMatch;
}

function detectarSucursalMencionada(mensaje) {
  const texto = mensaje.toLowerCase();
  return restaurante.sucursales.find(s => texto.includes(s.nombre.toLowerCase()));
}

function listaSucursalesCorta() {
  return restaurante.sucursales.map(s => s.nombre).join(", ");
}

// ── SYSTEM PROMPT ─────────────────────────────────────────────────────────────
function buildSystemPrompt(sucursalRelevante) {
  let bloqueHorario = "";
  if (sucursalRelevante) {
    const horario = sucursalRelevante.horario_propio || restaurante.horario_general;
    const h = Object.entries(horario).map(([d,v]) => `${d.slice(0,3)} ${v.abre}-${v.cierra}`).join(", ");
    bloqueHorario = `\nHORARIO ${sucursalRelevante.nombre}: ${h}`;
  }

  return `Eres el asistente virtual de Mr. Sushi, restaurante japonés. Responde siempre en español, de forma breve y natural. NUNCA muestres etiquetas al cliente.

FLUJO DE PEDIDO — sigue este orden estrictamente:
1. SALUDO:
   - Si el cliente SOLO saluda ("hola", "buenas tardes", "buenos días"): preséntate con las opciones disponibles
   - Si el cliente menciona que quiere pedir, ordenar, hacer un pedido, o pide un platillo directamente: responde ÚNICAMENTE "¡Claro! ¿Qué te gustaría pedir?" sin dar bienvenida
   - Si dice "quiero hacer otro pedido" o similar: responde ÚNICAMENTE "¡Claro! ¿Qué te gustaría pedir?"
2. PRODUCTOS: Confirma los platillos con nombre y precio exacto del menú. Pregunta: "¿Lo quieres recoger en sucursal o te lo enviamos a domicilio?"
3. TIPO DE ENTREGA:
   - SUCURSAL: pregunta en cuál sucursal
   - DOMICILIO: pregunta la dirección completa con colonia y referencia. NO sugieras sucursal todavía.
4. DIRECCIÓN: cuando el cliente la dé, responde "Un momento, busco la sucursal más cercana a tu zona."
5. El sistema detectará automáticamente la sucursal más cercana.
6. NOMBRE: cuando ya se sepa la sucursal (elegida directo, o detectada por dirección y confirmada por el cliente), si todavía NO tienes el nombre del cliente en esta conversación, pregunta exactamente: "¿A qué nombre guardamos tu pedido?" y espera su respuesta. NO generes [PEDIDO] todavía en este paso.
7. CONFIRMAR: cuando ya tengas nombre del cliente Y sucursal confirmada, genera la etiqueta [PEDIDO] incluyendo el nombre en el campo "nombre_cliente".

REGLAS:
- NUNCA sugieras sucursal sin tener la dirección primero
- NUNCA inventes precios — usa exactamente los del menú
- NUNCA mezcles categorías del menú
- Si el cliente menciona algo que no está en el menú, díselo amablemente
- Entiende lenguaje informal, errores de tipeo y expresiones mexicanas
- Si el cliente confirma con "sí", "va", "dale", "esa mera", "órale", "sale" o similares, tómalo como confirmación
- Cuando el cliente pregunte por información de un platillo, SIEMPRE responde en este formato: "El [nombre] cuesta $[precio]. [descripción]". El precio está en el menú, NUNCA lo omitas.
- Si después de mostrar info de un platillo el cliente dice "sí", "lo quiero", "agrégalo", "ese" o similar, agrégalo al pedido y pregunta: "¿Quieres agregar algo más o con eso sería todo?"
- El cliente puede ir acumulando platillos — lleva el conteo de todo lo que ha pedido y muéstralo al confirmar
- Solo pregunta sucursal/domicilio cuando el cliente confirme que ya terminó de pedir
- MENU: Si el cliente pide ver el menú, responde con las categorías disponibles y pregunta cuál le interesa. Cuando elija una categoría, lista TODOS sus platillos con nombre y precio. Al final siempre agrega: "También puedes ver nuestro menú completo con fotos en: https://www.mrsushi.mx/pedir"
- Las categorías del menú son: Sushi 2x1, Combos, Sushi Box, Entradas, Hand Rolls, Sopas, Brochetas Kushiagues, Ensaladas, Arroz, Rollos Tradicionales, Rollos Especialidades, Bowls, Cocina Caliente, Postres, Bebidas

ETIQUETAS DEL SISTEMA (invisibles para el cliente, solo al final del mensaje):
[PEDIDO]{"accion":"REGISTRAR_PEDIDO","pedido":{"items":[{"nombre":"NOMBRE_EXACTO","precio":PRECIO_EXACTO,"cantidad":1}],"tipo":"sucursal|domicilio","direccion":"...","colonia":"...","referencias":"...","sucursal":"...","nombre_cliente":"..."}}[/PEDIDO]
[RESERVACION]{"accion":"REGISTRAR_RESERVACION","reservacion":{"nombre":"...","fecha":"...","hora":"...","personas":0,"sucursal":"..."}}[/RESERVACION]
[ESCALAR]{"accion":"ESCALAR_HUMANO","motivo":"..."}[/ESCALAR]

DOMICILIO: Envío gratis | ~40 min | Sin restricciones de zona
SUCURSALES: ${listaSucursalesCorta()}
${bloqueHorario}

MENÚ COMPLETO (precios exactos, no los modifiques):
${menuCompacto()}

PROMOCIONES ACTIVAS:
- BARRA LIBRE DE SUSHI (tambien conocida como "Noche de Elegidos"): $297 por persona. Miercoles a sabado de 18:00 a 22:30 hrs. Solo en restaurante/hibrido, NO aplica en Fast Food ni domicilio.
- COCTELERIA 2x1: Lunes a sabado 13:00-22:30 / Domingos 13:00-22:00. Solo en restaurante/hibrido.
- LUNCH BOX: $197. Lunes a jueves todo el dia. Elige 1 entrada + 1 arroz + 1 rollo + 1 agua. Aplica en restaurante y Fast Food.
- MR. 4x4: Elige 4 medios rollos. $217 todos los dias / $199 solo los martes. Aplica en restaurante y Fast Food.

POLÍTICAS: Reservaciones mínimo 2 horas antes, máximo 20 personas. Cancelación sin cargo hasta 1 hora antes.
FACTURACIÓN: Si el cliente pide factura responde exactamente esto:
"Para tu factura contáctanos por cualquiera de estos medios:
📞 Teléfono / WhatsApp: 56 1109 7561
📧 Correo: facturacion@mrsushi.mx

Para agilizar el proceso ten a la mano:
• Foto de tu nota o ticket de compra
• RFC o Constancia de Situación Fiscal
• Nombre o Razón Social
• Código Postal fiscal
• Régimen Fiscal

¿Hay algo más en que te pueda ayudar?"`;
}

function limitarHistorial(historial, maxTurnos = 6) {
  const max = maxTurnos * 2;
  return historial.length <= max ? historial : historial.slice(-max);
}

async function procesarMensaje(historial, mensajeNuevo) {
  try {
    const openai = getOpenAI();
    const historialLimitado = limitarHistorial(historial);
    const textoReciente = [mensajeNuevo, ...historialLimitado.slice(-2).map(m => m.content)].join(" ");
    const sucursalRelevante = detectarSucursalMencionada(textoReciente);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: buildSystemPrompt(sucursalRelevante) },
        ...historialLimitado.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
        { role: "user", content: mensajeNuevo },
      ],
      max_tokens: 800,
      temperature: 0.2,
    });

    let textoRespuesta = response.choices[0].message.content;
    const accion = detectarAccion(textoRespuesta);

    // Corregir precios usando el índice real del menú
    if (accion?.datos?.pedido?.items) {
      accion.datos.pedido.items = accion.datos.pedido.items.map(item => {
        const encontrado = buscarPlatillo(item.nombre);
        return encontrado
          ? { nombre: encontrado.nombre, precio: encontrado.precio, cantidad: item.cantidad || 1 }
          : item;
      });
    }

    let textoLimpio = textoRespuesta
      .replace(/\[PEDIDO\][\s\S]*?\[\/PEDIDO\]/gi, "")
      .replace(/\[RESERVACION\][\s\S]*?\[\/RESERVACION\]/gi, "")
      .replace(/\[ESCALAR\][\s\S]*?\[\/ESCALAR\]/gi, "")
      .trim();

    // Si el agente habla de un platillo pero no menciona precio, inyectarlo
    if (!accion && textoLimpio && !textoLimpio.includes("$")) {
      const platilloMencionado = buscarPlatillo(mensajeNuevo);
      if (platilloMencionado) {
        textoLimpio = textoLimpio.replace(
          platilloMencionado.nombre,
          `${platilloMencionado.nombre} ($${platilloMencionado.precio})`
        );
      }
    }

    if (!textoLimpio || textoLimpio.length < 3) {
      textoLimpio = "¿Podrías confirmarme tu pedido? Quiero asegurarme de registrarlo correctamente.";
    }

    return {
      texto: textoLimpio,
      accion: accion?.tipo || null,
      datos: accion?.datos || null,
      historialActualizado: [
        ...historial,
        { role: "user", content: mensajeNuevo },
        { role: "assistant", content: textoRespuesta }
      ],
    };
  } catch (error) {
    logger.error("Error agente: " + error.message);
    throw error;
  }
}

function detectarAccion(texto) {
  try {
    const m = texto.match(/\[(PEDIDO|RESERVACION|ESCALAR)\]([\s\S]*?)\[\/\1\]/i);
    if (!m) return null;
    const datos = JSON.parse(m[2].trim());
    logger.info(`Accion: ${datos.accion}`);
    return { tipo: datos.accion, datos };
  } catch(e) { return null; }
}

module.exports = { procesarMensaje, detectarSucursalPorZona, buscarPlatillo };
