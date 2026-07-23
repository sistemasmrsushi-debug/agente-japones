// src/webhook/pago_paginas.js
// =============================================
// Paginas que ve el cliente en su navegador justo despues de
// pagar (o cancelar) en el checkout de Netpay, antes de volver
// a WhatsApp. Netpay agrega un token despues de la ruta base
// (ej. /pago/exitoso/AbC123.../uuid), por eso las rutas usan "*"
// para aceptar cualquier cosa despues.
// =============================================
const express = require("express");
const router = express.Router();

const ESTILO_BASE = `
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #FCF6F5;
      padding: 1.5rem;
    }
    .card {
      max-width: 420px;
      width: 100%;
      background: #FFFFFF;
      border-radius: 16px;
      padding: 2.5rem 2rem;
      text-align: center;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    }
    .icono {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1.25rem;
      font-size: 2.25rem;
    }
    h1 { font-size: 1.35rem; color: #2B2B2B; margin-bottom: 0.6rem; }
    p { font-size: 0.95rem; color: #6B6B6B; line-height: 1.5; margin-bottom: 0.4rem; }
    .marca { margin-top: 2rem; font-size: 0.8rem; color: #B0B0B0; }
  </style>
`;

router.get(/^\/pago\/exitoso/, (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pago confirmado - Mr. Sushi</title>
  ${ESTILO_BASE}
</head>
<body>
  <div class="card">
    <div class="icono" style="background:#E8F8F0">✅</div>
    <h1>¡Tu pago fue confirmado!</h1>
    <p>Ya estamos preparando tu pedido.</p>
    <p>Puedes regresar a WhatsApp — ahí te avisaremos cuando esté listo.</p>
    <div class="marca">Mr. Sushi</div>
  </div>
</body>
</html>`);
});

router.get(/^\/pago\/cancelado/, (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pago cancelado - Mr. Sushi</title>
  ${ESTILO_BASE}
</head>
<body>
  <div class="card">
    <div class="icono" style="background:#FDECEC">✕</div>
    <h1>Pago cancelado</h1>
    <p>No se realizó ningún cargo a tu tarjeta.</p>
    <p>Regresa a WhatsApp si quieres intentar de nuevo o hacer otro pedido.</p>
    <div class="marca">Mr. Sushi</div>
  </div>
</body>
</html>`);
});

module.exports = router;
