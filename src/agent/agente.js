// src/agent/agente.js
const restaurante = require("../../config/restaurante");
const logger = require("../utils/logger");

function getGroq() {
  const Groq = require("groq-sdk");
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

function getHorarioSucursal(sucursal) {
  const horario = sucursal.horario_propio || restaurante.horario_general;
  const dias = { lunes:"Lun", martes:"Mar", miercoles:"Mie", jueves:"Jue", viernes:"Vie", sabado:"Sab", domingo:"Dom" };
  return Object.entries(horario).map(([dia, h]) => `${dias[dia]}: ${h.abre}-${h.cierra}`).join(" | ");
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
      const lista = items.map(i => `${i.nombre} $${i.precio}`).join(" | ");
      return `[${categoria}] (${items.length}): ${lista}`;
    })
    .join("\n");
}

function promocionesTexto() {
  const promos = restaurante.promociones_generales || [];
  return promos.map(p => {
    if (p.nombre === "Barra Libre de Sushi") {
      return `BARRA LIBRE DE SUSHI $${p.precio}/persona | Mie-Sab 18:00-22:30 | Solo restaurante/hibrido, NO Fast Food ni delivery.`;
    }
    if (p.nombre === "Cocteleria 2x1" || p.nombre === "Coctelería 2x1") {
      return `COCTELERIA 2x1 Paga 1 lleva 2 | Lun-Sab 13:00-22:30 / Dom 13:00-22:00 | Solo restaurante/hibrido, NO Fast Food.`;
    }
    if (p.nombre === "Lunch Box") {
      const o = p.opciones;
      return `LUNCH BOX $${p.precio} | Lun-Jue todo el dia | Restaurante y Fast Food. Elige: 1 entrada (${o.entrada.join(" / ")}) + 1 arroz (${o.arroz.join(" / ")}) + 1 rollo (${o.rollo.join(" / ")}) + 1 agua (${o.agua.join(" / ")}). Solo 1 por categoria, extras se cobran aparte.`;
    }
    if (p.nombre === "Mr. 4x4") {
      return `MR. 4x4 Elige 4 medios rollos | $${p.precio_normal} todos los dias / $${p.precio_martes} solo los martes | Restaurante y Fast Food.`;
    }
    return `${p.nombre}: ${p.descripcion}`;
  }).join("\n");
}

