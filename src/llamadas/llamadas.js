// src/llamadas/llamadas.js
const express = require("express");
const router = express.Router();
const NodeCache = require("node-cache");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const { procesarMensaje } = require("../agent/agente");
const logger = require("../utils/logger");

const conversaciones = new NodeCache({ stdTTL: 86400 });
const AUDIO_DIR = path.join(__dirname, "../../data/audios");
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

function getTwilio() {
  return require("twilio");
}

function getDeepgram() {
  const { createClient } = require("@deepgram/sdk");
  return createClient(process.env.DEEPGRAM_API_KEY);
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

  logger.info(`Audio recibido · Duración: ${recordingDuration}s · URL: ${recordingUrl}`);

  const twilio = getTwilio();
  const twiml = new twilio.twiml.VoiceResponse();

  try {
    // Construir URL con credenciales embebidas para Deepgram
    const urlObj = new URL(recordingUrl + ".wav");
    urlObj.username = process.env.TWILIO_ACCOUNT_SID;
    urlObj.password = process.env.TWILIO_AUTH_TOKEN;
    const urlConCredenciales = urlObj.toString();

    logger.info(`Enviando a Deepgram: ${recordingUrl}.wav`);

    const deepgram = getDeepgram();
    const { result, error } = await deepgram.listen.prerecorded.transcribeUrl(
      { url: urlConCredenciales },
      {
        model: "nova-2",
        language: "es",
        smart_format: true,
      }
    );

    if (error) {
      logger.error("Error Deepgram: " + JSON.stringify(error));
    }

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

    const historial = conversaciones.get(telefono) || [];
    const resultado = await procesarMensaje(historial, textoCliente);
    conversaciones.set(telefono, resultado.historialActualizado);

    const audioId = `${callSid}-${Date.now()}`;
    await generarAudioTTS(resultado.texto, audioId);

    twiml.play(`${process.env.BASE_URL}/llamada/audio/${audioId}`);
    twiml.say({ language: "es-MX", voice: "Polly.Mia" }, "¿Necesitas algo más?");
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

// ── SERVIR AUDIO ──
router.get("/llamada/audio/:id", (req, res) => {
  const audioPath = path.join(AUDIO_DIR, `${req.params.id}.mp3`);
  if (!fs.existsSync(audioPath)) return res.status(404).send("Audio no encontrado");
  res.setHeader("Content-Type", "audio/mpeg");
  fs.createReadStream(audioPath).pipe(res);
});

// ── GENERAR AUDIO TTS ──
async function generarAudioTTS(texto, audioId) {
  const audioPath = path.join(AUDIO_DIR, `${audioId}.mp3`);
  const textoLimpio = texto
    .replace(/[*_~`]/g, "")
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .substring(0, 500);
  const urlTTS = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(textoLimpio)}&tl=es&client=tw-ob`;

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(audioPath);
    https.get(urlTTS, { headers: { "User-Agent": "Mozilla/5.0" } }, (response) => {
      response.pipe(file);
      file.on("finish", () => { file.close(); resolve(audioPath); });
    }).on("error", (err) => { fs.unlink(audioPath, () => {}); reject(err); });
  });
}

module.exports = router;
