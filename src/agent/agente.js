const restaurante = require("../../config/restaurante");
const logger = require("../utils/logger");

function getGroq() {
  const Groq = require("groq-sdk");
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}