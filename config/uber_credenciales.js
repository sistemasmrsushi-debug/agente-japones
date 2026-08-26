// config/uber_credenciales.js
// Mapeo de sucursal -> razon social -> credenciales de Uber Direct.
//
// El customer_id de Uber Direct es el MISMO para todas las razones sociales
// (sigue siendo la variable de entorno UBER_DIRECT_CUSTOMER_ID de siempre,
// no se toca aqui). Lo unico que cambia por razon social es el client_id y
// el client_secret que se usan para autenticarse y pedir el token.
//
// ESTE ARCHIVO TODAVIA ESTA VACIO A PROPOSITO. Mientras no se llene, TODAS
// las sucursales siguen usando las credenciales globales de siempre
// (UBER_DIRECT_CLIENT_ID / UBER_DIRECT_CLIENT_SECRET) -- nada cambia de
// comportamiento. Es seguro desplegar esto sin que afecte las pruebas en
// curso.
//
// COMO LLENARLO CUANDO SE TENGA LA LISTA COMPLETA DE RAZONES SOCIALES:
//
// 1. Por cada razon social, agrega una entrada en RAZONES_SOCIALES con el
//    NOMBRE de las 2 variables de entorno de Railway donde vas a guardar su
//    client_id y client_secret (los VALORES reales de las llaves nunca van
//    aqui en el codigo -- solo se configuran directo en Railway, variables
//    de entorno del servicio de la app).
//
//    Ejemplo:
//    "O B RESTAURANTES": {
//      clientIdEnv: "UBER_DIRECT_CLIENT_ID_OB_RESTAURANTES",
//      clientSecretEnv: "UBER_DIRECT_CLIENT_SECRET_OB_RESTAURANTES",
//    },
//
// 2. En SUCURSAL_A_RAZON_SOCIAL, mapea cada sucursal (el nombre tiene que
//    coincidir EXACTO con el campo "nombre" en config/restaurante.js) a la
//    razon social que le corresponde.
//
//    Ejemplo:
//    "Fuentes de Satélite": "O B RESTAURANTES",
//    "Perisur": "O B RESTAURANTES",
//    "Coapa": "O B RESTAURANTES",
//
// Una sucursal que NO aparezca en SUCURSAL_A_RAZON_SOCIAL sigue usando las
// credenciales globales -- no hace falta llenar las 25 de un jalon, se puede
// ir agregando poco a poco.

const RAZONES_SOCIALES = {
  // "NOMBRE DE LA RAZON SOCIAL": {
  //   clientIdEnv: "UBER_DIRECT_CLIENT_ID_...",
  //   clientSecretEnv: "UBER_DIRECT_CLIENT_SECRET_...",
  // },
};

const SUCURSAL_A_RAZON_SOCIAL = {
  // "Nombre Sucursal": "NOMBRE DE LA RAZON SOCIAL",
};

// Devuelve { clientId, clientSecret, razonSocial } para la sucursal indicada,
// o null si la sucursal no esta mapeada, la razon social no existe, o le
// faltan las variables de entorno -- en cualquiera de esos casos el
// llamador debe caer de vuelta a las credenciales globales (uber_direct.js
// ya lo hace automaticamente si se le pasa null/undefined).
function credencialesPorSucursal(nombreSucursal) {
  const razonSocial = SUCURSAL_A_RAZON_SOCIAL[nombreSucursal];
  if (!razonSocial) return null;

  const cfg = RAZONES_SOCIALES[razonSocial];
  if (!cfg) return null;

  const clientId = process.env[cfg.clientIdEnv];
  const clientSecret = process.env[cfg.clientSecretEnv];
  if (!clientId || !clientSecret) return null;

  return { clientId, clientSecret, razonSocial };
}

module.exports = { RAZONES_SOCIALES, SUCURSAL_A_RAZON_SOCIAL, credencialesPorSucursal };
