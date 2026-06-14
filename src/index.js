// src/index.js
require("dotenv").config();
const express = require("express");
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const logger = require("./utils/logger");
const whatsappRouter = require("./webhook/whatsapp");
const llamadasRouter = require("./llamadas/llamadas");
const dashboardRouter = require("./dashboard/dashboard");

app.use("/", whatsappRouter);
app.use("/", llamadasRouter);
app.use("/", dashboardRouter);

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), app: "Agente Mr. Sushi Call Center" });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  logger.info(`Agente Mr. Sushi iniciado en puerto ${PORT} 🍣`);
  logger.info(`WhatsApp webhook:  http://localhost:${PORT}/webhook`);
  logger.info(`Llamadas entrante: http://localhost:${PORT}/llamada/entrante`);
  logger.info(`Dashboard:         http://localhost:${PORT}/dashboard`);
});
