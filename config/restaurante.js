// config/restaurante.js
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
      dias: ["miercoles","jueves","viernes","sabado","domingo"],
      hora_inicio: "18:00",
      hora_fin: "22:00",
      vigencia: "hasta_nuevo_aviso",
      aplica_a: "restaurante",
    },
  ],

  sucursales: [
    { id:1,  nombre:"Vallejo",              tipo:"restaurante", zona:"CDMX",   direccion:"Dirección real aquí", telefono:"+52 55 XXXX XX01", telefono_transferencia:"+52 55 XXXX XX01", whatsapp:"+52 55 XXXX XX01", horario_propio:null, promociones_propias:[] },
    { id:2,  nombre:"Zona Esmeralda",       tipo:"restaurante", zona:"EDOMEX", direccion:"Dirección real aquí", telefono:"+52 55 XXXX XX02", telefono_transferencia:"+52 55 XXXX XX02", whatsapp:"+52 55 XXXX XX02", horario_propio:null, promociones_propias:[] },
    { id:3,  nombre:"Arboledas",            tipo:"restaurante", zona:"EDOMEX", direccion:"Dirección real aquí", telefono:"+52 55 XXXX XX03", telefono_transferencia:"+52 55 XXXX XX03", whatsapp:"+52 55 XXXX XX03", horario_propio:null, promociones_propias:[] },
    { id:4,  nombre:"Atizapán",             tipo:"fast_food",   zona:"EDOMEX", direccion:"Dirección real aquí", telefono:"+52 55 XXXX XX04", telefono_transferencia:"+52 55 XXXX XX04", whatsapp:null,               horario_propio:null, promociones_propias:[] },
    { id:5,  nombre:"Zona Azul Restaurante",tipo:"restaurante", zona:"EDOMEX", direccion:"Dirección real aquí", telefono:"+52 55 XXXX XX05", telefono_transferencia:"+52 55 XXXX XX05", whatsapp:"+52 55 XXXX XX05", horario_propio:null, promociones_propias:[] },
    { id:6,  nombre:"Mundo E",              tipo:"restaurante", zona:"EDOMEX", direccion:"Dirección real aquí", telefono:"+52 55 XXXX XX06", telefono_transferencia:"+52 55 XXXX XX06", whatsapp:"+52 55 XXXX XX06", horario_propio:null, promociones_propias:[] },
    { id:7,  nombre:"Zona Azul Domicilio",  tipo:"fast_food",   zona:"EDOMEX", direccion:"Dirección real aquí", telefono:"+52 55 XXXX XX07", telefono_transferencia:"+52 55 XXXX XX07", whatsapp:null,               horario_propio:null, promociones_propias:[] },
    { id:8,  nombre:"Perisur",              tipo:"fast_food",   zona:"CDMX",   direccion:"Dirección real aquí", telefono:"+52 55 XXXX XX08", telefono_transferencia:"+52 55 XXXX XX08", whatsapp:null,               horario_propio:null, promociones_propias:[] },
    { id:9,  nombre:"Lomas Verdes",         tipo:"fast_food",   zona:"EDOMEX", direccion:"Dirección real aquí", telefono:"+52 55 XXXX XX09", telefono_transferencia:"+52 55 XXXX XX09", whatsapp:null,               horario_propio:null, promociones_propias:[] },
    { id:10, nombre:"Delta",                tipo:"fast_food",   zona:"EDOMEX", direccion:"Dirección real aquí", telefono:"+52 55 XXXX XX10", telefono_transferencia:"+52 55 XXXX XX10", whatsapp:null,               horario_propio:null, promociones_propias:[] },
    { id:11, nombre:"Fuentes de Satélite",  tipo:"restaurante", zona:"EDOMEX", direccion:"Dirección real aquí", telefono:"+52 55 XXXX XX11", telefono_transferencia:"+52 55 XXXX XX11", whatsapp:"+52 55 XXXX XX11", horario_propio:null, promociones_propias:[] },
    { id:12, nombre:"Patriotismo",          tipo:"restaurante", zona:"CDMX",   direccion:"Dirección real aquí", telefono:"+52 55 XXXX XX12", telefono_transferencia:"+52 55 XXXX XX12", whatsapp:"+52 55 XXXX XX12", horario_propio:null, promociones_propias:[] },
    { id:13, nombre:"Hahha Azul",           tipo:"restaurante", zona:"EDOMEX", direccion:"Dirección real aquí", telefono:"+52 55 XXXX XX13", telefono_transferencia:"+52 55 XXXX XX13", whatsapp:"+52 55 XXXX XX13", horario_propio:null, promociones_propias:[] },
    { id:14, nombre:"Masaryk",              tipo:"restaurante", zona:"CDMX",   direccion:"Dirección real aquí", telefono:"+52 55 XXXX XX14", telefono_transferencia:"+52 55 XXXX XX14", whatsapp:"+52 55 XXXX XX14", horario_propio:null, promociones_propias:[] },
    { id:15, nombre:"Americana",            tipo:"restaurante", zona:"CDMX",   direccion:"Dirección real aquí", telefono:"+52 55 XXXX XX15", telefono_transferencia:"+52 55 XXXX XX15", whatsapp:"+52 55 XXXX XX15", horario_propio:null, promociones_propias:[] },
    { id:16, nombre:"Tecamachalco",         tipo:"restaurante", zona:"EDOMEX", direccion:"Dirección real aquí", telefono:"+52 55 XXXX XX16", telefono_transferencia:"+52 55 XXXX XX16", whatsapp:"+52 55 XXXX XX16", horario_propio:null, promociones_propias:[] },
    { id:17, nombre:"Coapa",                tipo:"fast_food",   zona:"CDMX",   direccion:"Dirección real aquí", telefono:"+52 55 XXXX XX17", telefono_transferencia:"+52 55 XXXX XX17", whatsapp:null,               horario_propio:null, promociones_propias:[] },
    { id:18, nombre:"Galerías Toluca",      tipo:"fast_food",   zona:"EDOMEX", direccion:"Dirección real aquí", telefono:"+52 55 XXXX XX18", telefono_transferencia:"+52 55 XXXX XX18", whatsapp:null,               horario_propio:null, promociones_propias:[] },
    { id:19, nombre:"Galerías Metepec",     tipo:"restaurante", zona:"EDOMEX", direccion:"Dirección real aquí", telefono:"+52 55 XXXX XX19", telefono_transferencia:"+52 55 XXXX XX19", whatsapp:"+52 55 XXXX XX19", horario_propio:null, promociones_propias:[] },
    { id:20, nombre:"Galerías Cuernavaca",  tipo:"fast_food",   zona:"MOR",    direccion:"Dirección real aquí", telefono:"+52 55 XXXX XX20", telefono_transferencia:"+52 55 XXXX XX20", whatsapp:null,               horario_propio:null, promociones_propias:[] },
    { id:21, nombre:"CC Santa Fe",          tipo:"fast_food",   zona:"CDMX",   direccion:"Dirección real aquí", telefono:"+52 55 XXXX XX21", telefono_transferencia:"+52 55 XXXX XX21", whatsapp:null,               horario_propio:null, promociones_propias:[] },
    { id:22, nombre:"Galerías Serdán",      tipo:"restaurante", zona:"PUE",    direccion:"Dirección real aquí", telefono:"+52 55 XXXX XX22", telefono_transferencia:"+52 55 XXXX XX22", whatsapp:"+52 55 XXXX XX22", horario_propio:null, promociones_propias:[] },
    { id:23, nombre:"Urban Center",         tipo:"restaurante", zona:"EDOMEX", direccion:"Dirección real aquí", telefono:"+52 55 XXXX XX23", telefono_transferencia:"+52 55 XXXX XX23", whatsapp:"+52 55 XXXX XX23", horario_propio:null, promociones_propias:[] },
    { id:24, nombre:"Hahha Esmeralda",      tipo:"restaurante", zona:"EDOMEX", direccion:"Dirección real aquí", telefono:"+52 55 XXXX XX24", telefono_transferencia:"+52 55 XXXX XX24", whatsapp:"+52 55 XXXX XX24", horario_propio:null, promociones_propias:[] },
    { id:25, nombre:"Patio Santa Fe",       tipo:"restaurante", zona:"CDMX",   direccion:"Dirección real aquí", telefono:"+52 55 XXXX XX25", telefono_transferencia:"+52 55 XXXX XX25", whatsapp:"+52 55 XXXX XX25", horario_propio:null, promociones_propias:[] },
  ],

  menu: {
    "Entradas": [
      { nombre: "Edamames", precio: 75, descripcion: "Edamames al vapor con sal de mar" },
      { nombre: "Edamames Spicy", precio: 85, descripcion: "Edamames con salsa picante" },
    ],
    "Sushi Rolls": [
      { nombre: "California Roll", precio: 160, descripcion: "Cangrejo, aguacate y pepino" },
      { nombre: "California de Atún", precio: 175, descripcion: "Atún fresco, aguacate y pepino" },
    ],
    "Ramen": [
      { nombre: "Ramen Tonkotsu", precio: 195, descripcion: "Caldo de cerdo, chashu, huevo y nori" },
      { nombre: "Ramen Miso", precio: 185, descripcion: "Caldo de miso, tofu, maíz y champiñones" },
    ],
    "Bebidas": [
      { nombre: "Agua natural", precio: 35, descripcion: "Agua embotellada 600ml" },
      { nombre: "Refresco", precio: 45, descripcion: "Coca-Cola, Sprite o Fanta" },
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