// ============================================================
// DETECCION DE SUCURSAL MAS CERCANA POR ZONA
// ============================================================
function detectarSucursalPorZona(texto) {
  if (!texto) return null;
  const t = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const zonas = restaurante.zonas_domicilio || [];
  for (const zona of zonas) {
    for (const keyword of zona.keywords) {
      const kw = keyword.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (t.includes(kw)) {
        logger.info(`Zona detectada: "${keyword}" -> Sucursal: ${zona.sucursal}`);
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

function buildSystemPrompt(sucursalRelevante, zonaSugerida) {
  let bloqueHorario = "";
  if (sucursalRelevante) {
    const promos = getPromocionesSucursal(sucursalRelevante);
    const promosTexto = promos.length > 0
      ? promos.map(p => `${p.nombre} (${(p.dias||[]).join(",")} ${p.hora_inicio||""}-${p.hora_fin||""})`).join(", ")
      : "ninguna activa";
    bloqueHorario = `\nHORARIO Y PROMOS DE "${sucursalRelevante.nombre}": ${getHorarioSucursal(sucursalRelevante)} | Promos: ${promosTexto}`;
  } else {
    bloqueHorario = `\nHorario general: ${Object.entries(restaurante.horario_general).map(([d,h])=>`${d.slice(0,3)} ${h.abre}-${h.cierra}`).join(", ")}.`;
  }

  const bloqueZona = zonaSugerida
    ? `\n[ZONA DETECTADA]: La direccion del cliente corresponde a la zona de "${zonaSugerida}". En el Paso C sugiere esta sucursal.`
    : "";

  const listaSucursales = restaurante.sucursales.map(s => s.nombre).join(", ");

  return `Eres el asistente virtual de Mr. Sushi, restaurante japones. Responde breve, directo, y SIEMPRE en texto natural completo. NUNCA muestres etiquetas como [PEDIDO] al cliente — son solo para el sistema interno.

REGLAS:
1. Lee TODA la conversacion. Si el cliente ya respondio algo, NO lo preguntes de nuevo.
2. "sucursales" = lugares fisicos. "menu/platillos/rollos" = comida. No mezcles.
3. El menu esta dividido en categorias entre corchetes [Categoria]. Cada platillo SOLO pertenece a su categoria.
4. Al listar una categoria completa, enumera TODOS sus platillos salvo que pidan "ejemplos".

FLUJO DE PEDIDO — pasos EXACTOS en orden, NO te saltes ninguno:
Paso A: Cliente menciona productos -> confirmas que pidio con precios y preguntas: "Lo quieres recoger en sucursal o te lo enviamos a domicilio?" NO generes [PEDIDO] aqui.
Paso B1: Si dice "sucursal" o "recoger" -> preguntas: "En cual sucursal?" (si no la dijo ya). NO generes [PEDIDO] aqui.
Paso B2: Si dice "domicilio" (con o sin direccion en el mismo mensaje):
  - Si el mensaje YA incluye calle, colonia, municipio o CP -> salta directo al Paso C DOMICILIO con esa direccion.
  - Si NO incluye direccion -> preguntas: "Cual es tu direccion completa, colonia y alguna referencia?" NO generes [PEDIDO] aqui.
Paso C DOMICILIO: SOLO cuando el cliente ya dio su direccion completa:
  - Si hay ZONA DETECTADA -> dices: "La sucursal mas cercana a tu zona es [SUCURSAL]. Te enviamos desde ahi o prefieres otra?" NO generes [PEDIDO] todavia.
  - Si NO hay zona -> preguntas: "Cual sucursal prefieres que te envie? Tenemos: ${listaSucursales}" NO generes [PEDIDO] todavia.
  - SOLO cuando el cliente confirma la sucursal -> generas confirmacion final + etiqueta [PEDIDO] OCULTA.
Paso C SUCURSAL: SOLO cuando el cliente confirma la sucursal -> confirmacion final + etiqueta [PEDIDO] OCULTA.
REGLA CRITICA: El [PEDIDO] SOLO se genera cuando tienes: productos + tipo (sucursal/domicilio) + sucursal confirmada + direccion (si es domicilio). Si falta cualquiera de estos datos, NO generes [PEDIDO].

CRITICO: Las etiquetas [PEDIDO], [RESERVACION], [ESCALAR] son INVISIBLES para el cliente. NUNCA las escribas en el texto visible. Van solo al final del mensaje como datos del sistema.
${bloqueZona}

ETIQUETAS DEL SISTEMA (invisibles, solo al final):
[PEDIDO]{"accion":"REGISTRAR_PEDIDO","pedido":{"items":[{"nombre":"...","precio":0,"cantidad":1}],"tipo":"sucursal","sucursal":"..."}}[/PEDIDO]
[PEDIDO]{"accion":"REGISTRAR_PEDIDO","pedido":{"items":[{"nombre":"...","precio":0,"cantidad":1}],"tipo":"domicilio","direccion":"...","colonia":"...","referencias":"...","sucursal":"NOMBRE_SUCURSAL_ASIGNADA"}}[/PEDIDO]
[RESERVACION]{"accion":"REGISTRAR_RESERVACION","reservacion":{"nombre":"...","fecha":"...","hora":"...","personas":0,"sucursal":"..."}}[/RESERVACION]
[ESCALAR]{"accion":"ESCALAR_HUMANO","motivo":"..."}[/ESCALAR]

DOMICILIO: Envio GRATIS | 40 min | Sin restricciones de zona

SUCURSALES: ${listaSucursalesCorta()}
${bloqueHorario}

PROMOCIONES ACTIVAS 2026 (solo si el cliente pregunta):
${promocionesTexto()}

MENU (cada categoria es exclusiva, no mezclar):
${menuCompacto()}

POLITICAS: ${restaurante.politicas.reservaciones} ${restaurante.politicas.cancelaciones} Tiempo espera: ${restaurante.politicas.tiempo_espera_pedido}

FACTURACION: Si piden factura responde: "Para tu factura llamanos al 56 1109 7461 y ten a la mano: RFC o Constancia de Situacion Fiscal, Nombre o Razon Social, Codigo Postal fiscal y Regimen Fiscal."`;
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
    const zonaSugerida = detectarSucursalPorZona(textoReciente);

    const response = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: buildSystemPrompt(sucursalRelevante, zonaSugerida) },
        ...historialLimitado.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
        { role: "user", content: mensajeNuevo },
      ],
      max_tokens: 1200,
      temperature: 0.1,
    });

    let textoRespuesta = response.choices[0].message.content;
    const accion = detectarAccion(textoRespuesta);

    // Limpiar TODAS las etiquetas del sistema antes de enviar al cliente
    let textoLimpio = textoRespuesta
      .replace(/\[PEDIDO\][\s\S]*?\[\/PEDIDO\]/gi, "")
      .replace(/\[RESERVACION\][\s\S]*?\[\/RESERVACION\]/gi, "")
      .replace(/\[ESCALAR\][\s\S]*?\[\/ESCALAR\]/gi, "")
      .replace(/\[ZONA DETECTADA\][\s\S]*?\n/gi, "")
      .trim();

    if (!textoLimpio || textoLimpio.length < 3 || /^sucursal:?$/i.test(textoLimpio)) {
      logger.warn(`Respuesta invalida, usando fallback. Original: "${textoRespuesta}"`);
      textoLimpio = "Me puedes confirmar de nuevo tu pedido? Quiero asegurarme de registrarlo correctamente.";
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
    const m = texto.match(/\[(PEDIDO|RESERVACION|ESCALAR)\]([\s\S]*?)\[\/\1\]/i);
    if (!m) return null;
    const datos = JSON.parse(m[2].trim());
    logger.info(`Accion: ${datos.accion}`);
    return { tipo: datos.accion, datos };
  } catch(e) { return null; }
}

module.exports = { procesarMensaje, detectarSucursalPorZona };
