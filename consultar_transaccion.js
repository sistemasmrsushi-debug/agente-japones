// consultar_transaccion.js
// Consulta directo a la API de Netpay el estatus real de una transaccion/sesion,
// sin depender del dashboard web (que puede tener retrasos o filtros raros).
//
// Uso:
//   node consultar_transaccion.js

require('dotenv').config();
const https = require('https');

const key = process.env.NETPAY_SECRET_KEY;
const id = 's9g8mLYsOJ!I1eLYCs77ki=x3!22RB'; // sessionId de la prueba PED-1785367676906

if (!key) {
  console.error('ERROR: no se encontro NETPAY_SECRET_KEY en el .env local');
  process.exit(1);
}

const options = {
  hostname: 'gateway-154.netpaydev.com',
  path: '/gateway-ecommerce/v3/transactions/' + encodeURIComponent(id),
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': key,
  },
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (c) => (data += c));
  res.on('end', () => {
    console.log('Status HTTP:', res.statusCode);
    console.log(data);
  });
});

req.on('error', (e) => console.error('Error de red:', e.message));
req.end();
