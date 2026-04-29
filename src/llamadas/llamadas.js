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
const http = require("http");
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
// 1. LLAMADA ENTRANTE
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
// 2. PROCESAR AUDIO GRABADO
// -----------------------------------------------
router.post("/llamada/respuesta", async (req, res) => {
  const telefono = req.body.From || "desconocido";
  const recordingUrl = req.body.RecordingUrl;
  const callSid = req.body.CallSid;

  logger.info(`Audio recibido de ${telefono}: ${recordingUrl}`);

  let twiml;
  try {
    const twilio = getTwilio();
    twiml = new twilio.twiml.VoiceResponse();
  } catch (error) {
    return res.status(500).send(error.message);
  }

  try {
    // Descargar audio con autenticación de Twilio
    const audioBuffer = await descargarAudioTwilio(recordingUrl + ".mp3");
    logger.info(`Audio descargado: ${audioBuffer.length} bytes`);

    // Transcribir con Deepgram
    const textoCliente = await transcribirBuffer(audioBuffer);
    logger.info(`[${telefono}] Transcripción: "${textoCliente}"`);

    if (!textoCliente || textoCliente.trim() === "") {
      twiml.say(
        { language: "es-MX", voice: "Polly.Mia" },
        "Lo siento, no pude escucharte bien. Por favor intenta de nuevo."
      );
      twiml.redirect(`${process.env.BASE_URL}/llamada/entrante`);
      return res.type("text/xml").send(twiml.toString());
    }

    // Procesar con el agente IA
    const historial = conversaciones.get(telefono) || [];
    const resultado = await procesarMensaje(historial, textoCliente);
    conversaciones.set(telefono, resultado.historialActualizado);

    // Generar audio de respuesta
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
// 3. SERVIR AUDIO TTS
// -----------------------------------------------
router.get("/llamada/audio/:id", (req, res) => {
  const audioPath = path.join(AUDIO_DIR, `${req.params.id}.mp3`);
  if (!fs.existsSync(audioPath)) return res.status(404).send("Audio no encontrado");
  res.setHeader("Content-Type", "audio/mpeg");
  fs.createReadStream(audioPath).pipe(res);
});

// -----------------------------------------------
// DESCARGAR AUDIO CON AUTENTICACIÓN TWILIO
// -----------------------------------------------
function descargarAudioTwilio(url) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(
      `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
    ).toString("base64");

    const options = {
      headers: {
        "Authorization": `Basic ${auth}`,
        "User-Agent": "Mozilla/5.0",
      }
    };

    const client = url.startsWith("https") ? https : http;
    client.get(url, options, (response) => {
      // Manejar redirecciones
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        logger.info(`Redirigiendo a: ${redirectUrl}`);
        return descargarAudioTwilio(redirectUrl).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        return reject(new Error(`HTTP ${response.statusCode} al descargar audio`));
      }

      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
    }).on("error", reject);
  });
}

// -----------------------------------------------
// TRANSCRIBIR BUFFER CON DEEPGRAM
// -----------------------------------------------
async function transcribirBuffer(audioBuffer) {
  try {
    const deepgram = getDeepgram();

    const { result } = await deepgram.listen.prerecorded.transcribeFile(
      audioBuffer,
      {
        model: "nova-2",
        language: "es",
        smart_format: true,
        mimetype: "audio/mpeg",
      }
    );

    const transcripcion = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
    return transcripcion;

  } catch (error) {
    logger.error("Error en Deepgram: " + error.message);
    return "";
  }
}

// -----------------------------------------------
// GENERAR AUDIO TTS
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
