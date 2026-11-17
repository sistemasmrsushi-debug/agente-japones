// scripts/aplicar_claves_telnet_confirmadas.js
// =============================================
// Aplica al menu las claves de producto de Telnet y el precio de Telnet
// (pedido por Diego: "solo dejar los precios que estan en el excel") -- pero
// SOLO para los platillos de abajo, que se verificaron UNO POR UNO contra el
// catálogo real de Telnet (no por parecido de nombre).
//
// Por que son solo 9 y no los 107: al comparar el menú del bot contra el
// catálogo de Telnet se hizo primero un emparejamiento automático por
// nombre parecido, pero al revisar a mano una muestra de esos resultados se
// encontraron VARIOS errores reales -- platillos distintos que el
// emparejamiento automático había unido por error (ej. "Dumplings de Cerdo"
// había quedado apuntando a la clave de "Dumplings de Vegetales" solo
// porque las palabras se parecían). Con una tasa de error así de alta en
// una muestra chica, no es seguro aplicar el resto del emparejamiento
// automático sin que alguien que conozca el menú lo revise platillo por
// platillo -- un código equivocado significa cobrar o registrar el platillo
// incorrecto.
//
// El resto de los 107 platillos del bot deben confirmarse uno por uno desde
// el panel: Administración → Menú → columna "Clave Telnet" (ya existe ahí
// desde esta misma actualización). La hoja de comparación que se le mandó a
// Diego ("Comparacion_menu_bot_vs_Telnet.xlsx") sigue sirviendo como punto
// de partida para esa revisión, pero no se le debe dar el mismo nivel de
// confianza a las filas de "Confianza: Alta" que a estas 9 -- la fila de
// "Coca Cola Light" era justo una de esas, y estaba mal.
//
// Uso (una sola vez, desde la raiz del proyecto):
//   node scripts/aplicar_claves_telnet_confirmadas.js
// =============================================
require("dotenv").config();
const db = require("../src/db/database");

const CONFIRMADOS = [
  { nombre: "Dumplings de Cerdo", clave: "AP0013", precio: 112 }, // DUMPLINGS LOMO VAP
  { nombre: "Dumplings de Cerdo Fritos", clave: "AP0254", precio: 112 }, // DUMPLINGS LOMO FRI
  { nombre: "Dumplings de Vegetales", clave: "AP0014", precio: 112 }, // DUMPLINGS VEGE VAP
  { nombre: "Dumplings de Vegetales Fritos", clave: "AP0253", precio: 112 }, // DUMPLINGS VEGE FRI
  { nombre: "Coca Cola", clave: "AP0137", precio: 39 }, // COCA COLA 600 ML
  { nombre: "Coca Cola Light", clave: "AP0139", precio: 39 }, // COCA LIGHT 600 ML (el emparejamiento automatico la habia confundido con la Coca normal)
  { nombre: "Sushi Filadelfia Maki Camarón", clave: "AP0064", precio: 120 }, // FILADEL. CAMARON
  { nombre: "Sushi Filadelfia Maki Salmón", clave: "AP0060", precio: 120 }, // FILADEL. SALMON
  { nombre: "Sushi Filadelfia Maki Atún", clave: "AP0061", precio: 120 }, // FILADEL. ATUN
];

async function aplicar() {
  // Crea la columna telnet_clave_producto (y las demas de esta integracion)
  // si todavia no existen -- asi este script funciona sin importar si ya
  // desplegaste el codigo nuevo en Railway o no.
  await db.initDB();
  const menu = await db.obtenerMenuAdmin();
  let aplicados = 0, noEncontrados = 0;

  for (const c of CONFIRMADOS) {
    const item = menu.find(m => m.nombre.trim().toLowerCase() === c.nombre.trim().toLowerCase());
    if (!item) {
      console.log(`  [NO ENCONTRADO EN EL MENU] "${c.nombre}" -- ¿cambió de nombre?`);
      noEncontrados++;
      continue;
    }
    await db.actualizarItemMenu(item.id, { telnet_clave_producto: c.clave, precio: c.precio });
    console.log(`  [OK] "${c.nombre}" -> ${c.clave} ($${c.precio})`);
    aplicados++;
  }

  console.log(`\nListo. ${aplicados} platillos actualizados, ${noEncontrados} no encontrados.`);
  console.log(`Los demás platillos del menú se confirman desde Administración → Menú → "Clave Telnet".`);
  process.exit(0);
}

aplicar().catch((err) => {
  console.error("Error aplicando claves de Telnet:", err);
  process.exit(1);
});
