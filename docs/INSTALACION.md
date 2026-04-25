# Guía de Instalación — Agente Inteligente Restaurante Japonés

## Requisitos previos

- Node.js 18 o superior ([descargar](https://nodejs.org))
- Una cuenta en [Anthropic Console](https://console.anthropic.com) (para la API key)
- Una cuenta en [Meta for Developers](https://developers.facebook.com) (para WhatsApp)

---

## 1. Instalar el proyecto

```bash
# Entra a la carpeta del proyecto
cd agente-restaurante-japones

# Instala las dependencias
npm install

# Copia el archivo de configuración
cp .env.example .env
```

---

## 2. Configurar variables de entorno

Edita el archivo `.env` con tus datos reales:

```
ANTHROPIC_API_KEY=sk-ant-...        ← de console.anthropic.com
WHATSAPP_TOKEN=EAAxxxxx...          ← de Meta for Developers
WHATSAPP_PHONE_ID=1234567890        ← de Meta for Developers
WHATSAPP_VERIFY_TOKEN=mitoken123    ← cualquier palabra que tú elijas
```

---

## 3. Probar el agente (sin WhatsApp)

Antes de conectar WhatsApp, prueba el agente en la terminal:

```bash
node tests/test-agent.js
```

Ejemplo de conversación:
```
Tú: Hola, quiero pedir comida
Agente: ¡Hola! Bienvenido a Restaurante Japonés 🍣 ...

Tú: ¿Qué ramens tienen?
Agente: Tenemos 4 opciones de ramen...

Tú: Quiero el Tonkotsu y un California Roll
Agente: ¡Perfecto! Te confirmo tu pedido...
```

---

## 4. Exponer el servidor a internet (para WhatsApp)

Meta necesita una URL pública para enviar mensajes. Opciones gratuitas:

### Opción A: ngrok (para desarrollo/pruebas)
```bash
# Instala ngrok desde https://ngrok.com
ngrok http 3000

# Obtendrás una URL como: https://abc123.ngrok.io
# Úsala en el paso siguiente
```

### Opción B: Railway (recomendado para producción — gratis con límites)
1. Crea cuenta en [railway.app](https://railway.app)
2. Conecta tu repositorio de GitHub
3. Railway genera una URL automáticamente

### Opción C: Render (alternativa gratuita)
1. Crea cuenta en [render.com](https://render.com)
2. Crea un "Web Service" con tu repositorio
3. Usa el plan gratuito (se duerme tras 15 min de inactividad)

---

## 5. Configurar WhatsApp en Meta for Developers

1. Ve a [developers.facebook.com](https://developers.facebook.com)
2. Crea una app → Tipo: **Business**
3. Agrega el producto **WhatsApp**
4. En "Configuración de WhatsApp":
   - Copia tu **Phone Number ID** → pégalo en `.env`
   - Copia tu **Token de acceso** → pégalo en `.env`
5. En "Webhooks":
   - URL: `https://TU-URL/webhook`
   - Token de verificación: el mismo que pusiste en `WHATSAPP_VERIFY_TOKEN`
   - Suscríbete a: `messages`

---

## 6. Iniciar el servidor

```bash
# Modo desarrollo (se reinicia al guardar cambios)
npm run dev

# Modo producción
npm start
```

---

## 7. Personalizar el menú y sucursales

Edita `config/restaurante.js` con tu menú real, las 30 sucursales y horarios.

---

## 8. Conectar tu sistema de pedidos

Abre `src/integrations/sistema-pedidos.js`:

- **Si tiene API REST**: descomenta el bloque "MODO A" y llena la URL base
- **Si es base de datos directa**: avísame el tipo de BD (MySQL, PostgreSQL, etc.) y te genero el conector
- **Por ahora**: el proyecto guarda pedidos en `data/pedidos.json` automáticamente

---

## Estructura del proyecto

```
agente-restaurante-japones/
├── config/
│   └── restaurante.js       ← Menú, sucursales, políticas
├── src/
│   ├── index.js             ← Servidor principal
│   ├── agent/
│   │   └── agente.js        ← Cerebro IA
│   ├── webhook/
│   │   └── whatsapp.js      ← Recibe mensajes de Meta
│   ├── integrations/
│   │   └── sistema-pedidos.js ← Conector con tu sistema
│   └── utils/
│       └── logger.js        ← Registro de eventos
├── tests/
│   └── test-agent.js        ← Prueba en consola
├── data/                    ← Pedidos y reservaciones (auto-generado)
├── logs/                    ← Logs del sistema (auto-generado)
├── .env.example             ← Plantilla de configuración
└── package.json
```

---

## Costos estimados (operación real)

| Servicio | Plan gratuito | Costo aprox. |
|---|---|---|
| WhatsApp Cloud API | 1,000 conv/mes gratis | ~$0.01-0.05 USD por conv. extra |
| Anthropic (Claude) | $5 crédito inicial | ~$5-15 USD/mes |
| Railway / Render | Plan gratuito disponible | $5-7 USD/mes en producción |

**Total estimado:** $10–25 USD/mes para operación completa.

---

## Soporte

Si tienes dudas sobre la integración con tu sistema de pedidos, comparte:
- ¿Qué tecnología usa tu sistema? (PHP, .NET, Java, etc.)
- ¿Tienes acceso a la base de datos directamente?
- ¿Hay documentación de endpoints existentes?
