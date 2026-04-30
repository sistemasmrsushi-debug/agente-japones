// src/llamadas/llamadas.js
// Usa Twilio Transcription (más rápido que Deepgram para llamadas)
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

  twiml.say(
    { language: "es-MX", voice: "Polly.Mia-Neural" },
    textoASSML("Bienvenido a Mr. Sushi, ¿en qué te puedo ayudar?", "medium")
  );

  twiml.record({
    action: `${process.env.BASE_URL}/llamada/respuesta`,
    method: "POST",
    maxLength: 15,
    playBeep: true,
    transcribe: true,
    transcribeCallback: `${process.env.BASE_URL}/llamada/transcripcion`,
    timeout: 3,
    language: "es-MX",
  });

  twiml.say({ language: "es-MX", voice: "Polly.Mia-Neural" },
    textoASSML("No escuché nada. Hasta luego.", "medium"));
  twiml.hangup();

  res.type("text/xml").send(twiml.toString());
});

// ── RECIBE GRABACIÓN (responde rápido mientras espera transcripción) ──
router.post("/llamada/respuesta", (req, res) => {
  const telefono = req.body.From || "desconocido";
  logger.info(`Grabación recibida de ${telefono}, esperando transcripción...`);

  const twilio = getTwilio();
  const twiml = new twilio.twiml.VoiceResponse();

  // Música de espera breve mientras procesa
  twiml.pause({ length: 1 });

  res.type("text/xml").send(twiml.toString());
});

// ── RECIBE TRANSCRIPCIÓN DE TWILIO Y PROCESA CON IA ──
router.post("/llamada/transcripcion", async (req, res) => {
  res.sendStatus(200);

  const telefono = req.body.From || req.body.Called || "desconocido";
  const callSid = req.body.CallSid;
  const textoCliente = req.body.TranscriptionText || "";

  logger.info(`Transcripción Twilio [${telefono}]: "${textoCliente}"`);

  if (!textoCliente || textoCliente.trim() === "") {
    logger.warn(`Transcripción vacía para ${telefono}`);
    await responderPorLlamada(callSid, "No pude escucharte. Por favor llama de nuevo.");
    return;
  }

  try {
    const historial = conversaciones.get(telefono) || [];
    const resultado = await procesarMensaje(historial, textoCliente);
    conversaciones.set(telefono, resultado.historialActualizado);

    await responderPorLlamada(callSid, resultado.texto);
  } catch (error) {
    logger.error("Error procesando transcripción: " + error.message);
    await responderPorLlamada(callSid, "Tuvimos un problema. Por favor llama de nuevo.");
  }
});

// ── RESPONDER AL CLIENTE VIA TWILIO CALL ──
async function responderPorLlamada(callSid, texto) {
  try {
    const client = require("twilio")(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    const twilio = getTwilio();
    const twiml = new twilio.twiml.VoiceResponse();

    twiml.say(
      { language: "es-MX", voice: "Polly.Mia-Neural" },
      textoASSML(texto, "medium")
    );

    twiml.pause({ length: 2 });

    twiml.record({
      action: `${process.env.BASE_URL}/llamada/respuesta`,
      method: "POST",
      maxLength: 15,
      playBeep: true,
      transcribe: true,
      transcribeCallback: `${process.env.BASE_URL}/llamada/transcripcion`,
      timeout: 3,
      language: "es-MX",
    });

    twiml.say({ language: "es-MX", voice: "Polly.Mia-Neural" },
      textoASSML("Gracias por llamar a Mr. Sushi. Hasta pronto.", "medium"));
    twiml.hangup();

    await client.calls(callSid).update({ twiml: twiml.toString() });
    logger.info(`Respuesta enviada al call ${callSid}`);

  } catch (error) {
    logger.error("Error respondiendo llamada: " + error.message);
  }
}

module.exports = router;
