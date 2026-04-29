// src/llamadas/llamadas.js
// =============================================
// MÓDULO DE LLAMADAS TELEFÓNICAS
// Twilio + Deepgram STT + gTTS
// =============================================

const express = require("express");
const router = express.Router();
const NodeCache = require("node-cache");
const fs = require("fs");
const path = require("path");
const https = require("https");
const { procesarMensaje } = require("../agent/agente");
const logger = require("../utils/logger");

const conversaciones = new NodeCache({ stdTTL: 86400 });
const AUDIO_DIR = path.join(__dirname, "../../data/audios");
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

function getTwilio() {
  if (!process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID.includes("xxx")) {
    throw new Error("Configura TWILIO_ACCOUNT_SID en tus variables de entorno");
  }
  return require("twilio");
}

function getDeepgram() {
  if (!process.env.DEEPGRAM_API_KEY || process.env.DEEPGRAM_API_KEY.includes("xxx")) {
    throw new Error("Configura DEEPGRAM_API_KEY en tus variables de entorno");
  }
  const { createClient } = require("@deepgram/sdk");
  return createClient(process.env.DEEPGRAM_API_KEY);
}

// -----------------------------------------------
// 1. TWILIO LLAMA AQUÍ CUANDO ALGUIEN MARCA
// -----------------------------------------------
router.post("/llamada/entrante", (req, res) => {
  const telefono = req.body.From || "desconocido";
  logger.info(`Llamada entrante de: ${telefono}`);

  try {
    const twilio = getTwilio();
    const twiml = new twilio.twiml.VoiceResponse();

    twiml.say(
      { language: "es-MX", voice: "Polly.Mia" },
      "Bienvenido al restaurante Mr. Sushi. Por favor, diga su pedido o consulta después del tono."
    );

    twiml.record({
      action: `${process.env.BASE_URL}/llamada/respuesta`,
      method: "POST",
      maxLength: 15,
      playBeep: true,
      transcribe: false,
    });

    res.type("text/xml").send(twiml.toString());
  } catch (error) {
    logger.error("Error en llamada entrante: " + error.message);
    res.status(500).send(error.message);
  }
});

// -----------------------------------------------
// 2. TWILIO MANDA EL AUDIO GRABADO
// -----------------------------------------------
router.post("/llamada/respuesta", async (req, res) => {
  const telefono = req.body.From || "desconocido";
  const recordingUrl = req.body.RecordingUrl;
  const callSid = req.body.CallSid;

  let twiml;
  try {
    const twilio = getTwilio();
    twiml = new twilio.twiml.VoiceResponse();
  } catch (error) {
    return res.status(500).send(error.message);
  }

  try {
    const textoCliente = await transcribirAudio(recordingUrl);
    logger.info(`[${telefono}] Transcripción: ${textoCliente}`);

    if (!textoCliente || textoCliente.trim() === "") {
      twiml.say(
        { language: "es-MX", voice: "Polly.Mia" },
        "Lo siento, no pude escucharte bien. Por favor intenta de nuevo."
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
      maxLength: 15,
      playBeep: true,
      timeout: 3,
    });
    twiml.say(
      { language: "es-MX", voice: "Polly.Mia" },
      "Gracias por llamar a Mr. Sushi. ¡Hasta pronto!"
    );
    twiml.hangup();

  } catch (error) {
    logger.error("Error procesando llamada: " + error.message);
    twiml.say(
      { language: "es-MX", voice: "Polly.Mia" },
      "Lo siento, tuvimos un problema. Por favor llama de nuevo en unos minutos."
    );
    twiml.hangup();
  }

  res.type("text/xml").send(twiml.toString());
});

// -----------------------------------------------
// 3. SERVIR EL AUDIO TTS
// -----------------------------------------------
router.get("/llamada/audio/:id", (req, res) => {
  const audioPath = path.join(AUDIO_DIR, `${req.params.id}.mp3`);
  if (!fs.existsSync(audioPath)) return res.status(404).send("Audio no encontrado");
  res.setHeader("Content-Type", "audio/mpeg");
  fs.createReadStream(audioPath).pipe(res);
});

// -----------------------------------------------
// FUNCIÓN: Transcribir audio con Deepgram
// Usa transcribeUrl para que Deepgram descargue
// el audio directamente desde Twilio
// -----------------------------------------------
async function transcribirAudio(recordingUrl) {
  try {
    const deepgram = getDeepgram();
    const urlConAuth = recordingUrl + ".mp3";

    const { result } = await deepgram.listen.prerecorded.transcribeUrl(
      { url: urlConAuth },
      {
        model: "nova-2",
        language: "es",
        smart_format: true,
      }
    );

    const transcripcion = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
    logger.info(`Deepgram transcribió: "${transcripcion}"`);
    return transcripcion;

  } catch (error) {
    logger.error("Error en Deepgram: " + error.message);
    return "";
  }
}

// -----------------------------------------------
// FUNCIÓN: Generar audio TTS con Google Translate
// -----------------------------------------------
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
