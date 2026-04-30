// src/llamadas/llamadas.js
const express = require("express");
const router = express.Router();
const NodeCache = require("node-cache");
const fs = require("fs");
const path = require("path");
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

// Limpiar texto para TTS
function limpiarTexto(texto) {
  return texto
    .replace(/[*_~`#]/g, "")
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/✅|❌|⏳|🔔|📞|💬|🍣|🎌/g, "")
    .replace(/\n+/g, ". ")
    .substring(0, 400);
}

// ── LLAMADA ENTRANTE ──
router.post("/llamada/entrante", (req, res) => {
  const telefono = req.body.From || "desconocido";
  logger.info(`Llamada entrante de: ${telefono}`);

  const twilio = getTwilio();
  const twiml = new twilio.twiml.VoiceResponse();

  twiml.say(
    { language: "es-MX", voice: "Polly.Mia" },
    "Bienvenido a Mr. Sushi. Por favor, diga su pedido o consulta después del tono."
  );

  twiml.record({
    action: `${process.env.BASE_URL}/llamada/respuesta`,
    method: "POST",
    maxLength: 30,
    playBeep: true,
    transcribe: false,
    timeout: 5,
  });

  twiml.say({ language: "es-MX", voice: "Polly.Mia" }, "No escuché nada. Hasta luego.");
  twiml.hangup();

  res.type("text/xml").send(twiml.toString());
});

// ── PROCESAR AUDIO ──
router.post("/llamada/respuesta", async (req, res) => {
  const telefono = req.body.From || "desconocido";
  const recordingUrl = req.body.RecordingUrl;
  const callSid = req.body.CallSid;
  const recordingDuration = req.body.RecordingDuration;

  logger.info(`Audio recibido · Duración: ${recordingDuration}s`);

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
      { model: "nova-2", language: "es", smart_format: true }
    );

    if (error) logger.error("Error Deepgram: " + JSON.stringify(error));

    const textoCliente = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
    logger.info(`Transcripción: "${textoCliente}"`);

    if (!textoCliente || textoCliente.trim() === "") {
      twiml.say(
        { language: "es-MX", voice: "Polly.Mia" },
        "Lo siento, no pude escucharte. Por favor intenta de nuevo."
      );
      twiml.redirect(`${process.env.BASE_URL}/llamada/entrante`);
      return res.type("text/xml").send(twiml.toString());
    }

    // Procesar con el agente IA
    const historial = conversaciones.get(telefono) || [];
    const resultado = await procesarMensaje(historial, textoCliente);
    conversaciones.set(telefono, resultado.historialActualizado);

    // Responder con Twilio TTS en español mexicano
    const textoRespuesta = limpiarTexto(resultado.texto);
    logger.info(`Respuesta TTS: "${textoRespuesta}"`);

    twiml.say({ language: "es-MX", voice: "Polly.Mia" }, textoRespuesta);

    // Preguntar si necesita algo más
    twiml.say({ language: "es-MX", voice: "Polly.Mia" }, "¿Necesitas algo más? Puedes hablar después del tono.");
    twiml.record({
      action: `${process.env.BASE_URL}/llamada/respuesta`,
      method: "POST",
      maxLength: 30,
      playBeep: true,
      timeout: 5,
    });
    twiml.say(
      { language: "es-MX", voice: "Polly.Mia" },
      "Gracias por llamar a Mr. Sushi. Hasta pronto."
    );
    twiml.hangup();

  } catch (error) {
    logger.error("Error procesando llamada: " + error.message);
    twiml.say(
      { language: "es-MX", voice: "Polly.Mia" },
      "Tuvimos un problema. Por favor llama de nuevo."
    );
    twiml.hangup();
  }

  res.type("text/xml").send(twiml.toString());
});

module.exports = router;
