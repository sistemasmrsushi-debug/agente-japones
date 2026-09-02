// config/restaurante.js
// =============================================
// CONFIGURACIÓN COMPLETA DE MR. SUSHI
// 25 sucursales reales + menú completo
// Promociones actualizadas: junio 2026
// =============================================

module.exports = {
  nombre: "Mr. Sushi",
  telefono_principal: "33 9427 2277",

  horario_general: {
    lunes:     { abre: "11:00", cierra: "22:00" },
    martes:    { abre: "11:00", cierra: "22:00" },
    miercoles: { abre: "11:00", cierra: "22:00" },
    jueves:    { abre: "11:00", cierra: "22:00" },
    viernes:   { abre: "11:00", cierra: "22:00" },
    sabado:    { abre: "11:00", cierra: "22:00" },
    domingo:   { abre: "11:00", cierra: "21:00" },
  },

  // ============================================================
  // MAPA DE ZONAS PARA ASIGNACIÓN DE DOMICILIO
  // Cada zona contiene palabras clave que el agente detecta
  // en la dirección del cliente para asignar la sucursal más cercana
  // ============================================================
  zonas_domicilio: [
    {
      sucursal: "Masaryk",
      keywords: ["polanco", "chapultepec", "lomas de chapultepec", "miguel hidalgo", "anzures", "granada", "irrigación", "del bosque", "hipódromo", "condesa", "roma norte", "roma sur", "cuauhtémoc", "doctores", "centro histórico", "tepito", "guerrero", "santa maría la ribera"],
    },
    {
      sucursal: "Vallejo",
      keywords: ["vallejo", "azcapotzalco", "clavería", "aguilera", "coltongo", "san álvaro", "pasteros", "tlalnepantla cdmx", "industrial vallejo", "pensador mexicano", "lindavista", "gustavo a madero", "indios verdes"],
    },
    {
      sucursal: "Americana",
      keywords: ["americana", "narvarte oriente", "del valle", "nochebuena", "portales", "iztapalapa", "iztacalco", "benito juárez", "nápoles", "mixcoac", "insurgentes sur"],
    },
    {
      sucursal: "Patriotismo",
      keywords: ["patriotismo", "san pedro de los pinos", "escandón", "tacubaya", "observatorio", "santa fe cdmx", "álvaro obregón", "axotla", "tlacopac", "florida"],
    },
    {
      sucursal: "Centro Santa Fe",
      keywords: ["santa fe", "contadero", "cuajimalpa", "zedec", "centro santa fe", "pedregal de san ángel", "pedregal", "san ángel", "loreto", "tizapán"],
    },
    {
      sucursal: "Coapa",
      keywords: ["coapa", "coyoacán", "tlalpan", "xochimilco", "pedregal de carrasco", "del carmen", "churubusco", "general anaya", "huipulco", "arenal", "tepepan"],
    },
    {
      sucursal: "Delta",
      keywords: ["delta", "tlalpan", "acoxpa", "pedregal de san nicolás", "san nicolás tetelco", "villa coapa", "fuentes de tepepan", "miguel hidalgo tlalpan"],
    },
    {
      sucursal: "Perisur",
      keywords: ["perisur", "narvarte", "insurgentes", "extremadura", "actipan", "del valle norte", "acacias", "xoco", "crédito constructor"],
    },
    {
      sucursal: "Hahha Azul",
      keywords: ["zona azul", "ciudad satélite", "satélite", "naucalpan", "lomas verdes naucalpan", "jardines de satélite", "bosques de satélite", "la florida", "prados del rosario", "san andrés atoto"],
    },
    {
      sucursal: "Zona Azul Restaurante",
      keywords: ["circumvalación", "circuito satélite", "boulevares", "villa satélite", "rinconada"],
    },
    {
      sucursal: "Fuentes de Satélite",
      keywords: ["fuentes de satélite", "jardines de satélite", "las fuentes", "bello horizonte", "frac satélite", "tlalnepantla norte"],
    },
    {
      sucursal: "Arboledas",
      keywords: ["arboledas", "las arboledas", "jiménez", "tlalnepantla", "san lucas tepetlacalco", "san javier", "cuatro vientos", "tlanepantla"],
    },
    {
      sucursal: "Mundo E",
      keywords: ["mundo e", "tepetlacalco", "san lucas", "acueducto de guadalupe", "barrientos", "tlalnepantla sur", "lechería"],
    },
    {
      sucursal: "Urban Center",
      keywords: ["urban center", "centro alta", "adolfo lópez mateos", "lago de guadalupe", "cuautitlán izcalli", "tepotzotlán", "tultitlán", "buenavista"],
    },
    {
      sucursal: "Satélite Anexo",
      keywords: ["tecamachalco", "la herradura", "lomas de tecamachalco", "lomas anahuac", "interlomas", "hacienda de las palmas", "huixquilucan"],
    },
    {
      sucursal: "Tecamachalco",
      keywords: ["tecamachalco centro", "lomas de chapultepec poniente", "palo solo", "bosque de las lomas", "naucalpan poniente"],
    },
    {
      sucursal: "Hahha Esmeralda",
      keywords: ["bosque esmeralda", "esmeralda", "atizapán esmeralda", "la palma", "prado esmeralda", "paseos de la herradura"],
    },
    {
      sucursal: "Zona Esmeralda",
      keywords: ["zona esmeralda", "valdecasas", "la aurora", "san mateo", "villas del sol", "atizapán norte"],
    },
    {
      sucursal: "Lomas Verdes",
      keywords: ["lomas verdes", "colinas de la gran torre", "bello horizonte atizapán", "villa del real", "rinconada de los alamos", "valle san pedro"],
    },
    {
      sucursal: "Atizapán",
      keywords: ["atizapán", "ruiz cortínez", "lomas de atizapán", "prado churubusco", "la presa", "la estadía", "las margaritas", "santiago cuautlalpan"],
    },
    {
      sucursal: "Galerías Metepec",
      keywords: ["metepec", "toluca", "galerías metepec", "san jerónimo chicahualco", "san salvador tizatlali", "conjunto urbano bicentenario"],
    },
    {
      sucursal: "Galerías Toluca",
      keywords: ["galerías toluca", "toluca centro", "zinacantepec", "almoloya", "san mateo atenco", "lerma", "ocoyoacac"],
    },
    {
      sucursal: "Galerías Serdán",
      keywords: ["puebla", "serdán", "hermanos serdán", "rancho hermoso", "angelópolis", "cholula", "san andrés cholula"],
    },
    {
      sucursal: "Cuernavaca",
      keywords: ["cuernavaca", "morelos", "flores magón", "temixco", "jiutepec", "emiliano zapata morelos"],
    },
  ],

  // ============================================================
  // PROMOCIONES ACTIVAS 2026
  // ============================================================
  promociones_generales: [
    {
      nombre: "Barra Libre de Sushi",
      descripcion: "Come sushi ilimitado por $297 por persona.",
      precio: 297,
      dias: ["miercoles", "jueves", "viernes", "sabado"],
      hora_inicio: "18:00",
      hora_fin: "22:30",
      vigencia: "hasta_nuevo_aviso",
      aplica_a: "restaurante",
      notas: "Solo en restaurante/híbrido. NO aplica en Fast Food ni delivery.",
    },
    {
      nombre: "Coctelería 2x1",
      descripcion: "Pide 2 cócteles y paga solo 1.",
      precio: null,
      dias: ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"],
      hora_inicio: "13:00",
      hora_fin: "22:30",
      hora_fin_domingo: "22:00",
      vigencia: "hasta_nuevo_aviso",
      aplica_a: "restaurante",
      notas: "Lun–Sáb hasta 22:30, Dom hasta 22:00. Solo en restaurante/híbrido. NO aplica en Fast Food.",
    },
    {
      nombre: "Lunch Box",
      descripcion: "Elige 1 entrada + 1 arroz + 1 rollo + 1 agua por $197. Solo 1 alimento por categoría, extras se cobran aparte.",
      precio: 197,
      dias: ["lunes", "martes", "miercoles", "jueves"],
      hora_inicio: "12:00",
      hora_fin: "22:00",
      vigencia: "hasta_nuevo_aviso",
      aplica_a: "todos",
      notas: "Lun–Jue todo el día. Aplica en restaurante y Fast Food.",
      opciones: {
        entrada: ["Edamames Asados", "Kushiague de Queso (1 pza)", "Kushiague de Plátano/Queso (1 pza)"],
        arroz:   ["Yakimeshi Verduras", "Gohan Clásico"],
        rollo:   ["Tuna King", "Spicy Tuna", "Mr. Fura", "Tampico Maki Especial", "Mr. Manchego", "Mr. Kakiague", "Tempura Maki", "Tunagui", "Filadelfia Atún", "Filadelfia Cangrejo", "Filadelfia Camarón", "California Atún", "California Cangrejo", "California Camarón", "Avocado Maki Atún", "Avocado Maki Cangrejo", "Avocado Maki Camarón"],
        agua:    ["Agua Maracuyá/Mango", "Agua Pepino con Limón"],
      },
    },
    {
      nombre: "Mr. 4x4",
      descripcion: "Elige 4 medios rollos. $217 todos los días, $199 solo los martes.",
      precio_normal: 217,
      precio_martes: 199,
      dias: ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"],
      hora_inicio: "12:00",
      hora_fin: "22:00",
      vigencia: "hasta_nuevo_aviso",
      aplica_a: "todos",
      notas: "Todos los días en restaurante y Fast Food. Los martes precio especial $199.",
    },
  ],

  sucursales: [
    { id:1,  nombre:"Americana",            tipo:"restaurante", zona:"CDMX",   direccion:"Col. Americana, Cto. Américas No. 2031", telefono:"55 5378 0625", telefono_transferencia:"55 5378 0625", whatsapp:"+52 55 5378 0625", horario_propio:null, promociones_propias:[] },
    { id:2,  nombre:"Arboledas",            tipo:"restaurante", zona:"EDOMEX", direccion:"Fracc. Las Arboledas, Av. Jiménez No. 60 Locales 3 y 7, Tlalnepantla, Edo. De Méx. 54028", telefono:"55 5370 7647", telefono_transferencia:"55 5370 7647", whatsapp:"+52 55 5370 7647", horario_propio:null, promociones_propias:[] },
    { id:3,  nombre:"Atizapán",             tipo:"fast_food",   zona:"EDOMEX", direccion:"Fracc. Lomas de Atizapán, Av. Ruiz Cortínez No. 295 Local 365, Atizapán de Z., Edo. de Méx. 52977", telefono:"55 1669 9047 / 55 1669 9198", telefono_transferencia:"55 1669 9047", whatsapp:null, horario_propio:null, promociones_propias:[] },
    { id:4,  nombre:"Call Center",          tipo:"fast_food",   zona:"EDOMEX", direccion:"Atizapán de Z., Edo. de Méx. 52977", telefono:"55 6291 5401", telefono_transferencia:"55 6291 5401", whatsapp:null, horario_propio:null, promociones_propias:[] },
    { id:5,  nombre:"Fuentes de Satélite",  tipo:"restaurante", zona:"EDOMEX", direccion:"Col. Jardines de Satélite, No. 1 Locales 8-10, Tlalnepantla, Edo. De Méx.", telefono:"55 5572 8868 / 55 5572 8889 / 55 5572 7219", telefono_transferencia:"55 5572 8868", whatsapp:"+52 55 5572 8868", horario_propio:null, promociones_propias:[] },
    { id:6,  nombre:"Centro Santa Fe",      tipo:"fast_food",   zona:"CDMX",   direccion:"Col. Antigua Mina La Trinidad, Col. Vasco de Quiroga No. 3800 L-715, Álvaro Obregón, CDMX 01210", telefono:"55 2167 8563", telefono_transferencia:"55 2167 8563", whatsapp:null, horario_propio:null, promociones_propias:[] },
    { id:7,  nombre:"Coapa",                tipo:"fast_food",   zona:"CDMX",   direccion:"Calle. Del Hueso No. 519 L-417, Coyoacán, CDMX", telefono:"55 1741 6734", telefono_transferencia:"55 1741 6734", whatsapp:null, horario_propio:null, promociones_propias:[] },
    { id:8,  nombre:"Cuernavaca",           tipo:"fast_food",   zona:"MOR",    direccion:"Km. 87.5 Autopista Méx.-Acap. L-208, Col. Galerías Cuernavaca, Col. Flores Magón, Cuernavaca, Mor.", telefono:"777 315 9917", telefono_transferencia:"777 315 9917", whatsapp:null, horario_propio:null, promociones_propias:[] },
    { id:9,  nombre:"Delta",                tipo:"fast_food",   zona:"EDOMEX", direccion:"Col. Residencial Acoxpa, Alcaldía Tlalpan, CDMX", telefono:"55 1741 6734", telefono_transferencia:"55 1741 6734", whatsapp:null, horario_propio:null, promociones_propias:[] },
    { id:10, nombre:"Hahha Azul",           tipo:"restaurante", zona:"EDOMEX", direccion:"Cto. Circumvalación Poniente 16 L-R, Ciudad Satélite Zona Azul, Naucalpan, Méx. 53100", telefono:"55 5393 0232 / 55 5572 3088", telefono_transferencia:"55 5393 0232", whatsapp:"+52 55 5393 0232", horario_propio:null, promociones_propias:[] },
    { id:11, nombre:"Hahha Esmeralda",      tipo:"restaurante", zona:"EDOMEX", direccion:"Col. Fracc. Bosque Esmeralda, Atizapán de Z., Edo. De Méx. 52930", telefono:"55 5572 2086", telefono_transferencia:"55 5572 2086", whatsapp:"+52 55 5572 2086", horario_propio:null, promociones_propias:[] },
    { id:12, nombre:"Lomas Verdes",         tipo:"fast_food",   zona:"EDOMEX", direccion:"Col. Colinas de la Gran Torre, Atizapán de Zaragoza, Edo. Méx. 52920", telefono:"55 1443 0136 / 55 5393 3000", telefono_transferencia:"55 1443 0136", whatsapp:null, horario_propio:null, promociones_propias:[] },
    { id:13, nombre:"Masaryk",              tipo:"restaurante", zona:"CDMX",   direccion:"Col. Polanco, Alcaldía Miguel Hidalgo, 11560, CDMX", telefono:"55 5280 5481 / 55 5280 7614", telefono_transferencia:"55 5280 5481", whatsapp:"+52 55 5280 5481", horario_propio:null, promociones_propias:[] },
    { id:14, nombre:"Galerías Metepec",     tipo:"restaurante", zona:"EDOMEX", direccion:"Blvd. Manuel Ávila Camacho # 1007, Centro Comercial 'Mundo E', Metepec, Estado de México 52102", telefono:"722 232 6836 / 722 232 0464", telefono_transferencia:"722 232 6836", whatsapp:"+52 722 232 6836", horario_propio:null, promociones_propias:[] },
    { id:15, nombre:"Mundo E",              tipo:"restaurante", zona:"EDOMEX", direccion:"Col. San Lucas Tepetlacalco, Tlalnepantla, Edo. De México 54095", telefono:"55 9105 2073 / 55 9105 2012", telefono_transferencia:"55 9105 2073", whatsapp:"+52 55 9105 2073", horario_propio:null, promociones_propias:[] },
    { id:16, nombre:"Patriotismo",          tipo:"restaurante", zona:"CDMX",   direccion:"Av. Patriotismo No. 229 Local R-03, Col. San Pedro de Los Pinos, CDMX", telefono:"55 5271 8286 / 55 5271 8158", telefono_transferencia:"55 5271 8286", whatsapp:"+52 55 5271 8286", horario_propio:null, promociones_propias:[] },
    { id:17, nombre:"Perisur",              tipo:"fast_food",   zona:"CDMX",   direccion:"C.C. Metrópoli Patriotismo, Alcaldía Benito Juárez, Col. Narvarte Poniente, Local RA-10 y RA-10B Tercer Piso, CDMX", telefono:"55 5035 5989 / 55 6035 5984", telefono_transferencia:"55 5035 5989", whatsapp:null, horario_propio:null, promociones_propias:[] },
    { id:18, nombre:"Galerías Serdán",      tipo:"restaurante", zona:"PUE",    direccion:"Puebla, Pue. 72000, Col. Rancho Hermoso, Galerías Serdán, Col. Hermanos Serdán a 170 L-129", telefono:"222 622 4266 / 222 290 4481", telefono_transferencia:"222 622 4266", whatsapp:"+52 222 622 4266", horario_propio:null, promociones_propias:[] },
    { id:19, nombre:"Zona Azul Restaurante",tipo:"fast_food",   zona:"EDOMEX", direccion:"Circuito Circumvalación Poniente 16, Ciudad Satélite Zona Azul, Naucalpan 53100, Local S", telefono:"55 5572 9809 / 55 5572 3087", telefono_transferencia:"55 5572 9809", whatsapp:null, horario_propio:null, promociones_propias:[] },
    { id:20, nombre:"Satélite Anexo",       tipo:"fast_food",   zona:"EDOMEX", direccion:"Av. De Las Fuentes No. 28, Col. Tecamachalco, Edo. De México 53100, Local N", telefono:"55 5572 3336 / 55 5572 9809", telefono_transferencia:"55 5572 3336", whatsapp:null, horario_propio:null, promociones_propias:[] },
    { id:21, nombre:"Tecamachalco",         tipo:"restaurante", zona:"EDOMEX", direccion:"Centro Comercial 'Galerías Toluca', Paseo Tollocan Esa. 11 De Mayo, Col. Santa Ana Tlapaltitlan", telefono:"55 5253 0194 / 55 5569 2653 / 55 5569 0469", telefono_transferencia:"55 5253 0194", whatsapp:"+52 55 5253 0194", horario_propio:null, promociones_propias:[] },
    { id:22, nombre:"Galerías Toluca",      tipo:"fast_food",   zona:"EDOMEX", direccion:"Dulce, Edo. De México 50140, Centro Comercial, Galerías Toluca", telefono:"33 1655 1487", telefono_transferencia:"33 1655 1487", whatsapp:null, horario_propio:null, promociones_propias:[] },
    { id:23, nombre:"Urban Center",         tipo:"restaurante", zona:"EDOMEX", direccion:"Av. Adolfo López Sur No. 7000 Local 3, Centro Alta, Centro Comercial Urban Center, Tlalnepantla", telefono:"55 6310 7134", telefono_transferencia:"55 6310 7134", whatsapp:"+52 55 6310 7134", horario_propio:null, promociones_propias:[] },
    { id:24, nombre:"Vallejo",              tipo:"restaurante", zona:"CDMX",   direccion:"Alcaldía Azcapotzalco, Col. Clavería, Calle Talavera 14, Colonia Via Vallejo, CDMX", telefono:"55 5308 2457 / 55 5308 2250 / 55 5308 2206", telefono_transferencia:"55 5308 2457", whatsapp:"+52 55 5308 2457", horario_propio:null, promociones_propias:[] },
    { id:25, nombre:"Zona Esmeralda",       tipo:"restaurante", zona:"EDOMEX", direccion:"Azcapotzalco de Z., Col. Valdecasas Condominio No. 113-A, Atizapán de Z., Edo. De México 52937", telefono:"55 5008 2001", telefono_transferencia:"55 5008 2001", whatsapp:"+52 55 5008 2001", horario_propio:null, promociones_propias:[] },
  ],

  menu: {
    "Sushi 2x1": [
      { nombre:"Sushi Tunagui", precio:249, descripcion:"Rollo cubierto de masago y ajonjolí, relleno de atún, aguacate, pepino y salsa de anguila. Fresco, cremoso y con un toque dulce y marino." },
      { nombre:"Sushi Tuna King", precio:269, descripcion:"Rollo cubierto de aguacate y láminas de chile tempurizado. Relleno de atún con salsa ra-yu y sriracha. Intenso, picante y con textura crujiente." },
      { nombre:"Sushi Tempura Maki", precio:249, descripcion:"Rollo cubierto de queso crema, chile toreado y costra de tempura. Relleno de cangrejo, aguacate y kakiage. Cremoso, dorado y con un toque picante." },
      { nombre:"Sushi Mr. Kakiage", precio:249, descripcion:"Rollo cubierto de verduras tempura con salsa tipo bbq, relleno de cangrejo, queso crema y aguacate. Crujiente, cremoso y con un toque dulce japonés." },
      { nombre:"Sushi Kani Maki", precio:259, descripcion:"Rollo cubierto de cangrejo (kani), con relleno de queso crema, aguacate y pepino. Fresco, suave y con el toque cremoso tradicional." },
      { nombre:"Sushi Mr. Tampico Habanero", precio:269, descripcion:"Rollo cubierto de tampico habanero, relleno de cangrejo, queso crema, aguacate y kakiage rojo. Cremoso, picante y con un toque vegetal crujiente." },
      { nombre:"Sushi Avocado Teriyaki", precio:269, descripcion:"Rollo cubierto de aguacate con salsa teriyaki, relleno de pollo empanizado y zanahoria. Crujiente, dulce y con un toque fresco." },
      { nombre:"Sushi Spicy Tuna", precio:279, descripcion:"Rollo cubierto de ajonjolí negro y salsa teriyaki picante, relleno de atún asado, queso crema, aguacate, kakiage y chiles toreados. Intenso, cremoso y con buen picor." },
      { nombre:"Sushi Mr. Tempura", precio:289, descripcion:"Rollo cubierto de queso manchego capeado y bañado en salsa chipotle. Relleno de cangrejo, aguacate y queso crema. Cremoso, crujiente y con toque ahumado." },
      { nombre:"Sushi Blue Cheese", precio:269, descripcion:"Rollo cubierto de costra empanizada y bañado en salsa de blue cheese con ajo, relleno de arrachera asada, aguacate y queso crema, terminado con cebollín fresco." },
      { nombre:"Sushi Hot Mango", precio:215, descripcion:"Rollo cubierto de arroz sabor mango, bañado en salsa de mango con masago y láminas de chile serrano tempurizado. Relleno de piña, kanikama, aguacate y queso crema." },
    ],
    "Combos": [
      { nombre:"Combo Mr. 4x4", precio:217, descripcion:"Arma tu combo con 4 medios rollos a elegir entre 18 opciones. Ideal para compartir, probar tus favoritos o descubrir nuevos sabores." },
      { nombre:"Combo Lunch Box", precio:197, descripcion:"Arma tu Lunch Box con una entrada, arroz, rollo y agua a elegir. Un combo completo, práctico y balanceado para disfrutar en cualquier momento del día." },
    ],
    "Sushi Box": [
      { nombre:"Sushi Box Clásico", precio:750, descripcion:"Charola con 6 rollos para compartir: California Atún, Mr. Ebi, Mr. Tampico, Mr. Kakiague, Queso Maki Fry y Filadelfia Salmón. ¡Variedad clásica en cada bocado!" },
      { nombre:"Sushi Box Light", precio:580, descripcion:"Charola con 4 rollos y 2 entradas: Salad Maki, Carussel Maki Vegetariano, Kiuri Maki Salmón y Avocado Vegetariano. Incluye edamames y 4 nigiris de aguacate. ¡Ligero, fresco y delicioso!" },
      { nombre:"Sushi Box Tropical", precio:825, descripcion:"Charola con 6 rollos inspirados en sabores frutales y picantes: Mr. Dragon, Mr. Keko, Red Dragón, Piña Spicy, California Maki Salmón y Avocado Maki Vegetariano. ¡Fresco, atrevido y lleno de sabor!" },
      { nombre:"Sushi Box Tuna Sake", precio:950, descripcion:"Charola con 4 rollos y 8 nigiris para amantes del atún y salmón: Sake Maki, Tuna Maki, Tuna Cajun y Mr. Diablo. Incluye 4 nigiris de atún y 4 de salmón fresco. ¡Perfecto para los que saben lo que quieren!" },
      { nombre:"Entrada Box", precio:699, descripcion:"Charola con 5 entradas ideales para compartir: 4 Kushiagues de queso, 4 Kushiagues de plátano con queso, dumplings vegetales fritos, chiles tempura y edamames asados. ¡Puro antojo desde el primer bocado!" },
    ],
    "Entradas": [
      { nombre:"Edamames Asados", precio:110, descripcion:"Vainas de soya asadas a la perfección y sazonadas con sal de mar. Una botana ligera, natural y llena de sabor para abrir el apetito o acompañar tu rollo favorito." },
      { nombre:"Edamames Spicy", precio:169, descripcion:"Vainas de soya asadas y bañadas en nuestra salsa spicy de la casa. Un toque picante que acompaña perfecto cualquier rollo o entrada ligera." },
      { nombre:"Chiles Tempura", precio:155, descripcion:"Jalapeños empanizados al estilo tempura, rellenos de queso crema y kanikama. Servidos con salsa kushiague. Una entrada crujiente y sabrosa con un toque picante balanceado." },
      { nombre:"Dumplings de Vegetales", precio:137, descripcion:"Ravioles orientales al vapor rellenos de vegetales salteados. Una opción ligera, vegetal y sabrosa que acompaña muy bien cualquier plato principal." },
      { nombre:"Dumplings de Vegetales Fritos", precio:137, descripcion:"Ravioles orientales fritos y crujientes, rellenos de vegetales salteados. Entrada con textura dorada y sabor vegetal que combina con todo." },
      { nombre:"Dumplings de Cerdo", precio:137, descripcion:"Ravioles orientales al vapor rellenos de lomo de cerdo sazonado. Suaves, sabrosos y perfectos como entrada o acompañamiento." },
      { nombre:"Dumplings de Cerdo Fritos", precio:137, descripcion:"Ravioles orientales fritos y crujientes, rellenos de lomo de cerdo. Entrada con sabor intenso y textura dorada que va bien con cualquier plato." },
    ],
    "Hand Rolls": [
      { nombre:"Tampico Especial Hand Roll", precio:107, descripcion:"Hand roll con alga marina, arroz avinagrado, tampico, aguacate y masago." },
      { nombre:"Kai Hand Roll Salmón", precio:107, descripcion:"Hand roll con alga marina, arroz avinagrado, salmón, aguacate, salsa BBQ y ajonjolí." },
      { nombre:"Kai Hand Roll Atún", precio:107, descripcion:"Hand roll con alga marina, arroz avinagrado, atún, aguacate, salsa BBQ y ajonjolí." },
      { nombre:"Diavolo Hand Roll", precio:107, descripcion:"Hand roll con alga marina, arroz avinagrado, camarón tempurizado, aguacate y salsa diablo." },
    ],
    "Sopas": [
      { nombre:"Sopa Miso", precio:85, descripcion:"Clásico caldo japonés a base de miso y soya, servido con cubos de tofu suave, algas marinas hidratadas y cebollín fresco. Ligera, reconfortante y perfecta para abrir el apetito." },
      { nombre:"Sopa T-Udon", precio:149, descripcion:"Caldo ligero con fideos udon, acompañado de verduras y camarón tempurizados. Una combinación sabrosa con textura suave y crujiente en cada bocado." },
      { nombre:"Sopa Coco Ramen", precio:235, descripcion:"Ramen en caldo suave de coco, acompañado de pollo, huevo cocido. Un ramen diferente, aromático y con un sabor ligeramente dulce." },
      { nombre:"Sopa Ramen Bacon", precio:245, descripcion:"Ramen tradicional en caldo japonés, con tocineta ahumada, huevo cocido, espinaca y toque de aceite de ajonjolí. Sabores intensos y reconfortantes en cada cucharada." },
      { nombre:"Sopa Ramen Curry", precio:235, descripcion:"Ramen en caldo con toque de curry, acompañado de brocheta de pollo, espinaca fresca, alga marina y manzana empanizada. Una mezcla original entre lo especiado y lo dulce." },
    ],
    "Brochetas Kushiagues": [
      { nombre:"Kushiague de Queso", precio:185, descripcion:"Brochetas empanizadas rellenas de queso fundido. Crujientes por fuera, suaves por dentro. Porción de 3 piezas, ideales como entrada o para compartir." },
      { nombre:"Kushiague de Plátano", precio:159, descripcion:"Brochetas empanizadas rellenas de queso fundido y plátano. Una combinación dulce y salada con textura crujiente. Porción de 3 piezas." },
      { nombre:"Kushiague de Camarón", precio:215, descripcion:"Brochetas empanizadas rellenas de camarón y queso fundido. Doradas, jugosas y con un toque marino cremoso. Porción de 3 piezas." },
      { nombre:"Kushiague de Cangrejo", precio:210, descripcion:"Brochetas empanizadas rellenas de queso fundido y kani. Crujientes por fuera, suaves por dentro. Porción de 3 piezas, perfectas como entrada caliente." },
      { nombre:"Combo Kushiague", precio:289, descripcion:"Charola con 6 brochetas empanizadas: 2 de queso, 2 de camarón con queso y 2 de cangrejo con queso. Crujientes, doradas y listas para compartir." },
    ],
    "Ensaladas": [
      { nombre:"Ensalada Tuna Yuzu", precio:269, descripcion:"Atún sellado sobre lechugas mixtas, con láminas de aguacate, jitomate cherry y un toque de flores comestibles. Bañada en vinagreta soya. Fresca y equilibrada." },
      { nombre:"Ensalada Mango Salad", precio:219, descripcion:"Cubos de salmón fresco y mango sobre cama de pepino rallado, con ajonjolí tostado y aderezo de miel. Ligera, frutal y con un toque dulce perfecto." },
    ],
    "Arroz": [
      { nombre:"Yakimeshi Camarón", precio:150, descripcion:"Arroz salteado al estilo japonés con camarones y verduras mixtas. Un clásico lleno de sabor, ideal como plato principal o acompañamiento." },
      { nombre:"Yakimeshi Mixto", precio:154, descripcion:"Arroz salteado al estilo japonés con pollo, res, camarones y verduras mixtas. Una combinación completa y sabrosa para quienes lo quieren todo." },
      { nombre:"Yakimeshi Arrachera", precio:145, descripcion:"Arroz salteado al estilo japonés con tiras de arrachera y verduras mixtas. Una opción contundente, sabrosa y perfecta como plato fuerte." },
      { nombre:"Yakimeshi Verduras", precio:97, descripcion:"Arroz salteado al estilo japonés con verduras mixtas. Ligero, sabroso y lleno de color. Ideal como opción vegetariana o acompañamiento." },
      { nombre:"Arroz Gohan", precio:69, descripcion:"Arroz japonés al vapor, de textura suave y neutra. Acompañamiento clásico que combina con cualquier platillo." },
      { nombre:"Arroz Chaufa", precio:137, descripcion:"Arroz frito al estilo asiático con pollo, camarón y pimientos, sazonado con jengibre, ajo, salsa de soya y aceite de ajonjolí." },
    ],
    "Rollos Tradicionales": [
      { nombre:"Sushi Tuna Maki", precio:207, descripcion:"Rollo cubierto de láminas de atún fresco, con relleno de queso crema, aguacate y pepino. Una combinación clásica, suave y balanceada." },
      { nombre:"Sushi Unagui Maki", precio:315, descripcion:"Rollo cubierto de anguila glaseada, con relleno de queso crema, aguacate y pepino. Dulce, cremoso y con el toque ahumado clásico de la unagi." },
      { nombre:"Sushi Ebi Maki", precio:215, descripcion:"Rollo cubierto de camaron y relleno de queso, aguacate y pepino" },
      { nombre:"Sushi Kani Maki", precio:215, descripcion:"Rollo cubierto de cangrejo (kani), con relleno de queso crema, aguacate y pepino. Fresco, suave y con el toque cremoso tradicional." },
      { nombre:"Sushi Queso Maki Atún", precio:167, descripcion:"Rollo envuelto en queso crema, relleno de atún, aguacate y pepino, con toque de ajonjolí. Cremoso, fresco y con equilibrio en cada bocado." },
      { nombre:"Sushi Queso Maki Camarón", precio:167, descripcion:"Rollo envuelto en queso crema, relleno de camarón cocido, aguacate y pepino, con ajonjolí tostado. Suave, cremoso y con un toque de frescura." },
      { nombre:"Sushi Queso Maki Salmón", precio:167, descripcion:"Rollo envuelto en queso crema, relleno de salmón, aguacate y pepino, con ajonjolí tostado. Cremoso, equilibrado y con el sabor fresco del mar." },
      { nombre:"Sushi California Maki Atún", precio:155, descripcion:"Rollo envuelto en arroz con ajonjolí, relleno de atún fresco, aguacate, queso crema y pepino. Suave, balanceado y perfecto para cualquier ocasión." },
      { nombre:"Sushi California Maki Salmón", precio:155, descripcion:"Rollo envuelto en arroz con ajonjolí, relleno de salmón fresco, aguacate, queso crema y pepino. Fresco, cremoso y con un toque clásico." },
      { nombre:"Sushi California Maki Camarón", precio:155, descripcion:"Rollo envuelto en arroz con ajonjolí, relleno de camarón cocido, aguacate, queso crema y pepino. Ligero, suave y con un sabor que siempre funciona." },
      { nombre:"Sushi Filadelfia Maki Atún", precio:147, descripcion:"Rollo envuelto en alga nori, relleno de atún y queso crema. Una combinación suave, cremosa y fresca con el toque clásico del Filadelfia." },
      { nombre:"Sushi Filadelfia Maki Camarón", precio:147, descripcion:"Rollo envuelto en alga nori, relleno de camarón cocido, queso crema. Cremoso, equilibrado y con el toque tradicional que nunca falla." },
      { nombre:"Sushi Filadelfia Maki Salmón", precio:147, descripcion:"Rollo envuelto en alga nori, relleno de salmón, queso crema. Suave, cremoso y con un sabor fresco y clásico." },
      { nombre:"Sushi Avocado Maki Atún", precio:165, descripcion:"Rollo envuelto en láminas de aguacate, relleno de atún, queso crema y pepino, con ajonjolí tostado. Cremoso, fresco y visualmente atractivo." },
      { nombre:"Sushi Avocado Maki Camarón", precio:165, descripcion:"Rollo envuelto en láminas de aguacate, relleno de camarón cocido, queso crema y pepino, con ajonjolí tostado. Suave, cremoso y lleno de frescura." },
      { nombre:"Sushi Avocado Maki Salmón", precio:165, descripcion:"Rollo envuelto en láminas de aguacate, relleno de salmón, queso crema y pepino, con ajonjolí tostado. Cremoso, fresco y con un toque equilibrado." },
    ],
    "Rollos Especialidades": [
      { nombre:"Sushi Spicy Tuna", precio:210, descripcion:"Rollo cubierto de ajonjolí negro y salsa teriyaki picante, relleno de atún asado, queso crema, aguacate, kakiage y chiles toreados. Intenso, cremoso y con buen picor." },
      { nombre:"Sushi Garlic Tuna", precio:225, descripcion:"Rollo cubierto con atún fresco, bañado en soya con ajo y topping de limón eureka. Relleno de camarón tempura y aguacate. Fresco, cítrico y con un toque crujiente." },
      { nombre:"Sushi Mr. Tampico Habanero", precio:177, descripcion:"Rollo cubierto de tampico habanero, relleno de cangrejo, queso crema, aguacate y kakiage rojo. Cremoso, picante y con un toque vegetal crujiente." },
      { nombre:"Sushi Mr. Dragon", precio:220, descripcion:"Rollo cubierto con mango, aguacate, salsa tipo Bbq y un toque de shichimi. Relleno de camarón empanizado, queso crema y aguacate. Dulce, picante y crujiente." },
      { nombre:"Sushi Mr. Tempura", precio:199, descripcion:"Rollo cubierto de queso manchego capeado y bañado en salsa chipotle. Relleno de cangrejo, aguacate y queso crema. Cremoso, crujiente y con toque ahumado." },
      { nombre:"Sushi Mr. Kakiage", precio:220, descripcion:"Rollo cubierto de verduras tempura con salsa tipo bbq, relleno de cangrejo, queso crema y aguacate. Crujiente, cremoso y con un toque dulce japonés." },
      { nombre:"Sushi Red Dragon", precio:225, descripcion:"Rollo cubierto de atún, aguacate, chipotle y burbujas tempura. Relleno de camarón empanizado, aguacate, queso crema y más burbujas tempura. Intenso, crujiente y adictivo." },
      { nombre:"Sushi Mr. Tampico", precio:177, descripcion:"Rollo cubierto de tampico, relleno de cangrejo, queso crema, aguacate, chile y kakiage. Cremoso, ligeramente picante y con un toque crujiente." },
      { nombre:"Sushi Mr. Ebi", precio:210, descripcion:"Rollo empanizado cubierto de camaron con salsa de chipotle, relleno de pepino, queso crema y aguacate" },
      { nombre:"Sushi Queso Maki Fry", precio:195, descripcion:"Rollo cubierto de queso crema con tampico, relleno de camarón empanizado, aguacate y pepino. Crujiente, cremoso y con sabor equilibrado." },
      { nombre:"Sushi Mr. Keko", precio:237, descripcion:"Rollo cubierto de salmón y queso crema, relleno de aguacate, pepino y más queso crema. Suave, cremoso y con un toque fresco en cada bocado." },
      { nombre:"Sushi Mr. Tam Beef", precio:230, descripcion:"Rollo cubierto de empanizado crujiente, aguacate y tampico. Relleno de filete de res, queso crema y aguacate. Sustancioso, cremoso y con textura dorada." },
      { nombre:"Sushi Avocado Teriyaki", precio:197, descripcion:"Rollo cubierto de aguacate con salsa teriyaki, relleno de pollo empanizado y zanahoria. Crujiente, dulce y con un toque fresco." },
      { nombre:"Sushi Mr. Mango", precio:195, descripcion:"Rollo cubierto de mango y salsa especial de la casa, relleno de cangrejo, queso crema y aguacate. Dulce, cremoso y con un toque tropical." },
      { nombre:"Sushi Baby Maki", precio:187, descripcion:"Rollo cubierto de pasta de baby squid con salsa estilo bbq, relleno de queso crema, aguacate y pepino. Suave, marino y con un toque dulce japonés." },
      { nombre:"Sushi Mr. Diablo", precio:337, descripcion:"Rollo cubierto de salmón fresco, salsa diablo y mayonesa. Relleno de camarón empanizado, queso crema y aguacate. Ahumado, picante y cremoso." },
      { nombre:"Sushi Piña Spicy", precio:175, descripcion:"Rollo cubierto de aguacate con topping de salsa de piña picante. Relleno de camarón tempura, queso crema y pepino. Dulce, picante y crujiente." },
      { nombre:"Mr. Manchego", precio:195, descripcion:"Rollo cubierto de queso manchego empanizado, relleno de cangrejo, queso crema, aguacate, kakiage y chile. Crujiente, cremoso y con un toque picante." },
      { nombre:"Sushi Avocado Habanero", precio:197, descripcion:"Rollo cubierto de aguacate, tampico habanero y masago. Relleno de camarón tempura y kakiage. Picante, crujiente y con un toque fresco y cremoso." },
      { nombre:"Sushi Tsunami", precio:185, descripcion:"Rollo cubierto de salmón, aguacate, tampico, cebollín y salsa soya BBQ. Relleno de cangrejo empanizado con queso crema. Intenso, cremoso y con gran contraste." },
      { nombre:"Sushi Tunagui", precio:197, descripcion:"Rollo cubierto de masago y ajonjolí, relleno de atún, aguacate, pepino y salsa de anguila. Fresco, cremoso y con un toque dulce y marino." },
      { nombre:"Sushi Tuna King", precio:225, descripcion:"Rollo cubierto de aguacate y láminas de chile tempurizado. Relleno de atún con salsa ra-yu y sriracha. Intenso, picante y con textura crujiente." },
      { nombre:"Sushi Tempura Maki", precio:197, descripcion:"Rollo cubierto de queso crema, chile toreado y costra de tempura. Relleno de cangrejo, aguacate y kakiage. Cremoso, dorado y con un toque picante." },
    ],
    "Bowls": [
      { nombre:"Bowl Yakimeshi Rib Eye", precio:210, descripcion:"Yakimeshi integral con rib eye a la plancha, brócoli y hongos shitake, todo sazonado con salsa de ajonjolí. Sustancioso, aromático y balanceado." },
      { nombre:"Bowl Gohan Mr. Sushi", precio:207, descripcion:"Gohan con cangrejo, masago, alga, aguacate, tampico y salsa chipotle. Fresco, cremoso y con el toque especial de la casa." },
      { nombre:"Bowl Gohan To Banjan", precio:175, descripcion:"Gohan con pollo a la plancha y brócoli salteado en salsa to banjan, con notas de jengibre y pimiento. Ligero, sabroso y con un toque oriental." },
      { nombre:"Bowl Gohan Teriyaki", precio:159, descripcion:"Gohan tradicional con pollo barnizado en salsa teriyaki de la casa. Sabor clásico japonés con un toque dulce y reconfortante." },
      { nombre:"Bowl Chicken Teriyaki", precio:215, descripcion:"Arroz al vapor con pollo a la plancha, brócoli y pasta udon, bañados en salsa teriyaki picante de la casa. Sustancioso, sabroso y con un toque spicy." },
      { nombre:"Bowl Tuna Rayu", precio:207, descripcion:"Arroz con alga, cubos de atún fresco marinados en salsa rayu, láminas de limón, aguacate y ajonjolí. Fresco, cítrico y con un toque picante oriental." },
      { nombre:"Bowl Tokyo", precio:207, descripcion:"Arroz con camarón empanizado, mango, aguacate y queso crema, salseado con salsa estilo bbq y toque de shichimi. Dulce, cremoso y con picor equilibrado." },
      { nombre:"Bowl Sake Wake", precio:237, descripcion:"Arroz estilo sushi con salmón asado, aguacate, edamames, ajonjolí y aceite de ajonjolí. Ligero, nutritivo y lleno de sabor umami." },
      { nombre:"Bowl Kin Roca", precio:207, descripcion:"Arroz con salmón en pasta roca, mango, aguacate y edamames, bañados en mayonesa sriracha y terminado con ajonjolí. Cremoso, spicy y lleno de textura." },
    ],
    "Cocina Caliente": [
      { nombre:"Kani Tori", precio:190, descripcion:"Rollos empanizados de pollo rellenos de kanikama y queso crema, servidos con arroz al vapor, aguacate y salsa chipotle. Cremoso, crujiente y reconfortante." },
      { nombre:"Roast Tuna", precio:275, descripcion:"Trozo de atún sellado, acompañado de verduras y arroz gohan. Jugoso, sabroso y con un toque oriental balanceado." },
      { nombre:"Teriyaki Pollo", precio:320, descripcion:"Pollo en salsa teriyaki acompañado de arroz al vapor, brócoli, calabaza y zanahoria. Dulce, reconfortante y lleno de equilibrio oriental." },
    ],
    "Postres": [
      { nombre:"Camelado", precio:120, descripcion:"Gelatina de café servida con helado de vainilla y leche preparada con Kahlúa. Cremoso, aromático y con un toque de licor." },
      { nombre:"Tempura Helado Chocolate", precio:140, descripcion:"Panecillo frito relleno de helado de vainilla, bañado con salsa de chocolate caliente. Crujiente por fuera, cremoso por dentro." },
      { nombre:"Tempura Helado Frutos Rojos", precio:140, descripcion:"Panecillo frito relleno de helado de vainilla, bañado con mermelada de frutos rojos. Crujiente, dulce y con un toque ácido y frutal." },
    ],
    "Bebidas": [
      { nombre:"Coca Cola", precio:67, descripcion:"Refresco Coca Cola" },
      { nombre:"Coca Cola Light", precio:67, descripcion:"Refresco Coca Cola Light" },
      { nombre:"Coca Cola Sin Azúcar", precio:67, descripcion:"Refresco Coca Cola sin azúcar" },
      { nombre:"Sprite", precio:67, descripcion:"Refresco Sprite" },
      { nombre:"Sidral", precio:67, descripcion:"Refresco Sidral" },
      { nombre:"Agua Embotellada", precio:67, descripcion:"Agua natural embotellada" },
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
