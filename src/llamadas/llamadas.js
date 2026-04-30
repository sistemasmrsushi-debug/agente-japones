// src/llamadas/llamadas.js
const express = require("express");
const router = express.Router();
const NodeCache = require("node-cache");
const { procesarMensaje } = require("../agent/agente");
const logger = require("../utils/logger");

const conversaciones = new NodeCache({ stdTTL: 86400 });

function getTwilio() { return require("twilio"); }

function getDeepgram() {
  const { createClient } = require("@deepgram/sdk");
  return createClient(process.env.DEEPGRAM_API_KEY);
}

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
  const textoLimpio = limpiarTexto(texto);
  return `<speak><prosody rate="${velocidad}">${textoLimpio}</prosody></speak>`;
}

// ── LLAMADA ENTRANTE ──
router.post("/llamada/entrante", (req, res) => {
  const telefono = req.body.From || "desconocido";
  logger.info(`Llamada entrante de: ${telefono}`);

  const twilio = getTwilio();
  const twiml = new twilio.twiml.VoiceResponse();

  // Saludo simple — el bip indica cuándo hablar
  twiml.say(
    { language: "es-MX", voice: "Polly.Mia-Neural" },
    textoASSML("Bienvenido a Mr. Sushi, ¿en qué te puedo ayudar?", "medium")
  );

  twiml.record({
    action: `${process.env.BASE_URL}/llamada/respuesta`,
    method: "POST",
    maxLength: 20,
    playBeep: true,
    transcribe: false,
    timeout: 4,
  });

  twiml.say({ language: "es-MX", voice: "Polly.Mia-Neural" },
    textoASSML("No escuché nada. Hasta luego.", "medium"));
  twiml.hangup();

  res.type("text/xml").send(twiml.toString());
});

// ── PROCESAR AUDIO ──
router.post("/llamada/respuesta", async (req, res) => {
  const telefono = req.body.From || "desconocido";
  const recordingUrl = req.body.RecordingUrl;

  logger.info(`Audio recibido de ${telefono}`);

  const twilio = getTwilio();
  const twiml = new twilio.twiml.VoiceResponse();

  try {
    const urlObj = new URL(recordingUrl + ".wav");
    urlObj.username = process.env.TWILIO_ACCOUNT_SID;
    urlObj.password = process.env.TWILIO_AUTH_TOKEN;

    const deepgram = getDeepgram();
    const { result, error } = await deepgram.listen.prerecorded.transcribeUrl(
      { url: urlObj.toString() },
      { model: "base", language: "es", smart_format: false, punctuate: false }
    );

    if (error) logger.error("Error Deepgram: " + JSON.stringify(error));

    const textoCliente = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
    logger.info(`Transcripción: "${textoCliente}"`);

    if (!textoCliente || textoCliente.trim() === "") {
      twiml.say(
        { language: "es-MX", voice: "Polly.Mia-Neural" },
        textoASSML("No te escuché. Por favor intenta de nuevo.", "medium")
      );
      twiml.redirect(`${process.env.BASE_URL}/llamada/entrante`);
      return res.type("text/xml").send(twiml.toString());
    }

    const historial = conversaciones.get(telefono) || [];
    const resultado = await procesarMensaje(historial, textoCliente);
    conversaciones.set(telefono, resultado.historialActualizado);

    // Respuesta del agente
    twiml.say(
      { language: "es-MX", voice: "Polly.Mia-Neural" },
      textoASSML(resultado.texto, "medium")
    );

    // Pausa de 2 segundos y luego bip directo — sin mensaje extra
    twiml.pause({ length: 2 });

    twiml.record({
      action: `${process.env.BASE_URL}/llamada/respuesta`,
      method: "POST",
      maxLength: 20,
      playBeep: true,
      timeout: 5,
    });

    twiml.say(
      { language: "es-MX", voice: "Polly.Mia-Neural" },
      textoASSML("Gracias por llamar a Mr. Sushi. Hasta pronto.", "medium")
    );
    twiml.hangup();

  } catch (error) {
    logger.error("Error procesando llamada: " + error.message);
    twiml.say(
      { language: "es-MX", voice: "Polly.Mia-Neural" },
      textoASSML("Tuvimos un problema. Por favor llama de nuevo.", "medium")
    );
    twiml.hangup();
  }

  res.type("text/xml").send(twiml.toString());
});

module.exports = router;
