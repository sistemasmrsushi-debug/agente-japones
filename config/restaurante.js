
module.exports = {
  nombre: "Mr. Sushi",
  horario: "Lunes a Sábado de 12:00 a 22:00 · Domingos de 13:00 a 21:00",


  sucursales: [
    { id: 1, nombre: "Mr. Sushi Masaryk",              zona: "CDMX",   direccion: "Av. Pdte. Masaryk 354, Polanco, Polanco III Secc, Miguel Hidalgo, 11560 Ciudad de México, CDMX",   telefono: "+52 55 1111 0001" },
    { id: 2, nombre: "Mr. Sushi Cc Santa Fe",          zona: "CDMX",   direccion: "Vasco de Quiroga 3800, Lomas de Santa Fe, Contadero, Cuajimalpa de Morelos, 05109 Ciudad de México, CDMX", telefono: "+52 55 1111 0002" },
    { id: 3, nombre: "Mr. Sushi Patriotismo",          zona: "CDMX",   direccion: "Av. Patriotismo 229, San Pedro de los Pinos, Benito Juárez, 03800 Ciudad de México, CDMX",             telefono: "+52 55 1111 0003" },
    { id: 4, nombre: "Mr. Sushi Perisur",              zona: "CDMXX",  direccion: "Anillo Perif. Blvd. Adolfo López Mateos 4690, Insurgentes Cuicuilco, Coyoacán, 04530 Ciudad de México, CDMX210",    telefono: "+52 55 1111 0004" },
    { id: 5, nombre: "Mr. Sushi Coapa",                zona: "CDMX",   direccion: "Calz. del Hueso 519-loc 417, Coapa, Residencial Miramontes, Tlalpan, 14300 Ciudad de México, CDMX",       telefono: "+52 55 1111 0005" },
    { id: 6, nombre: "Mr. Sushi Toluca",               zona: "EDOMEX", direccion: "Av. Primero de Mayo 1700-402, Santa Ana Tlapaltitlán, 50071 Santa Ana Tlapaltitlán, Méx.",          telefono: "+52 55 1111 0006" },
    { id: 7, nombre: "Mr. Sushi Americana",            zona: "JALICO", direccion: "C. Miguel Lerdo de Tejada 2031, Col Americana, Obrera, 44560 Guadalajara, Jal.",          telefono: "+52 55 1111 0006" },
    { id: 8, nombre: "Mr. Sushi Arboledas",            zona: "EDOMEX", direccion: "Av. Tecnológico 890Calz. de los Jinetes 60-Locales 3 y 7, Las Arboledas, 54026 Tlalnepantla, Méx.",          telefono: "+52 55 1111 0006" },
    { id: 9, nombre: "Mr. Sushi Galerias Atizapan",    zona: "EDOMEX", direccion: "Av. Tecnológico 890",          telefono: "+52 55 1111 0006" },
    { id: 10, nombre: "Mr. Sushi Zona Esmeralda",      zona: "EDOMEX", direccion: "Av. Tecnológico 890",          telefono: "+52 55 1111 0006" },
    { id: 11, nombre: "Mr. Sushi Zona Azul Rest",      zona: "EDOMEX", direccion: "Av. Tecnológico 890",          telefono: "+52 55 1111 0006" },
    { id: 12, nombre: "Mr. Sushi Metepec",             zona: "EDOMEX", direccion: "Av. Tecnológico 890",          telefono: "+52 55 1111 0006" },
    { id: 13, nombre: "Mr. Sushi Fuentes de Satelite", zona: "EDOMEX", direccion: "Av. Tecnológico 890",          telefono: "+52 55 1111 0006" },
    { id: 14, nombre: "Hahha Satelite",                zona: "EDOMEX", direccion: "Av. Tecnológico 890",          telefono: "+52 55 1111 0006" },
    { id: 15, nombre: "Hahha Esmeralda",               zona: "EDOMEX", direccion: "Av. Tecnológico 890",          telefono: "+52 55 1111 0006" },
    { id: 16, nombre: "Mr. Sushi Zona Azul Dom.",      zona: "EDOMEX", direccion: "Av. Tecnológico 890",          telefono: "+52 55 1111 0006" },
    { id: 17, nombre: "Mr. Sushi Delta",               zona: "CDMXX",  direccion: "Av. Tecnológico 890",          telefono: "+52 55 1111 0006" },
    { id: 18, nombre: "Mr. Sushi Serdan",              zona: "EDOMEX", direccion: "Av. Tecnológico 890",          telefono: "+52 55 1111 0006" },
    { id: 19, nombre: "Mr. Sushi Cuernavaca",          zona: "EDOMEX", direccion: "Av. Tecnológico 890",          telefono: "+52 55 1111 0006" },
    { id: 20, nombre: "Mr. Sushi Vallejo",             zona: "EDOMEX", direccion: "Av. Tecnológico 890",          telefono: "+52 55 1111 0006" },
    { id: 21, nombre: "Mr. Sushi Mundo E",             zona: "EDOMEX", direccion: "Av. Tecnológico 890",          telefono: "+52 55 1111 0006" },
    { id: 22, nombre: "Mr. Sushi Lomas Verdes",        zona: "EDOMEX", direccion: "Av. Tecnológico 890",          telefono: "+52 55 1111 0006" },
    { id: 23, nombre: "Mr. Sushi Tecamachalco",        zona: "EDOMEX", direccion: "Av. Tecnológico 890",          telefono: "+52 55 1111 0006" },
  
  ],


  menu: {
    "Entradas": [
      { nombre: "Edamame",              precio: 85,   descripcion: "Frijoles de soya al vapor con sal de mar" },
      { nombre: "Dumpling",             precio: 120,  descripcion: "Dumplings de cerdo y verduras, fritos o al vapor" },
      { nombre: "Chiles Tempura",       precio: 130,  descripcion: "Bolitas de pulpo con salsa takoyaki y mayonesa" },
      { nombre: "Edamames Spicy",       precio: 70,   descripcion: "Sopa de miso con tofu y alga wakame" },
    ],
    "Sushi Rolls": [
      { nombre: "California Atun",  precio: 160,  descripcion: "Cangrejo, aguacate y pepino (10 pzas)" },
      { nombre: "Spicy Tuna",       precio: 185,  descripcion: "Atún picante con sriracha (10 pzas)" },
      { nombre: "Mr. Dragon",      precio: 220,  descripcion: "Camarón tempura, aguacate y anguila (10 pzas)" },
      { nombre: "Tunagui",          precio: 250,  descripcion: "Tunagui cubierto de sashimi variado (10 pzas)" },
    ],
    "Ramen": [
      { nombre: "Ramen Bacon",       precio: 195,  descripcion: "Caldo con huevo" },
      { nombre: "Ramen Curry",       precio: 180,  descripcion: "Caldo pollo" },
      { nombre: "Ramen Coco",        precio: 185,  descripcion: "Caldo" },
      { nombre: "Ramen Mariscos ",   precio: 170,  descripcion: "Caldo" },
    ],
    "Platos Fuertes": [
      { nombre: "Chicken Teriyaki", precio: 185,  descripcion: "Pollo" },
      { nombre: "Tokyo Bowl",       precio: 195,  descripcion: "Milanesa" },
      { nombre: "Gohan Teriyaki",          precio: 290,  descripcion: "Arroz Gohan" },
      { nombre: "Sake Wake",         precio: 250,  descripcion: "Sake Wake platillo" },
    ],
    "Bebidas": [
      { nombre: "Refresco",  precio: 40,   descripcion: "Agua natural, mineral o refresco" },
    ],
    "Postres": [
      { nombre: "Bomba dulce de leche",   precio: 90,   descripcion: "" },
      { nombre: "Tapioca",precio: 95,   descripcion: "Con cafe" },
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
