// config/restaurante.js
// =============================================
// CONFIGURACIÓN DE MR. SUSHI
// Llena con tus datos reales
// =============================================

module.exports = {
  nombre: "Mr. Sushi",
  telefono_principal: "+52 55 XXXX XXXX",

  horario_general: {
    lunes:     { abre: "12:00", cierra: "22:00" },
    martes:    { abre: "12:00", cierra: "22:00" },
    miercoles: { abre: "12:00", cierra: "22:00" },
    jueves:    { abre: "12:00", cierra: "22:00" },
    viernes:   { abre: "12:00", cierra: "22:00" },
    sabado:    { abre: "12:00", cierra: "22:00" },
    domingo:   { abre: "13:00", cierra: "21:00" },
  },

  promociones_generales: [
    {
      nombre: "Barra Libre",
      descripcion: "Barra libre de bebidas incluida en tu orden",
      dias: ["miercoles", "jueves", "viernes", "sabado", "domingo"],
      hora_inicio: "18:00",
      hora_fin: "22:00",
      vigencia: "hasta_nuevo_aviso",
      aplica_a: "restaurante",
    },
  ],

  sucursales: [
    {
      id: 1,
      nombre: "Arboledas",
      tipo: "restaurante",
      zona: "EDOMEX",
      direccion: "Dirección real aquí",
      telefono: "+52 55 XXXX XX01",
      telefono_transferencia: "+52 55 XXXX XX01",
      whatsapp: "+52 55 XXXX XX01",
      horario_propio: null,
      promociones_propias: [],
    },
    {
      id: 2,
      nombre: "Lomas Verdes",
      tipo: "restaurante",
      zona: "EDOMEX",
      direccion: "Dirección real aquí",
      telefono: "+52 55 XXXX XX02",
      telefono_transferencia: "+52 55 XXXX XX02",
      whatsapp: "+52 55 XXXX XX02",
      horario_propio: null,
      promociones_propias: [],
    },
    {
      id: 3,
      nombre: "Atizapán",
      tipo: "fast_food",
      zona: "EDOMEX",
      direccion: "Dirección real aquí",
      telefono: "+52 55 XXXX XX03",
      telefono_transferencia: "+52 55 XXXX XX03",
      whatsapp: null,
      horario_propio: null,
      promociones_propias: [],
    },
    {
      id: 4,
      nombre: "Fuentes de Satélite",
      tipo: "restaurante",
      zona: "EDOMEX",
      direccion: "Dirección real aquí",
      telefono: "+52 55 XXXX XX04",
      telefono_transferencia: "+52 55 XXXX XX04",
      whatsapp: "+52 55 XXXX XX04",
      horario_propio: null,
      promociones_propias: [],
    },
    {
      id: 5,
      nombre: "Zona Azul Domicilio",
      tipo: "fast_food",
      zona: "EDOMEX",
      direccion: "Dirección real aquí",
      telefono: "+52 55 XXXX XX05",
      telefono_transferencia: "+52 55 XXXX XX05",
      whatsapp: null,
      horario_propio: null,
      promociones_propias: [],
    },
  ],

  menu: {
    "Entradas": [
      { nombre: "Edamames", precio: 75, descripcion: "Edamames al vapor con sal de mar" },
      { nombre: "Edamames Spicy", precio: 85, descripcion: "Edamames con salsa picante" },
    ],
    "Sushi Rolls": [
      { nombre: "California Roll", precio: 160, descripcion: "Cangrejo, aguacate y pepino" },
      { nombre: "California de Atún", precio: 175, descripcion: "Atún fresco, aguacate y pepino" },
      { nombre: "Roll Tropical", precio: 185, descripcion: "Camarón tempura, mango y aguacate" },
    ],
    "Ramen": [
      { nombre: "Ramen Tonkotsu", precio: 195, descripcion: "Caldo de cerdo, chashu, huevo y nori" },
      { nombre: "Ramen Miso", precio: 185, descripcion: "Caldo de miso, tofu, maíz y champiñones" },
    ],
    "Bebidas": [
      { nombre: "Agua natural", precio: 35, descripcion: "Agua embotellada 600ml" },
      { nombre: "Refresco", precio: 45, descripcion: "Coca-Cola, Sprite o Fanta" },
      { nombre: "Cerveza", precio: 75, descripcion: "Corona o Modelo" },
    ],
  },

  politicas: {
    reservaciones: "Con mínimo 2 horas de anticipación. Máximo 20 personas por reservación.",
    cancelaciones: "Cancelaciones sin cargo hasta 1 hora antes.",
    delivery: "Envío gratis a cualquier dirección. Sin restricciones de zona.",
    tiempo_espera_pedido: "30–40 minutos en hora pico.",
    tiempo_domicilio: "40 minutos aproximadamente.",
  },
};
