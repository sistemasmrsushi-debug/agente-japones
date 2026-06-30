// src/index.js
require("dotenv").config();
const express = require("express");
const path = require("path");
const rateLimit = require("express-rate-limit");
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos publicos (menu PDF, etc)
app.use("/public", express.static(path.join(__dirname, "../public")));

const logger = require("./utils/logger");
const whatsappRouter = require("./webhook/whatsapp");
const llamadasRouter = require("./llamadas/llamadas");
const dashboardRouter = require("./dashboard/dashboard");
const { initDB } = require("./db/database");

// ── RATE LIMITING ─────────────────────────────────────────────────────────────
// Limita peticiones por IP para evitar spam/ataques al webhook

// Webhook de WhatsApp y llamadas: maximo 30 peticiones por minuto por IP
const limiterWebhook = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 30,
  message: { error: "Demasiadas solicitudes, intenta de nuevo en un momento." },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit excedido: ${req.ip} en ${req.path}`);
    res.status(429).json({ error: "Demasiadas solicitudes" });
  },
});

// Dashboard login: maximo 10 intentos por minuto (evita fuerza bruta)
const limiterLogin = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Demasiados intentos de login, espera un momento." },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit login excedido: ${req.ip}`);
    res.status(429).json({ error: "Demasiados intentos" });
  },
});

// API general del dashboard: maximo 100 peticiones por minuto
const limiterAPI = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/webhook", limiterWebhook);
app.use("/llamada", limiterWebhook);
app.use("/api/login", limiterLogin);
app.use("/api/", limiterAPI);

app.use("/", whatsappRouter);
app.use("/", llamadasRouter);
app.use("/", dashboardRouter);

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), app: "Agente Mr. Sushi Call Center" });
});

const PORT = process.env.PORT || 8080;

async function iniciar() {
  try {
    await initDB();
    app.listen(PORT, () => {
      logger.info(`Agente Mr. Sushi iniciado en puerto ${PORT}`);
      logger.info(`WhatsApp webhook:  http://localhost:${PORT}/webhook`);
      logger.info(`Llamadas entrante: http://localhost:${PORT}/llamada/entrante`);
      logger.info(`Dashboard:         http://localhost:${PORT}/dashboard`);
      logger.info(`Menu PDF:          http://localhost:${PORT}/public/menu_mrsushi.pdf`);
      logger.info(`Rate limiting:     activo (webhook: 30/min, login: 10/min, api: 100/min)`);

      const URL_PROPIA = process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/health`
        : `http://localhost:${PORT}/health`;

      setInterval(() => {
        const http = URL_PROPIA.startsWith("https") ? require("https") : require("http");
        http.get(URL_PROPIA, (res) => {
          logger.info(`Keep-alive ping OK (${res.statusCode})`);
        }).on("error", (err) => {
          logger.warn(`Keep-alive ping error: ${err.message}`);
        });
      }, 5 * 60 * 1000);

      logger.info(`Keep-alive activo -> ping cada 5 min a ${URL_PROPIA}`);
    });
  } catch(err) {
    logger.error("Error iniciando: " + err.message);
    process.exit(1);
  }
}

iniciar();
