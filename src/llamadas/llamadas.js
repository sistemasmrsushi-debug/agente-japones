// src/llamadas/llamadas.js — Twilio Gather, sin bip, conversación natural
const express = require("express");
const router = express.Router();
const NodeCache = require("node-cache");
const { procesarMensaje } = require("../agent/agente");
const logger = require("../utils/logger");

const conversaciones = new NodeCache({ stdTTL: 86400 });
function getTwilio() { return require("twilio"); }

function limpiar(texto) {
  return texto
    .replace(/[*_~`#]/g, "")
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/✅|❌|⏳|🔔|📞|💬|🍣|🎌|🚚|📍|📝|👤|📅|👥|🎉/g, "")
    .replace(/\n+/g, ". ").replace(/\s+/g, " ").trim().substring(0, 400);
}

function ssml(texto) {
  return `<speak><prosody rate="medium">${limpiar(texto)}</prosody></speak>`;
}

function crearGather(twiml) {
  return twiml.gather({
    input: "speech",
    action: `${process.env.BASE_URL}/llamada/respuesta`,
    method: "POST",
    language: "es-MX",
    speechTimeout: "3",
    speechModel: "phone_call",
    timeout: 10,
  });
}

router.post("/llamada/entrante", (req, res) => {
  const telefono = req.body.From || "desconocido";
  logger.info(`Llamada entrante de: ${telefono}`);
  const twilio = getTwilio();
  const twiml = new twilio.twiml.VoiceResponse();
  const gather = crearGather(twiml);
  gather.say({ language:"es-MX", voice:"Polly.Mia-Neural" }, ssml("Bienvenido a Mr. Sushi, ¿en qué te puedo ayudar?"));
  twiml.say({ language:"es-MX", voice:"Polly.Mia-Neural" }, ssml("No escuché nada. Hasta luego."));
  twiml.hangup();
  res.type("text/xml").send(twiml.toString());
});

router.post("/llamada/respuesta", async (req, res) => {
  const telefono = req.body.From || "desconocido";
  const textoCliente = req.body.SpeechResult || "";
  logger.info(`[${telefono}] Escuché: "${textoCliente}"`);
  const twilio = getTwilio();
  const twiml = new twilio.twiml.VoiceResponse();

  if (!textoCliente.trim()) {
    const g = crearGather(twiml);
    g.say({ language:"es-MX", voice:"Polly.Mia-Neural" }, ssml("No te escuché bien. ¿Me puedes repetir?"));
    return res.type("text/xml").send(twiml.toString());
  }

  try {
    const historial = conversaciones.get(telefono) || [];
    const resultado = await procesarMensaje(historial, textoCliente);
    conversaciones.set(telefono, resultado.historialActualizado);
    const g = crearGather(twiml);
    g.say({ language:"es-MX", voice:"Polly.Mia-Neural" }, `<speak><prosody rate="medium">${limpiar(resultado.texto)}</prosody></speak>`);
    twiml.say({ language:"es-MX", voice:"Polly.Mia-Neural" }, ssml("Gracias por llamar a Mr. Sushi. Hasta pronto."));
    twiml.hangup();
  } catch (error) {
    logger.error("Error llamada: " + error.message);
    twiml.say({ language:"es-MX", voice:"Polly.Mia-Neural" }, ssml("Tuvimos un problema. Por favor llama de nuevo."));
    twiml.hangup();
  }
  res.type("text/xml").send(twiml.toString());
});

module.exports = router;
