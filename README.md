# Inti Assist 🏋️‍♂️🥗

Bot personal de Telegram para registrar métricas de fitness y nutrición usando IA.

## Stack Tecnológico

- **Framework**: NestJS (TypeScript)
- **Base de Datos**: MongoDB Atlas via Prisma ORM
- **IA**: Groq (primary) + Google Gemini (fallback)
- **Bot**: Telegram Webhooks
- **Despliegue**: Railway

## Estructura del Proyecto

```
src/
├── common/              # Configuraciones, constantes, utilidades
│   ├── config/         # Variables de entorno tipadas
│   ├── constants/      # Constantes de la aplicación
│   └── utils/          # Funciones utilitarias
├── database/           # PrismaService
├── modules/
│   ├── telegram/       # Controller webhook + Service
│   ├── intelligence/   # Integración con Groq + Gemini AI
│   ├── tracker/        # Gestión de métricas
│   └── users/          # Gestión de usuarios
└── app.module.ts
```

## Configuración Inicial

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

```bash
cp env.example .env
```

Edita `.env` con tus credenciales:

- **DATABASE_URL**: URI de MongoDB Atlas
- **TELEGRAM_TOKEN**: Token del bot (obtener de @BotFather)
- **GROQ_API_KEY**: API key de Groq (primary AI)
- **GEMINI_API_KEY**: API key de Google AI Studio (fallback)

### 3. Configurar base de datos

```bash
# Generar cliente Prisma
npm run prisma:generate

# Crear colecciones en MongoDB Atlas
npm run prisma:push
```

### 4. Desarrollo local

```bash
npm run start:dev
```

El servidor estará disponible en `http://localhost:3800`

### 5. Desarrollo con Telegram (ngrok)

```bash
# En otra terminal
ngrok http 3800

# Configurar webhook con la URL de ngrok
curl -X POST "https://api.telegram.org/bot<TU_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://tu-id.ngrok-free.app/telegram/webhook"}'
```

## Despliegue en Railway

### 1. Configurar proyecto en Railway

- Conectar tu repositorio desde Railway Dashboard
- Agregar variables de entorno en Railway Settings

### 2. Variables de entorno requeridas

- `DATABASE_URL` (MongoDB Atlas)
- `TELEGRAM_TOKEN`
- `GROQ_API_KEY`
- `GEMINI_API_KEY`

### 3. Configurar Webhook con URL de Railway

```bash
curl -X POST "https://api.telegram.org/bot<TU_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://tu-app.up.railway.app/telegram/webhook"}'
```

## Endpoints

| Método | Ruta              | Descripción                    |
|--------|-------------------|--------------------------------|
| GET    | /telegram         | Info de la aplicación          |
| GET    | /telegram/health  | Health check                   |
| POST   | /telegram/webhook | Webhook de Telegram            |

## Comandos del Bot

| Comando  | Descripción                      |
|----------|----------------------------------|
| /start   | Iniciar el bot y bienvenida      |
| /help    | Ver ayuda y ejemplos de uso      |

## Uso del Bot

Ejemplos de mensajes que el bot puede procesar:

- "Desayuné 2 huevos con tostadas"
- "Corrí 5km en 30 minutos"
- "Peso 75kg"
- "Tomé 2 vasos de agua"
- "Dormí 7 horas"
- "¿Cuántas calorías llevo hoy?"

## Licencia

MIT
