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
  return require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

function getDeepgram() {
  const { createClient } = require("@deepgram/sdk");
  return createClient(process.env.DEEPGRAM_API_KEY);
}

// ── LLAMADA ENTRANTE ──
router.post("/llamada/entrante", (req, res) => {
  const telefono = req.body.From || "desconocido";
  logger.info(`Llamada entrante de: ${telefono}`);

  try {
    const client = getTwilio();
    const VoiceResponse = require("twilio").twiml.VoiceResponse;
    const twiml = new VoiceResponse();

    twiml.say({ language: "es-MX", voice: "Polly.Mia" },
      "Bienvenido a Mr. Sushi. Por favor, diga su pedido o consulta después del tono.");

    twiml.record({
      action: `${process.env.BASE_URL}/llamada/respuesta`,
      method: "POST",
      maxLength: 30,
      playBeep: true,
      transcribe: false,
      timeout: 5,
    });

    twiml.say({ language: "es-MX", voice: "Polly.Mia" }, "No escuché nada. Adiós.");
    twiml.hangup();

    res.type("text/xml").send(twiml.toString());
  } catch (error) {
    logger.error("Error en llamada entrante: " + error.message);
    res.status(500).send(error.message);
  }
});

// ── PROCESAR AUDIO ──
router.post("/llamada/respuesta", async (req, res) => {
  const telefono = req.body.From || "desconocido";
  const recordingUrl = req.body.RecordingUrl;
  const callSid = req.body.CallSid;

  logger.info(`Audio recibido de ${telefono}: ${recordingUrl}`);

  const VoiceResponse = require("twilio").twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  try {
    const audioBuffer = await descargarAudioTwilio(recordingUrl + ".mp3");
    logger.info(`Audio descargado: ${audioBuffer.length} bytes`);

    const textoCliente = await transcribirBuffer(audioBuffer);
    logger.info(`Transcripción: "${textoCliente}"`);

    if (!textoCliente || textoCliente.trim() === "") {
      twiml.say({ language: "es-MX", voice: "Polly.Mia" },
        "Lo siento, no pude escucharte. Por favor intenta de nuevo.");
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
    twiml.say({ language: "es-MX", voice: "Polly.Mia" },
      "Gracias por llamar a Mr. Sushi. Hasta pronto.");
    twiml.hangup();

  } catch (error) {
    logger.error("Error procesando llamada: " + error.message);
    twiml.say({ language: "es-MX", voice: "Polly.Mia" },
      "Tuvimos un problema. Por favor llama de nuevo.");
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

// ── DESCARGAR AUDIO CON AUTH TWILIO ──
function descargarAudioTwilio(url) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(
      `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
    ).toString("base64");

    const options = { headers: { "Authorization": `Basic ${auth}` } };
    const client = url.startsWith("https") ? https : http;

    client.get(url, options, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        return descargarAudioTwilio(response.headers.location).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        return reject(new Error(`HTTP ${response.statusCode}`));
      }
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
    }).on("error", reject);
  });
}

// ── TRANSCRIBIR CON DEEPGRAM ──
async function transcribirBuffer(audioBuffer) {
  try {
    const deepgram = getDeepgram();
    const { result } = await deepgram.listen.prerecorded.transcribeFile(
      audioBuffer,
      { model: "nova-2", language: "es", smart_format: true, mimetype: "audio/mpeg" }
    );
    return result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
  } catch (error) {
    logger.error("Error Deepgram: " + error.message);
    return "";
  }
}

// ── GENERAR AUDIO TTS ──
async function generarAudioTTS(texto, audioId) {
  const audioPath = path.join(AUDIO_DIR, `${audioId}.mp3`);
  const textoLimpio = texto.replace(/[*_~`]/g, "").replace(/[\u{1F300}-\u{1F9FF}]/gu, "").substring(0, 500);
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
