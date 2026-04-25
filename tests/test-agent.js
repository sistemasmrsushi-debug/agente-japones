// tests/test-agent.js
// =============================================
// PRUEBA EL AGENTE EN LA TERMINAL
// Sin necesidad de WhatsApp ni Meta
// Ejecuta: node tests/test-agent.js
// =============================================

require("dotenv").config();
const readline = require("readline");
const { procesarMensaje } = require("../src/agent/agente");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let historial = [];

console.log("\n🍣 ===================================");
console.log("   PRUEBA DEL AGENTE - MODO CONSOLA");
console.log("   (escribe 'salir' para terminar)");
console.log("=====================================\n");

function preguntar() {
  rl.question("Tú: ", async (input) => {
    if (input.toLowerCase() === "salir") {
      console.log("\n¡Hasta luego! 👋\n");
      rl.close();
      return;
    }

    if (!input.trim()) { preguntar(); return; }

    try {
      const resultado = await procesarMensaje(historial, input);
      historial = resultado.historialActualizado;

      console.log(`\nAgente: ${resultado.texto}`);
      if (resultado.accion) {
        console.log(`\n[ACCIÓN: ${resultado.accion}]`);
        console.log(JSON.stringify(resultado.datos, null, 2));
      }
      console.log("");
    } catch (error) {
      console.error("Error:", error.message);
      if (error.message.includes("API key")) {
        console.error("→ Revisa que ANTHROPIC_API_KEY esté en tu archivo .env");
      }
    }

    preguntar();
  });
}

preguntar();
