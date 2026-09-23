// verificar_direccion_sucursales.js
// Revisa que todas las sucursales activas tengan municipio/estado/CP
// geocodificados -- son el respaldo que ahora usa el sistema de cupones/
// pagos cuando un pedido a domicilio llega por ubicacion GPS y Google no
// puede resolver esos datos del cliente (ver datosFacturacionConRespaldo en
// whatsapp.js). Si alguna sucursal sale "INCOMPLETA" aqui, ese respaldo NO
// funcionaria para los pedidos asignados a esa sucursal -- correr
// scripts/backfill_direccion_sucursales.js para completarla.
//
// Uso: node verificar_direccion_sucursales.js   (correr en la consola de Railway)
const db = require("./src/db/database");

(async () => {
  const sucursales = await db.obtenerSucursales();
  const activas = sucursales.filter(s => s.activo !== false);
  console.log(`Revisando ${activas.length} sucursales activas...\n`);
  let incompletas = 0;
  for (const s of activas) {
    const falta = [];
    if (!s.municipio) falta.push("municipio");
    if (!s.estado_direccion) falta.push("estado");
    if (!s.codigo_postal) falta.push("codigo_postal");
    if (falta.length > 0) {
      incompletas++;
      console.log(`❌ INCOMPLETA: ${s.nombre} -- falta: ${falta.join(", ")}`);
    } else {
      console.log(`✅ OK: ${s.nombre}`);
    }
  }
  console.log(`\n${incompletas === 0 ? "Todas las sucursales activas tienen los datos completos." : `${incompletas} sucursal(es) incompleta(s) -- correr scripts/backfill_direccion_sucursales.js`}`);
  process.exit(0);
})().catch(e => { console.error("Error:", e.message); process.exit(1); });
