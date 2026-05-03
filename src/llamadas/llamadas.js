// src/llamadas/llamadas.js
// Usa Gather con speech — conversación natural sin bip
const express = require("express");
const router = express.Router();
const NodeCache = require("node-cache");
const { procesarMensaje } = require("../agent/agente");
const logger = require("../utils/logger");

const conversaciones = new NodeCache({ stdTTL: 86400 });

function getTwilio() { return require("twilio"); }

function limpiarTexto(texto) {
  return texto
    .replace(/[*_~`#]/g, "")
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/✅|❌|⏳|🔔|📞|💬|🍣|🎌|🚚|📍|📝|👤|📅|👥/g, "")
    .replace(/\n+/g, ". ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 400);
}

function textoASSML(texto, velocidad = "medium") {
  return `<speak><prosody rate="${velocidad}">${limpiarTexto(texto)}</prosody></speak>`;
}

// ── LLAMADA ENTRANTE ──
router.post("/llamada/entrante", (req, res) => {
  const telefono = req.body.From || "desconocido";
  logger.info(`Llamada entrante de: ${telefono}`);

  const twilio = getTwilio();
  const twiml = new twilio.twiml.VoiceResponse();

  const gather = twiml.gather({
    input: "speech",
    action: `${process.env.BASE_URL}/llamada/respuesta`,
    method: "POST",
    language: "es-MX",
    speechTimeout: "auto",
    speechModel: "phone_call",
    enhanced: true,
  });

  gather.say(
    { language: "es-MX", voice: "Polly.Mia-Neural" },
    textoASSML("Bienvenido a Mr. Sushi, ¿en qué te puedo ayudar?", "medium")
  );

  twiml.say({ language: "es-MX", voice: "Polly.Mia-Neural" },
    textoASSML("No escuché nada. Hasta luego.", "medium"));
  twiml.hangup();

  res.type("text/xml").send(twiml.toString());
});

// ── PROCESAR LO QUE DIJO EL CLIENTE ──
router.post("/llamada/respuesta", async (req, res) => {
  const telefono = req.body.From || "desconocido";
  const textoCliente = req.body.SpeechResult || "";
  const confianza = req.body.Confidence || 0;

  logger.info(`[${telefono}] Escuché: "${textoCliente}" (confianza: ${confianza})`);

  const twilio = getTwilio();
  const twiml = new twilio.twiml.VoiceResponse();

  if (!textoCliente || textoCliente.trim() === "") {
    const gather = twiml.gather({
      input: "speech",
      action: `${process.env.BASE_URL}/llamada/respuesta`,
      method: "POST",
      language: "es-MX",
      speechTimeout: "auto",
      speechModel: "phone_call",
      enhanced: true,
    });
    gather.say(
      { language: "es-MX", voice: "Polly.Mia-Neural" },
      textoASSML("No te escuché bien. ¿Me puedes repetir?", "medium")
    );
    return res.type("text/xml").send(twiml.toString());
  }

  try {
    const historial = conversaciones.get(telefono) || [];
    const resultado = await procesarMensaje(historial, textoCliente);
    conversaciones.set(telefono, resultado.historialActualizado);

    const textoRespuesta = limpiarTexto(resultado.texto);
    logger.info(`Respuesta: "${textoRespuesta}"`);

    // Responder y escuchar de nuevo — conversación natural
    const gather = twiml.gather({
      input: "speech",
      action: `${process.env.BASE_URL}/llamada/respuesta`,
      method: "POST",
      language: "es-MX",
      speechTimeout: "auto",
      speechModel: "phone_call",
      enhanced: true,
    });

    gather.say(
      { language: "es-MX", voice: "Polly.Mia-Neural" },
      `<speak><prosody rate="medium">${textoRespuesta}</prosody></speak>`
    );

    twiml.say({ language: "es-MX", voice: "Polly.Mia-Neural" },
      textoASSML("Gracias por llamar a Mr. Sushi. Hasta pronto.", "medium"));
    twiml.hangup();

  } catch (error) {
    logger.error("Error: " + error.message);
    twiml.say({ language: "es-MX", voice: "Polly.Mia-Neural" },
      textoASSML("Tuvimos un problema. Por favor llama de nuevo.", "medium"));
    twiml.hangup();
  }

  res.type("text/xml").send(twiml.toString());
});

module.exports = router;
