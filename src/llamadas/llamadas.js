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
    { language: "es-MX" },
    "Bienvenido a Mr. Sushi. Diga su pedido o consulta después del tono."
  );

  twiml.record({
    action: `${process.env.BASE_URL}/llamada/respuesta`,
    method: "POST",
    maxLength: 20,
    playBeep: true,
    transcribe: false,
    timeout: 2,
  });

  twiml.say({ language: "es-MX" }, "No escuché nada. Hasta luego.");
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
    const urlObj = new URL(recordingUrl + ".wav");
    urlObj.username = process.env.TWILIO_ACCOUNT_SID;
    urlObj.password = process.env.TWILIO_AUTH_TOKEN;

    const deepgram = getDeepgram();

    // Usar base modelo más rápido
    const { result, error } = await deepgram.listen.prerecorded.transcribeUrl(
      { url: urlObj.toString() },
      {
        model: "base",
        language: "es",
        smart_format: false,
        punctuate: false,
      }
    );

    if (error) logger.error("Error Deepgram: " + JSON.stringify(error));

    const textoCliente = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
    logger.info(`Transcripción: "${textoCliente}"`);

    if (!textoCliente || textoCliente.trim() === "") {
      twiml.say({ language: "es-MX" }, "No te escuché bien. Intenta de nuevo.");
      twiml.redirect(`${process.env.BASE_URL}/llamada/entrante`);
      return res.type("text/xml").send(twiml.toString());
    }

    const historial = conversaciones.get(telefono) || [];
    const resultado = await procesarMensaje(historial, textoCliente);
    conversaciones.set(telefono, resultado.historialActualizado);

    const textoRespuesta = limpiarTexto(resultado.texto);
    logger.info(`Respuesta: "${textoRespuesta}"`);

    twiml.say({ language: "es-MX" }, textoRespuesta);
    twiml.say({ language: "es-MX" }, "¿Necesitas algo más? Habla después del tono.");
    twiml.record({
      action: `${process.env.BASE_URL}/llamada/respuesta`,
      method: "POST",
      maxLength: 20,
      playBeep: true,
      timeout: 2,
    });
    twiml.say({ language: "es-MX" }, "Gracias por llamar a Mr. Sushi. Hasta pronto.");
    twiml.hangup();

  } catch (error) {
    logger.error("Error procesando llamada: " + error.message);
    twiml.say({ language: "es-MX" }, "Tuvimos un problema. Por favor llama de nuevo.");
    twiml.hangup();
  }

  res.type("text/xml").send(twiml.toString());
});

module.exports = router;
