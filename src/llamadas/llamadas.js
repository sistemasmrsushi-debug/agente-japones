// src/llamadas/llamadas.js
const express = require("express");
const router = express.Router();
const NodeCache = require("node-cache");
const { procesarMensaje } = require("../agent/agente");
const logger = require("../utils/logger");

const conversaciones = new NodeCache({ stdTTL: 86400 });

function getTwilio() {
  return require("twilio");
}

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

// Convertir texto a SSML con velocidad ajustada
function textoASSML(texto, velocidad = "fast") {
  const textoLimpio = limpiarTexto(texto);
  return `<speak><prosody rate="${velocidad}">${textoLimpio}</prosody></speak>`;
}

// ── LLAMADA ENTRANTE ──
router.post("/llamada/entrante", (req, res) => {
  const telefono = req.body.From || "desconocido";
  logger.info(`Llamada entrante de: ${telefono}`);

  const twilio = getTwilio();
  const twiml = new twilio.twiml.VoiceResponse();

  // Saludo rápido y claro
  twiml.say(
    { language: "es-MX", voice: "Polly.Mia-Neural" },
    textoASSML("Bienvenido a Mr. Sushi. Diga su pedido después del tono.", "medium")
  );

  twiml.record({
    action: `${process.env.BASE_URL}/llamada/respuesta`,
    method: "POST",
    maxLength: 20,
    playBeep: true,
    transcribe: false,
    timeout: 2,
  });

  twiml.say(
    { language: "es-MX", voice: "Polly.Mia-Neural" },
    textoASSML("No escuché nada. Hasta luego.", "medium")
  );
  twiml.hangup();

  res.type("text/xml").send(twiml.toString());
});

// ── PROCESAR AUDIO ──
router.post("/llamada/respuesta", async (req, res) => {
  const telefono = req.body.From || "desconocido";
  const recordingUrl = req.body.RecordingUrl;
  const callSid = req.body.CallSid;

  logger.info(`Audio recibido de ${telefono}`);

  const twilio = getTwilio();
  const twiml = new twilio.twiml.VoiceResponse();

  try {
    // Transcribir con Deepgram
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

    // Procesar con agente IA
    const historial = conversaciones.get(telefono) || [];
    const resultado = await procesarMensaje(historial, textoCliente);
    conversaciones.set(telefono, resultado.historialActualizado);

    // Responder con voz rápida y natural
    twiml.say(
      { language: "es-MX", voice: "Polly.Mia-Neural" },
      textoASSML(resultado.texto, "fast")
    );

    // Pausa antes de grabar para evitar que se encimen
    twiml.pause({ length: 1 });

    twiml.say(
      { language: "es-MX", voice: "Polly.Mia-Neural" },
      textoASSML("¿Algo más? Habla después del tono.", "medium")
    );

    twiml.record({
      action: `${process.env.BASE_URL}/llamada/respuesta`,
      method: "POST",
      maxLength: 20,
      playBeep: true,
      timeout: 3,
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
