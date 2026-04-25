// src/index.js
// =============================================
// SERVIDOR PRINCIPAL
// =============================================

require("dotenv").config();
const express = require("express");
const whatsappRouter   = require("./webhook/whatsapp");
const dashboardRouter  = require("./dashboard/dashboard");
const llamadasRouter   = require("./llamadas/llamadas");
const logger           = require("./utils/logger");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // requerido por Twilio

// Rutas
app.use("/", whatsappRouter);   // WhatsApp (no se toca)
app.use("/", dashboardRouter);  // Dashboard (no se toca)
app.use("/", llamadasRouter);   // Llamadas (módulo nuevo independiente)

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Agente iniciado en puerto ${PORT} 🍣`);
  logger.info(`WhatsApp webhook:  http://localhost:${PORT}/webhook`);
  logger.info(`Llamadas entrante: http://localhost:${PORT}/llamada/entrante`);
  logger.info(`Dashboard:         http://localhost:${PORT}/dashboard`);
});

module.exports = app;
