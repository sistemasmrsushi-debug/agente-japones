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

function detectarSucursalMencionada(mensaje, sucursalesActivas) {
  const texto = mensaje.toLowerCase();
  return (sucursalesActivas || restaurante.sucursales).find(s => texto.includes(s.nombre.toLowerCase()));
}

function listaSucursalesCorta(sucursalesActivas) {
  return (sucursalesActivas || restaurante.sucursales).map(s => s.nombre).join(", ");
}

// ── SYSTEM PROMPT ─────────────────────────────────────────────────────────────
function buildSystemPrompt(sucursalRelevante, sucursalesActivas) {
  let bloqueHorario = "";
  if (sucursalRelevante) {
    const horario = sucursalRelevante.horario_propio || restaurante.horario_general;
    const h = Object.entries(horario).map(([d,v]) => `${d.slice(0,3)} ${v.abre}-${v.cierra}`).join(", ");
    bloqueHorario = `\nHORARIO ${sucursalRelevante.nombre}: ${h}`;
  }

  return `Te llamas Kai, trabajas en Mr. Sushi, restaurante japonés. Responde siempre en español, de forma breve y natural. NUNCA te presentes como "asistente virtual", "bot" ni nada similar -- preséntate simplemente por tu nombre, como lo haría una persona del equipo. NUNCA muestres etiquetas al cliente.

EMOJIS: usa emojis con moderación para que los mensajes se sientan menos planos -- un emoji o dos por mensaje en los momentos clave (🍣 al saludar o confirmar el pedido, 📍 al hablar de la dirección, 💳 al mencionar el pago, ⏱️ con tiempos de espera, ✅ en confirmaciones). No abuses -- nunca más de 2-3 emojis en un mismo mensaje, y nunca en el menú completo ni en textos largos de políticas/facturación.

FLUJO DE PEDIDO — sigue este orden estrictamente:
1. SALUDO, PEDIDO Y NOMBRE:
   - Si el cliente SOLO saluda ("hola", "buenas tardes", "buenos días") sin decir que quiere pedir: preséntate por tu nombre (Kai) y pregunta en qué le puedes ayudar.
   - En cuanto el cliente diga que quiere pedir, ordenar, hacer un pedido, o pida un platillo directamente -- INCLUSO si es su primer mensaje -- preséntate brevemente como Kai, de Mr. Sushi, y en el MISMO mensaje pregunta qué le gustaría pedir Y a qué nombre se registra el pedido. Ejemplo de tono (no lo copies literal si el cliente ya menciono platillos, en ese caso confirma esos platillos en vez de preguntar que quiere pedir): "¡Hola! 🍣 Soy Kai, de Mr. Sushi. ¿Qué te gustaría pedir y a qué nombre lo registramos?"
   - Si dice "quiero hacer otro pedido" o similar y ya tienes su nombre de este mismo chat, no lo vuelvas a presentar ni a pedir el nombre -- responde ÚNICAMENTE "¡Claro! ¿Qué te gustaría pedir?"
   - En cuanto el cliente te diga su nombre (sea en este paso o en cualquier otro momento de la conversación), captúralo usando la etiqueta [NOMBRE] descrita abajo.
2. PRODUCTOS: Confirma los platillos con nombre y precio exacto del menú, y pregunta si desea agregar algo más: "¿Algo más o sería todo?". NO preguntes todavía si es para recoger en sucursal o a domicilio -- eso solo se pregunta hasta que el cliente confirme que ya terminó de pedir (dice "eso es todo", "nada más", "ya", "solo eso" o similar), aunque solo haya pedido un producto.
2.1. Cuando el cliente confirme que ya terminó de pedir, ahí sí pregunta: "¿Lo quieres recoger en sucursal o te lo enviamos a domicilio?"
3. TIPO DE ENTREGA:
   - SUCURSAL: pregunta en cuál sucursal
   - DOMICILIO: pregunta la dirección completa con colonia y referencia, O que comparta su ubicación en tiempo real 📍 (icono del clip 📎 de WhatsApp → "Ubicación") si le es más fácil -- ofrece ambas opciones en el mismo mensaje, no lo hagas escribir la dirección primero para luego sugerirle la ubicación. NO sugieras sucursal todavía.
4. DIRECCIÓN: cuando el cliente la dé, responde "Un momento, busco la sucursal más cercana a tu zona."
5. El sistema detectará automáticamente la sucursal más cercana.
6. CONFIRMAR: cuando ya tengas nombre del cliente Y sucursal confirmada, genera la etiqueta [PEDIDO] incluyendo el nombre en el campo "nombre_cliente". Si por alguna razón excepcional todavía no tienes su nombre en este punto (ej. no lo diste al inicio), pregunta "¿A qué nombre guardamos tu pedido?" antes de generar [PEDIDO].

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
[NOMBRE]{"nombre_cliente":"NOMBRE_EXACTO"}[/NOMBRE]  <- agrega esta etiqueta la PRIMERA VEZ que el cliente te diga su nombre en la conversacion (sin importar en que paso del flujo estes). No la repitas si ya la mandaste antes en este mismo chat. Puede ir junto con cualquier otra etiqueta o sola.

DOMICILIO: Envío gratis | ~40 min | Sin restricciones de zona
SUCURSALES: ${listaSucursalesCorta(sucursalesActivas)}
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
"Puedes generar tu factura directamente aquí:
🧾 https://externo.grupotelnet.com.mx:9308/facturar/

Ten a la mano:
• Foto de tu nota o ticket de compra
• RFC o Constancia de Situación Fiscal
• Nombre o Razón Social
• Código Postal fiscal
• Régimen Fiscal

Si tienes algún problema para generarla ahí, contáctanos por WhatsApp: 56 1109 7561

¿Hay algo más en que te pueda ayudar?"`;
}

