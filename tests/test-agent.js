// tests/test-agent.js
require("dotenv").config();
const { procesarMensaje } = require("../src/agent/agente");

async function test() {
  console.log("🍣 Probando Agente Mr. Sushi...\n");
  const pruebas = [
    "Hola, ¿qué rollos tienen?",
    "Quiero 2 California Roll y un Ramen Tonkotsu",
    "Para recoger en Arboledas",
    "¿Tienen promociones?",
    "¿Cuál es el horario de Lomas Verdes?",
  ];
  let historial = [];
  for (const msg of pruebas) {
    console.log(`👤 Cliente: ${msg}`);
    try {
      const resultado = await procesarMensaje(historial, msg);
      console.log(`🤖 Agente: ${resultado.texto}`);
      if (resultado.accion) console.log(`⚡ Acción: ${resultado.accion}`);
      historial = resultado.historialActualizado;
    } catch (e) {
      console.error(`❌ Error: ${e.message}`);
    }
    console.log("─".repeat(60));
  }
}
test();
