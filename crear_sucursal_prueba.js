// crear_sucursal_prueba.js
// Ejecutar UNA SOLA VEZ para crear la "Sucursal de Prueba" usada por la
// prueba diaria automatizada (ver src/webhook/test_diario.js). Esta
// sucursal NO existe en config/restaurante.js a proposito -- eso garantiza
// que el bot nunca la ofrezca a un cliente real ni se le pueda asignar a
// ningun usuario del dashboard (sucursal/supervisor/gerente la escogen de
// una lista que viene de ese archivo). Queda ademas marcada "activo: false"
// como segunda capa de seguridad.
//
// node crear_sucursal_prueba.js

require("dotenv").config();
const db = require("./src/db/database");

const ID_SUCURSAL_PRUEBA = 999;

async function main() {
  await db.initDB();
  console.log("Creando Sucursal de Prueba (id 999) si no existe...");
  await db.insertarSucursalSiNoExiste({
    id: ID_SUCURSAL_PRUEBA,
    nombre: "Sucursal de Prueba",
    tipo: "prueba",
    zona: "PRUEBA",
    direccion: "Uso interno -- prueba diaria automatizada",
    telefono: "5500000000",
    telefono_transferencia: "5500000000",
    whatsapp: null,
  });
  await db.actualizarSucursal(ID_SUCURSAL_PRUEBA, { activo: false });
  console.log("Listo. Sucursal de Prueba creada y marcada como inactiva.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error creando Sucursal de Prueba:", err.message);
  process.exit(1);
});