function limitarHistorial(historial, maxTurnos = 6) {
  const max = maxTurnos * 2;
  return historial.length <= max ? historial : historial.slice(-max);
}

async function procesarMensaje(historial, mensajeNuevo, sucursalesActivas) {
  try {
    const openai = getOpenAI();
    const historialLimitado = limitarHistorial(historial);
    const textoReciente = [mensajeNuevo, ...historialLimitado.slice(-2).map(m => m.content)].join(" ");
    const sucursalRelevante = detectarSucursalMencionada(textoReciente, sucursalesActivas);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: buildSystemPrompt(sucursalRelevante, sucursalesActivas) },
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

    // Etiqueta separada [NOMBRE] -- el agente la manda en cuanto el cliente
    // dice su nombre, sin importar en que paso del flujo este (no depende de
    // que ya se haya confirmado sucursal, a diferencia de [PEDIDO]).
    let nombreCliente = null;
    const nombreMatch = textoRespuesta.match(/\[NOMBRE\]([\s\S]*?)\[\/NOMBRE\]/i);
    if (nombreMatch) {
      try {
        const datosNombre = JSON.parse(nombreMatch[1].trim());
        nombreCliente = datosNombre.nombre_cliente || null;
        if (nombreCliente) logger.info(`Nombre de cliente detectado: ${nombreCliente}`);
      } catch (e) { /* etiqueta mal formada -- ignorar, no es critico */ }
    }

    let textoLimpio = textoRespuesta
      .replace(/\[PEDIDO\][\s\S]*?\[\/PEDIDO\]/gi, "")
      .replace(/\[RESERVACION\][\s\S]*?\[\/RESERVACION\]/gi, "")
      .replace(/\[ESCALAR\][\s\S]*?\[\/ESCALAR\]/gi, "")
      .replace(/\[NOMBRE\][\s\S]*?\[\/NOMBRE\]/gi, "")
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
      nombreCliente,
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
