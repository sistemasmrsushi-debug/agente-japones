// src/utils/reportes.js
// NUEVO (25-sep-2026, pedido por Diego): genera el reporte financiero/
// operativo descargable en Excel que se pide desde la Vista Gerente del
// dashboard (ver GET /api/reportes/excel en dashboard.js, solo gerente).
// Junta ventas, cupones/descuentos, quejas y reservaciones de un rango de
// fechas en un solo archivo .xlsx con una hoja por tema -- Diego pidio esto
// especificamente porque con el sistema de cupones ya no le bastaba con ver
// los pedidos uno por uno para saber cuanto se estaba descontando en total.
const ExcelJS = require("exceljs");

const FORMATO_MONEDA = '"$"#,##0.00';

function totalBaseDePedido(pedido) {
  const items = Array.isArray(pedido.items) ? pedido.items : [];
  return items.reduce((s, i) => s + (Number(i.precio) || 0) * (i.cantidad || 1), 0);
}

function estilizarEncabezado(row) {
  row.font = { bold: true };
  return row;
}

function formatearColumnaMoneda(ws, colLetra) {
  ws.getColumn(colLetra).numFmt = FORMATO_MONEDA;
}

async function generarReporteExcel({ desde, hasta, pedidos, cupones, quejas, reservaciones }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Mr. Sushi -- Dashboard";
  wb.created = new Date();

  // ── HOJA: Resumen ──────────────────────────────────────────────────────
  const resumen = wb.addWorksheet("Resumen");
  resumen.columns = [{ width: 38 }, { width: 20 }];
  const filaMoneda = (row) => { row.getCell(2).numFmt = FORMATO_MONEDA; return row; };

  const pedidosValidos = pedidos.filter(p => p.estado !== "cancelado");
  const pedidosCancelados = pedidos.filter(p => p.estado === "cancelado");
  const ventaBruta = pedidosValidos.reduce((s, p) => s + totalBaseDePedido(p), 0);
  const descuentoTotal = pedidosValidos.reduce((s, p) => s + (Number(p.descuento_monto) || 0), 0);
  const ventaNeta = ventaBruta - descuentoTotal;
  const ticketPromedio = pedidosValidos.length ? ventaNeta / pedidosValidos.length : 0;
  const domicilio = pedidosValidos.filter(p => p.tipo === "domicilio").length;
  const enSucursal = pedidosValidos.filter(p => p.tipo !== "domicilio").length;

  resumen.addRow(["Reporte Mr. Sushi", ""]);
  resumen.addRow([`Periodo: ${desde} a ${hasta}`, ""]);
  resumen.addRow([`Generado: ${new Date().toLocaleString("es-MX")}`, ""]);
  resumen.addRow([]);
  estilizarEncabezado(resumen.addRow(["VENTAS", ""]));
  resumen.addRow(["Pedidos totales (incluye cancelados)", pedidos.length]);
  resumen.addRow(["Pedidos cancelados", pedidosCancelados.length]);
  resumen.addRow(["Pedidos válidos (no cancelados)", pedidosValidos.length]);
  resumen.addRow(["  A domicilio", domicilio]);
  resumen.addRow(["  En sucursal", enSucursal]);
  filaMoneda(resumen.addRow(["Venta bruta (antes de descuentos)", ventaBruta]));
  filaMoneda(resumen.addRow(["Descuentos por cupón otorgados", descuentoTotal]));
  filaMoneda(resumen.addRow(["Venta neta (lo realmente cobrado)", ventaNeta]));
  filaMoneda(resumen.addRow(["Ticket promedio", ticketPromedio]));
  resumen.addRow([]);
  estilizarEncabezado(resumen.addRow(["VENTAS POR SUCURSAL (venta neta)", ""]));
  const porSucursal = {};
  for (const p of pedidosValidos) {
    const s = p.sucursal || "Sin sucursal";
    if (!porSucursal[s]) porSucursal[s] = { pedidos: 0, venta: 0 };
    porSucursal[s].pedidos += 1;
    porSucursal[s].venta += totalBaseDePedido(p) - (Number(p.descuento_monto) || 0);
  }
  Object.entries(porSucursal)
    .sort((a, b) => b[1].venta - a[1].venta)
    .forEach(([s, d]) => filaMoneda(resumen.addRow([`  ${s} (${d.pedidos} pedidos)`, d.venta])));
  resumen.addRow([]);
  estilizarEncabezado(resumen.addRow(["QUEJAS", ""]));
  resumen.addRow(["Total de quejas registradas", quejas.length]);
  resumen.addRow(["Resueltas por el agente solo", quejas.filter(q => q.resuelta_por === "agente").length]);
  resumen.addRow(["Resueltas manualmente por el equipo", quejas.filter(q => q.resuelta_por === "staff").length]);
  resumen.addRow(["Pendientes de seguimiento", quejas.filter(q => q.estado === "nueva").length]);
  resumen.addRow([]);
  estilizarEncabezado(resumen.addRow(["RESERVACIONES", ""]));
  resumen.addRow(["Total de reservaciones", reservaciones.length]);
  resumen.addRow(["Confirmadas", reservaciones.filter(r => r.estado === "confirmada").length]);
  resumen.addRow(["Canceladas", reservaciones.filter(r => r.estado === "cancelada").length]);

  // ── HOJA: Pedidos ──────────────────────────────────────────────────────
  const wsPedidos = wb.addWorksheet("Pedidos");
  wsPedidos.columns = [
    { header: "ID", key: "id", width: 18 },
    { header: "Fecha", key: "fecha", width: 18 },
    { header: "Sucursal", key: "sucursal", width: 20 },
    { header: "Tipo", key: "tipo", width: 12 },
    { header: "Estado", key: "estado", width: 14 },
    { header: "Cliente", key: "cliente", width: 20 },
    { header: "Teléfono", key: "telefono", width: 16 },
    { header: "Subtotal", key: "subtotal", width: 12 },
    { header: "Cupón", key: "cupon", width: 12 },
    { header: "Descuento", key: "descuento", width: 12 },
    { header: "Total", key: "total", width: 12 },
  ];
  estilizarEncabezado(wsPedidos.getRow(1));
  for (const p of pedidos) {
    const subtotal = totalBaseDePedido(p);
    const descuento = Number(p.descuento_monto) || 0;
    wsPedidos.addRow({
      id: p.id,
      fecha: new Date(p.fecha).toLocaleString("es-MX"),
      sucursal: p.sucursal || "",
      tipo: p.tipo,
      estado: p.estado,
      cliente: p.nombre_cliente || "",
      telefono: (p.telefono_cliente || "").replace("whatsapp:", ""),
      subtotal,
      cupon: p.cupon_codigo || "",
      descuento,
      total: subtotal - descuento,
    });
  }
  formatearColumnaMoneda(wsPedidos, "H");
  formatearColumnaMoneda(wsPedidos, "J");
  formatearColumnaMoneda(wsPedidos, "K");

  // ── HOJA: Cupones ──────────────────────────────────────────────────────
  const wsCupones = wb.addWorksheet("Cupones");
  wsCupones.columns = [
    { header: "Código", key: "codigo", width: 16 },
    { header: "% Descuento", key: "porcentaje", width: 14 },
    { header: "Usos en el periodo", key: "usos_periodo", width: 18 },
    { header: "Descuento otorgado en el periodo", key: "descuento_periodo", width: 30 },
    { header: "Usos totales (histórico)", key: "usos_totales", width: 22 },
    { header: "Activo", key: "activo", width: 10 },
  ];
  estilizarEncabezado(wsCupones.getRow(1));
  const usoPorCupon = {};
  for (const p of pedidosValidos) {
    if (!p.cupon_codigo) continue;
    if (!usoPorCupon[p.cupon_codigo]) usoPorCupon[p.cupon_codigo] = { usos: 0, descuento: 0 };
    usoPorCupon[p.cupon_codigo].usos += 1;
    usoPorCupon[p.cupon_codigo].descuento += Number(p.descuento_monto) || 0;
  }
  for (const c of cupones) {
    const uso = usoPorCupon[c.codigo] || { usos: 0, descuento: 0 };
    wsCupones.addRow({
      codigo: c.codigo,
      porcentaje: Number(c.porcentaje),
      usos_periodo: uso.usos,
      descuento_periodo: uso.descuento,
      usos_totales: c.usos_actuales,
      activo: c.activo ? "Sí" : "No",
    });
  }
  formatearColumnaMoneda(wsCupones, "D");

  // ── HOJA: Quejas ───────────────────────────────────────────────────────
  const wsQuejas = wb.addWorksheet("Quejas");
  wsQuejas.columns = [
    { header: "ID", key: "id", width: 18 },
    { header: "Fecha", key: "fecha", width: 18 },
    { header: "Categoría", key: "categoria", width: 18 },
    { header: "Sucursal", key: "sucursal", width: 20 },
    { header: "Cliente", key: "cliente", width: 20 },
    { header: "Teléfono", key: "telefono", width: 16 },
    { header: "Descripción", key: "descripcion", width: 55 },
    { header: "Pedido relacionado", key: "pedido_id", width: 18 },
    { header: "Estado", key: "estado", width: 12 },
    { header: "Resuelta por", key: "resuelta_por", width: 14 },
  ];
  estilizarEncabezado(wsQuejas.getRow(1));
  for (const q of quejas) {
    wsQuejas.addRow({
      id: q.id,
      fecha: new Date(q.fecha).toLocaleString("es-MX"),
      categoria: q.categoria,
      sucursal: q.sucursal || "",
      cliente: q.nombre_cliente || "",
      telefono: (q.telefono_cliente || "").replace("whatsapp:", ""),
      descripcion: q.descripcion || "",
      pedido_id: q.pedido_id || "",
      estado: q.estado,
      resuelta_por: q.resuelta_por || "",
    });
  }

  // ── HOJA: Reservaciones ────────────────────────────────────────────────
  const wsRes = wb.addWorksheet("Reservaciones");
  wsRes.columns = [
    { header: "ID", key: "id", width: 18 },
    { header: "Registrada", key: "fecha_registro", width: 18 },
    { header: "Nombre", key: "nombre", width: 20 },
    { header: "Teléfono", key: "telefono", width: 16 },
    { header: "Fecha reservación", key: "fecha", width: 18 },
    { header: "Hora", key: "hora", width: 10 },
    { header: "Personas", key: "personas", width: 10 },
    { header: "Sucursal", key: "sucursal", width: 20 },
    { header: "Estado", key: "estado", width: 14 },
  ];
  estilizarEncabezado(wsRes.getRow(1));
  for (const r of reservaciones) {
    wsRes.addRow({
      id: r.id,
      fecha_registro: new Date(r.fecha_registro).toLocaleString("es-MX"),
      nombre: r.nombre || "",
      telefono: (r.telefono_cliente || "").replace("whatsapp:", ""),
      fecha: r.fecha || "",
      hora: r.hora || "",
      personas: r.personas || "",
      sucursal: r.sucursal || "",
      estado: r.estado,
    });
  }

  for (const ws of [wsPedidos, wsCupones, wsQuejas, wsRes]) {
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }

  return wb.xlsx.writeBuffer();
}

module.exports = { generarReporteExcel };
