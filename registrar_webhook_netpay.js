// registrar_webhook_netpay.js
// Ejecutar UNA SOLA VEZ para dar de alta la URL del webhook en Netpay
// node registrar_webhook_netpay.js

require("dotenv").config();
const { registrarWebhook } = require("./src/utils/netpay");

async function main() {
  console.log("Registrando webhook en Netpay...");
  const resultado = await registrarWebhook();
  console.log("Resultado:", resultado);
}

main();
