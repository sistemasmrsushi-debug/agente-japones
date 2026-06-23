// src/agent/agente.js
const restaurante = require("../../config/restaurante");
const logger = require("../utils/logger");

function getGroq() {
  const Groq = require("groq-sdk");
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

// ── INDICE DE PLATILLOS ───────────────────────────────────────────────────────
// Busqueda exacta por nombre en el menu real — precios siempre correctos
function buscarPlatillo(nombre) {
  const t = nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [cat, items] of Object.entries(restaurante.menu)) {
    for (const item of items) {
      const k = item.nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (k === t || k.includes(t) || t.includes(k)) {
        return { ...item, categoria: cat };
      }
    }
  }
  return null;
}

// Construye menu compacto con precios reales para el prompt
function menuCompacto() {
  return Object.entries(restaurante.menu)
    .map(([cat, items]) => `[${cat}]: ${items.map(i => `${i.nombre} $${i.precio}`).join(" | ")}`)
    .join("\n");
}

// ── ZONA DOMICILIO ────────────────────────────────────────────────────────────
function detectarSucursalPorZona(texto) {
  if (!texto) return null;
  const t = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Buscar el match mas especifico (keyword mas larga gana)
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

  return `Eres el asistente de Mr. Sushi. Responde SIEMPRE en espanol, breve y natural. NUNCA muestres etiquetas al cliente.

FLUJO ESTRICTO — sigue este orden SIN saltarte pasos:
1. SALUDO: responde segun el contexto:
- Si el historial esta VACIO y el cliente solo saluda ("hola", "buenas"): da bienvenida completa con el menu de opciones
- Si el cliente dice "quiero hacer un pedido", "quiero pedir", "quiero otro pedido", o cualquier variacion: responde SOLO "Claro! Que te gustaria pedir?" sin dar bienvenida completa
- Si ya hay historial previo: NO repitas la bienvenida, responde directo a lo que pide
2. PRODUCTOS: cuando el cliente mencione platillos, confirma SOLO nombre y precio exacto del menu. Pregunta: "Lo quieres recoger en sucursal o te lo enviamos a domicilio?"
3. TIPO: 
   - Si dice SUCURSAL -> pregunta cual sucursal
   - Si dice DOMICILIO -> pregunta "Cual es tu direccion completa, colonia y referencia?" NO sugieras sucursal todavia.
4. DIRECCION: cuando el cliente de su direccion -> di "Un momento, busco la sucursal mas cercana a tu zona."
5. SUCURSAL: el sistema detectara la zona automaticamente.
6. CONFIRMAR: cuando cliente confirme sucursal -> genera etiqueta [PEDIDO] con datos completos.

REGLAS CRITICAS:
- NUNCA sugieras sucursal sin tener la direccion del cliente primero
- NUNCA inventes precios — usa EXACTAMENTE los precios del menu
- NUNCA mezcles categorias — cada platillo pertenece a UNA categoria
- Si el cliente menciona algo que no esta en el menu, dile que no lo tienes

ETIQUETAS (invisibles, solo al final del mensaje):
[PEDIDO]{"accion":"REGISTRAR_PEDIDO","pedido":{"items":[{"nombre":"NOMBRE_EXACTO_DEL_MENU","precio":PRECIO_EXACTO,"cantidad":1}],"tipo":"sucursal|domicilio","direccion":"...","colonia":"...","referencias":"...","sucursal":"..."}}[/PEDIDO]
[RESERVACION]{"accion":"REGISTRAR_RESERVACION","reservacion":{"nombre":"...","fecha":"...","hora":"...","personas":0,"sucursal":"..."}}[/RESERVACION]
[ESCALAR]{"accion":"ESCALAR_HUMANO","motivo":"..."}[/ESCALAR]

DOMICILIO: Gratis | 40 min | Sin restricciones de zona
SUCURSALES: ${listaSucursalesCorta()}
${bloqueHorario}

MENU COMPLETO (precios exactos, no los cambies):
${menuCompacto()}

POLITICAS: Reservaciones min 2hrs antes, max 20 personas. Cancelacion sin cargo hasta 1hr antes.
FACTURACION: "Para factura llama al 56 1109 7461 con RFC, Razon Social, CP fiscal y Regimen Fiscal."`;
}

function limitarHistorial(historial, maxTurnos = 5) {
  const max = maxTurnos * 2;
  return historial.length <= max ? historial : historial.slice(-max);
}

async function procesarMensaje(historial, mensajeNuevo) {
  try {
    const groq = getGroq();
    const historialLimitado = limitarHistorial(historial);
    const textoReciente = [mensajeNuevo, ...historialLimitado.slice(-2).map(m => m.content)].join(" ");
    const sucursalRelevante = detectarSucursalMencionada(textoReciente);

    const response = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: buildSystemPrompt(sucursalRelevante) },
        ...historialLimitado.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
        { role: "user", content: mensajeNuevo },
      ],
      max_tokens: 800,
      temperature: 0.1,
    });

    let textoRespuesta = response.choices[0].message.content;
    const accion = detectarAccion(textoRespuesta);

    // Corregir precios en la accion usando el indice real
    if (accion && accion.datos?.pedido?.items) {
      accion.datos.pedido.items = accion.datos.pedido.items.map(item => {
        const encontrado = buscarPlatillo(item.nombre);
        if (encontrado) {
          return { nombre: encontrado.nombre, precio: encontrado.precio, cantidad: item.cantidad || 1 };
        }
        return item;
      });
    }

    let textoLimpio = textoRespuesta
      .replace(/\[PEDIDO\][\s\S]*?\[\/PEDIDO\]/gi, "")
      .replace(/\[RESERVACION\][\s\S]*?\[\/RESERVACION\]/gi, "")
      .replace(/\[ESCALAR\][\s\S]*?\[\/ESCALAR\]/gi, "")
      .trim();

    if (!textoLimpio || textoLimpio.length < 3) {
      textoLimpio = "Podrias confirmarme tu pedido? Quiero asegurarme de registrarlo correctamente.";
    }

    return {
      texto: textoLimpio,
      accion: accion?.tipo || null,
      datos: accion?.datos || null,
      historialActualizado: [...historial,
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
