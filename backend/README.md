# AirGuard – Backend

Servidor Node.js/Express que sirve la API REST, el frontend estático y el panel de administración de AirGuard.

**Versión:** 0.9.0 | **Plataforma:** Render (Node 20) | **DB:** MongoDB Atlas

---

## Estructura de Archivos

```
backend/
├── public/              ← Frontend (index.html, sw.js, manifest.json, iconos)
├── admin/               ← Panel de administración (/panel-air)
│   └── index.html
├── src/
│   ├── index.js         ← Punto de entrada del servidor
│   ├── auth.js          ← JWT y rate limiting de login
│   ├── aqiEngine.js     ← Cálculo del índice ICA/AQI
│   ├── openaq.js        ← Cliente API OpenAQ v3
│   ├── scheduler.js     ← Ciclo de ingesta cada 90 segundos
│   ├── notificationService.js ← Email (nodemailer) + Web Push
│   └── db/
│       ├── connection.js
│       ├── measurementService.js
│       └── models/
│           ├── Measurement.js
│           ├── Station.js
│           └── Subscriber.js
│   └── routes/
│       ├── api.js          ← /api/v1 (público)
│       ├── admin.js        ← /api/admin (JWT protegido)
│       └── subscriptions.js ← /api/v1/subscribe, /unsubscribe, /push
├── .env.example         ← Plantilla de variables de entorno
├── .gitignore
├── package.json
├── render.yaml          ← Configuración de deploy en Render
└── Dockerfile           ← Deploy con Docker (opcional)
```

---

## Inicio Rápido (Local)

```bash
# 1. Clonar e instalar
git clone https://github.com/elizeusmarquez-SV/airguard
cd airguard/backend
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales (MongoDB URI, OpenAQ API Key, etc.)

# 3. Arrancar en desarrollo
npm run dev       # nodemon con hot-reload
# o
node src/index.js # producción
```

El servidor arranca en `http://localhost:3001`.

---

## Variables de Entorno

| Variable | Requerida | Descripción |
|---|---|---|
| `MONGODB_URI` | ✅ | URI de conexión a MongoDB Atlas |
| `OPENAQ_API_KEY` | ✅ | API Key de OpenAQ v3 |
| `ADMIN_PASSWORD` | ✅ | Contraseña del panel /panel-air |
| `ADMIN_JWT_SECRET` | ✅ | Secreto para firmar tokens JWT |
| `PORT` | ❌ | Puerto del servidor (default: 3001) |
| `FRONTEND_DIR` | ❌ | Ruta absoluta al frontend (default: auto-detectado) |
| `APP_URL` | ❌ | URL pública (para links en emails) |
| `FRONTEND_URL` | ❌ | URL del frontend si está en dominio separado (CORS) |
| `OPENAQ_FETCH_INTERVAL_MS` | ❌ | Intervalo del scheduler en ms (default: 90000) |
| `OPENAQ_DAILY_LIMIT` | ❌ | Límite diario de peticiones a OpenAQ (default: 1000) |
| `SMTP_HOST` | ❌ | Servidor SMTP (default: smtp.gmail.com) |
| `SMTP_PORT` | ❌ | Puerto SMTP (default: 587) |
| `SMTP_SECURE` | ❌ | SSL directo: true/false (default: false) |
| `SMTP_USER` | ❌ | Email remitente |
| `SMTP_PASS` | ❌ | Contraseña de aplicación de Gmail |
| `ALERT_AQI_THRESHOLD` | ❌ | AQI mínimo para disparar alertas (default: 100) |
| `VAPID_PUBLIC_KEY` | ❌ | Clave pública Web Push |
| `VAPID_PRIVATE_KEY` | ❌ | Clave privada Web Push |

---

## Endpoints Principales

```
GET  /health                              Estado del servidor y DB
GET  /api/v1/measurements/latest          Últimas mediciones de todas las estaciones
GET  /api/v1/measurements/:id/history     Historial de una estación (?hours=24)
GET  /api/v1/stations                     Lista de estaciones activas
GET  /api/v1/aqi/summary                  Resumen AQI de la ciudad
GET  /api/v1/zones/compare                Comparativa por zona
POST /api/v1/subscribe                    Suscribir email a alertas
POST /api/v1/subscribe/push               Registrar Web Push para email existente
GET  /api/v1/unsubscribe?email=...        Cancelar suscripción
GET  /api/v1/vapid-public-key             Clave VAPID pública para el frontend
POST /api/admin/login                     Login admin → retorna JWT
GET  /api/admin/stations                  CRUD estaciones (requiere JWT)
```

---

## Generar Claves VAPID (Web Push)

```bash
node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log('VAPID_PUBLIC_KEY='+k.publicKey+'\nVAPID_PRIVATE_KEY='+k.privateKey)"
```

Copia las dos líneas al `.env` y a las variables de entorno en Render.

---

## Deploy en Render

1. Sube el repo a GitHub (carpeta `backend/` como raíz o con `rootDir: backend` en `render.yaml`)
2. Crea un Web Service en [render.com](https://render.com) conectado al repo
3. Render detecta `render.yaml` automáticamente.
4. Agrega las variables de entorno marcadas como `sync: false` en el dashboard
5. Verifica en `/health` que `db: connected` y `frontend: found`

> **Nota plan gratuito:** El servicio se duerme tras 15 min de inactividad. La primera petición puede tardar 30-60 s. Para producción considera el plan de $7/mes o usa UptimeRobot para hacer ping cada 10 min.

---

## Probar Notificaciones

**Opción rápida:** Cambia `ALERT_AQI_THRESHOLD=1` en Render. El próximo ciclo del scheduler (≤90s) disparará alertas a todos los suscriptores. Devuélvelo a `100` luego.

**Opción técnica:**
```bash
# 1. Obtener token JWT
TOKEN=$(curl -s -X POST https://tu-app.onrender.com/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password":"TU_ADMIN_PASSWORD"}' | jq -r .token)

# 2. Verificar suscriptores activos
curl https://tu-app.onrender.com/api/admin/stations \
  -H "Authorization: Bearer $TOKEN"
```

---

*AirGuard v0.9.0 · 2026-06-29*
