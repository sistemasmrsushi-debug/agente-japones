// src/index.js
require("dotenv").config();
const express = require("express");
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const logger = require("./utils/logger");
const { initDB } = require("./db/database");
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

async function iniciar() {
  try {
    // Inicializar base de datos antes de arrancar el servidor
    await initDB();

    app.listen(PORT, () => {
      logger.info(`Agente Mr. Sushi iniciado en puerto ${PORT}`);
      logger.info(`WhatsApp webhook:  http://localhost:${PORT}/webhook`);
      logger.info(`Dashboard:         http://localhost:${PORT}/dashboard`);

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
  } catch (err) {
    logger.error("Error iniciando servidor: " + err.message);
    process.exit(1);
  }
}

iniciar();
