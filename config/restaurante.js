// config/restaurante.js
// =============================================
// CONFIGURACIÓN CENTRAL DEL RESTAURANTE
// Edita este archivo con tu información real
// =============================================

module.exports = {
  nombre: "Restaurante Japonés",
  horario: "Lunes a Domingo de 12:00 a 22:00",
  telefono_principal: "+52 55 XXXX XXXX",

  // -----------------------------------------------
  // SUCURSALES (agrega o quita según necesites)
  // -----------------------------------------------
  sucursales: [
    { id: 1, nombre: "Polanco",         zona: "CDMX",   direccion: "Av. Presidente Masaryk 123",   telefono: "+52 55 1111 0001" },
    { id: 2, nombre: "Santa Fe",        zona: "CDMX",   direccion: "Centro Comercial Santa Fe L4", telefono: "+52 55 1111 0002" },
    { id: 3, nombre: "Condesa",         zona: "CDMX",   direccion: "Av. Ámsterdam 45",             telefono: "+52 55 1111 0003" },
    { id: 4, nombre: "Interlomas",      zona: "EDOMEX", direccion: "Mall Interlomas Local 210",    telefono: "+52 55 1111 0004" },
    { id: 5, nombre: "Satélite",        zona: "EDOMEX", direccion: "Plaza Satélite Nivel 2",       telefono: "+52 55 1111 0005" },
    { id: 6, nombre: "Metepec",         zona: "EDOMEX", direccion: "Av. Tecnológico 890",          telefono: "+52 55 1111 0006" },
    // ... agrega las 30 sucursales aquí
  ],

  // -----------------------------------------------
  // MENÚ (actualiza precios y platillos reales)
  // -----------------------------------------------
  menu: {
    "Entradas": [
      { nombre: "Edamame",          precio: 85,   descripcion: "Frijoles de soya al vapor con sal de mar" },
      { nombre: "Gyozas (6 pzas)",  precio: 120,  descripcion: "Dumplings de cerdo y verduras, fritos o al vapor" },
      { nombre: "Takoyaki (8 pzas)",precio: 130,  descripcion: "Bolitas de pulpo con salsa takoyaki y mayonesa" },
      { nombre: "Miso Soup",        precio: 70,   descripcion: "Sopa de miso con tofu y alga wakame" },
    ],
    "Sushi Rolls": [
      { nombre: "California Roll",  precio: 160,  descripcion: "Cangrejo, aguacate y pepino (8 pzas)" },
      { nombre: "Spicy Tuna",       precio: 185,  descripcion: "Atún picante con sriracha (8 pzas)" },
      { nombre: "Dragon Roll",      precio: 220,  descripcion: "Camarón tempura, aguacate y anguila (8 pzas)" },
      { nombre: "Rainbow Roll",     precio: 250,  descripcion: "California roll cubierto de sashimi variado (8 pzas)" },
    ],
    "Ramen": [
      { nombre: "Tonkotsu Ramen",   precio: 195,  descripcion: "Caldo de cerdo 12 hrs, chashu, huevo nitamago" },
      { nombre: "Shoyu Ramen",      precio: 180,  descripcion: "Caldo claro de soya, pollo, bambú y nori" },
      { nombre: "Miso Ramen",       precio: 185,  descripcion: "Caldo de miso, maíz, mantequilla y chashu" },
      { nombre: "Vegetariano",      precio: 170,  descripcion: "Caldo de shiitake, tofu, verduras de temporada" },
    ],
    "Platos Fuertes": [
      { nombre: "Teriyaki de Pollo",precio: 185,  descripcion: "Pollo glaseado con salsa teriyaki, arroz y ensalada" },
      { nombre: "Katsu Curry",      precio: 195,  descripcion: "Milanesa de cerdo con curry japonés y arroz" },
      { nombre: "Chirashi",         precio: 290,  descripcion: "Sashimi variado sobre arroz de sushi" },
      { nombre: "Bento Box",        precio: 250,  descripcion: "Arroz, salmón teriyaki, gyozas, ensalada y miso" },
    ],
    "Bebidas": [
      { nombre: "Matcha Latte",     precio: 75,   descripcion: "Té verde japonés con leche vaporizada" },
      { nombre: "Limonada de Yuzu", precio: 80,   descripcion: "Cítrico japonés, miel y agua mineral" },
      { nombre: "Sake (copa)",      precio: 120,  descripcion: "Sake frío de la casa" },
      { nombre: "Agua / Refresco",  precio: 40,   descripcion: "Agua natural, mineral o refresco" },
    ],
    "Postres": [
      { nombre: "Mochi (3 pzas)",   precio: 90,   descripcion: "Bolitas de arroz rellenas: fresa, mango, matcha" },
      { nombre: "Cheesecake Matcha",precio: 95,   descripcion: "Cheesecake de té verde con salsa de fresa" },
    ],
  },

  // -----------------------------------------------
  // POLÍTICAS
  // -----------------------------------------------
  politicas: {
    reservaciones: "Con mínimo 2 horas de anticipación. Máximo 20 personas por reservación.",
    cancelaciones: "Cancelaciones sin cargo hasta 1 hora antes.",
    delivery: "Solo en sucursales seleccionadas. Consultar disponibilidad.",
    tiempo_espera_pedido: "30–45 minutos en hora pico.",
  },
};
