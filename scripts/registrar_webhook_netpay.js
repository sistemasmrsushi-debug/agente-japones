// scripts/registrar_webhook_netpay.js
// =============================================
// Registra la URL del webhook directamente vía la API de Netpay,
// evitando el formulario del portal (que tiene un bug conocido con
// el formato de la URL, segun confirmo el propio equipo de Netpay).
//
// Uso (una sola vez, desde la raiz del proyecto):
//   node scripts/registrar_webhook_netpay.js
// =============================================
require("dotenv").config();
const { registrarWebhook } = require("../src/utils/netpay");

async function main() {
  console.log("Registrando webhook en Netpay...");
  console.log(`URL a registrar: https://${process.env.RAILWAY_PUBLIC_DOMAIN}/webhook/netpay`);
  console.log(`Usando llave: ${(process.env.NETPAY_SECRET_KEY || "").slice(0, 20)}...`);

  const resultado = await registrarWebhook();

  console.log("\nRespuesta de Netpay:");
  console.log(`  Status: ${resultado.statusCode}`);
  console.log(`  Body: ${resultado.data}`);

  if (resultado.statusCode === 200) {
    console.log("\nWebhook registrado correctamente.");
  } else {
    console.log("\nNetpay respondio con un status distinto a 200 -- revisa el body de arriba para ver el detalle del error.");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Error registrando el webhook:", err);
  process.exit(1);
});
