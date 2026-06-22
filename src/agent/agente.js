// src/agent/agente.js
const restaurante = require("../../config/restaurante");
const logger = require("../utils/logger");

function getGroq() {
  const Groq = require("groq-sdk");
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

// ── MENU ──────────────────────────────────────────────────────────────────────
// Menu resumido para el prompt base (ahorra ~600 tokens)
function menuResumido() {
  return Object.entries(restaurante.menu)
    .map(([cat, items]) => {
      const precios = items.map(i => i.precio);
      const min = Math.min(...precios);
      const max = Math.max(...precios);
      return `[${cat}] ${items.length} opciones $${min}-$${max}`;
    }).join("\n");
}

// Menu completo de una categoria especifica (se manda solo si el cliente pregunta)
function menuCategoria(nombreCategoria) {
  const cat = Object.entries(restaurante.menu).find(([k]) =>
    k.toLowerCase().includes(nombreCategoria.toLowerCase())
  );
  if (!cat) return null;
  return cat[1].map(i => `${i.nombre} $${i.precio}`).join("\n");
}

// Detectar si el cliente pregunta por una categoria especifica
function detectarCategoriaPreguntada(mensaje) {
  const texto = mensaje.toLowerCase();
  return Object.keys(restaurante.menu).find(cat =>
    texto.includes(cat.toLowerCase()) ||
    texto.includes(cat.toLowerCase().replace(" ", ""))
  ) || null;
}

// ── ZONA DOMICILIO ────────────────────────────────────────────────────────────
function detectarSucursalPorZona(texto) {
  if (!texto) return null;
  const t = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const zona of (restaurante.zonas_domicilio || [])) {
    for (const keyword of zona.keywords) {
      const kw = keyword.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (t.includes(kw)) {
        logger.info(`Zona: "${keyword}" -> ${zona.sucursal}`);
        return zona.sucursal;
      }
    }
  }
  return null;
}

function detectarSucursalMencionada(mensaje) {
  const texto = mensaje.toLowerCase();
  return restaurante.sucursales.find(s => texto.includes(s.nombre.toLowerCase()));
}

function listaSucursalesCorta() {
  return restaurante.sucursales.map(s => s.nombre).join(", ");
}

// ── SYSTEM PROMPT OPTIMIZADO ──────────────────────────────────────────────────
function buildSystemPrompt(sucursalRelevante, zonaSugerida, categoriaDetectada) {
  // Bloque de horario solo si hay sucursal relevante
  let bloqueHorario = "";
  if (sucursalRelevante) {
    const horario = sucursalRelevante.horario_propio || restaurante.horario_general;
    const h = Object.entries(horario).map(([d,v]) => `${d.slice(0,3)} ${v.abre}-${v.cierra}`).join(", ");
    bloqueHorario = `\nHORARIO ${sucursalRelevante.nombre}: ${h}`;
  }

  // Bloque de zona detectada
  const bloqueZona = zonaSugerida
    ? `\n[ZONA]: Direccion del cliente corresponde a "${zonaSugerida}". Sugiere esta sucursal.`
    : "";

  // Menu: resumido por default, completo si pregunta categoria especifica
  const bloqueMenu = categoriaDetectada
    ? `MENU COMPLETO [${categoriaDetectada}]:\n${menuCategoria(categoriaDetectada)}\n\nOTRAS CATEGORIAS (resumido):\n${menuResumido()}`
    : `MENU (resumido — si cliente pide detalles de categoria, listalos todos):\n${menuResumido()}`;

  const listaSucursales = listaSucursalesCorta();

  return `Eres el asistente de Mr. Sushi. Responde breve y natural. NUNCA muestres etiquetas al cliente.

FLUJO PEDIDO:
A) Cliente pide productos -> confirma con precios y pregunta: "recoger en sucursal o domicilio?"
B1) Sucursal -> pregunta cual (si no la dijo)
B2) Domicilio -> pide direccion completa
C) Con direccion -> sugiere sucursal cercana: "La mas cercana es [X]. Te enviamos desde ahi o prefieres otra?"
D) Cliente confirma sucursal -> genera [PEDIDO] con todos los datos
CRITICO: NO generes [PEDIDO] hasta tener: productos + tipo + sucursal + direccion (si domicilio)
${bloqueZona}

ETIQUETAS (invisibles al cliente, solo al final):
Sucursal:[PEDIDO]{"accion":"REGISTRAR_PEDIDO","pedido":{"items":[{"nombre":"...","precio":0,"cantidad":1}],"tipo":"sucursal","sucursal":"..."}}[/PEDIDO]
Domicilio:[PEDIDO]{"accion":"REGISTRAR_PEDIDO","pedido":{"items":[{"nombre":"...","precio":0,"cantidad":1}],"tipo":"domicilio","direccion":"...","colonia":"...","referencias":"...","sucursal":"SUCURSAL_ASIGNADA"}}[/PEDIDO]
Reservacion:[RESERVACION]{"accion":"REGISTRAR_RESERVACION","reservacion":{"nombre":"...","fecha":"...","hora":"...","personas":0,"sucursal":"..."}}[/RESERVACION]
Escalar:[ESCALAR]{"accion":"ESCALAR_HUMANO","motivo":"..."}[/ESCALAR]

DOMICILIO: Gratis | 40 min | Sin restricciones
SUCURSALES: ${listaSucursales}
${bloqueHorario}

${bloqueMenu}

POLITICAS: Reservaciones min 2hrs antes, max 20 personas. Cancelacion sin cargo hasta 1hr antes. Espera 30-40 min.
FACTURACION: "Para factura llama al 56 1109 7461 con RFC, Razon Social, CP fiscal y Regimen Fiscal."`;
}

function limitarHistorial(historial, maxTurnos = 4) {
  const max = maxTurnos * 2;
  return historial.length <= max ? historial : historial.slice(-max);
}

async function procesarMensaje(historial, mensajeNuevo) {
  try {
    const groq = getGroq();
    const historialLimitado = limitarHistorial(historial);
    const textoReciente = [mensajeNuevo, ...historialLimitado.slice(-2).map(m => m.content)].join(" ");

    const sucursalRelevante = detectarSucursalMencionada(textoReciente);
    const zonaSugerida = detectarSucursalPorZona(textoReciente);
    const categoriaDetectada = detectarCategoriaPreguntada(mensajeNuevo);

    const response = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: buildSystemPrompt(sucursalRelevante, zonaSugerida, categoriaDetectada) },
        ...historialLimitado.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
        { role: "user", content: mensajeNuevo },
      ],
      max_tokens: 600,  // reducido de 1200 — respuestas mas cortas = mas rapido
      temperature: 0.1,
    });

    let textoRespuesta = response.choices[0].message.content;
    const accion = detectarAccion(textoRespuesta);
    let textoLimpio = textoRespuesta
      .replace(/\[PEDIDO\][\s\S]*?\[\/PEDIDO\]/gi, "")
      .replace(/\[RESERVACION\][\s\S]*?\[\/RESERVACION\]/gi, "")
      .replace(/\[ESCALAR\][\s\S]*?\[\/ESCALAR\]/gi, "")
      .replace(/\[ZONA\][\s\S]*?\n/gi, "")
      .trim();

    if (!textoLimpio || textoLimpio.length < 3 || /^sucursal:?$/i.test(textoLimpio)) {
      textoLimpio = "Me puedes confirmar tu pedido? Quiero asegurarme de registrarlo bien.";
    }

    return {
      texto: textoLimpio,
      accion: accion?.tipo || null,
      datos: accion?.datos || null,
      sucursalSugerida: zonaSugerida || null,
      itemsPedido: accion?.datos?.pedido?.items || null,
      direccionCliente: accion?.datos?.pedido?.direccion || null,
      coloniaCliente: accion?.datos?.pedido?.colonia || null,
      referenciasCliente: accion?.datos?.pedido?.referencias || null,
      historialActualizado: [...historial, { role:"user", content:mensajeNuevo }, { role:"assistant", content:textoRespuesta }],
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

module.exports = { procesarMensaje, detectarSucursalPorZona };
