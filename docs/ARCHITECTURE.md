# AirGuard – Arquitectura de Datos Abiertos
**Versión:** 0.2.0 | **Fecha:** 2026-06-26 | **Ciudad:** San Salvador, El Salvador

---

## 1. Visión General

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENTE (PWA)                             │
│  React + Leaflet + Recharts  ←→  Service Worker (offline cache)  │
└────────────────────┬─────────────────────────────────────────────┘
                     │ HTTPS / REST
┌────────────────────▼─────────────────────────────────────────────┐
│                    BACKEND (Node.js / Express)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Scheduler    │  │ AQI Engine   │  │ REST API             │   │
│  │ (node-cron)  │  │ (ICA calc)   │  │ /api/v1/stations     │   │
│  │ cada 90 seg  │  │              │  │ /api/v1/measurements  │   │
│  └──────┬───────┘  └──────────────┘  └──────────────────────┘   │
│         │                                                         │
│  ┌──────▼───────────────────────────────────────────────────┐    │
│  │              OpenAQ API Client (rate-limited)            │    │
│  │  Límite: 1,000 req/día → máx 11 req/hora ≈ 1 req/90 s   │    │
│  └──────────────────────────────────────────────────────────┘    │
└────────────────────┬─────────────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────────────┐
│              DATOS EXTERNOS (OpenAQ)                             │
│  https://api.openaq.io/v3/locations?country=SV&city=San+Salvador │
│  Contaminantes: PM2.5, PM10, CO, NO₂, O₃, SO₂                   │
└──────────────────────────────────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────────────┐
│                MongoDB Atlas (Free Tier M0)                       │
│  Collections: measurements · stations · alerts · aqi_snapshots   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Control de Frecuencia de Peticiones a OpenAQ

### 2.1 Presupuesto diario de requests

| Recurso                          | Frecuencia       | Req/día |
|----------------------------------|------------------|---------|
| `/v3/measurements` (por estación)| cada 90 s × 6 est| 5,760 → ver nota |
| `/v3/locations` (discovery)      | cada 6 h         | 4       |
| **Total controlado**             | **estrategia batch** | **≤ 960** |

> **Nota estrategia batch:** En lugar de consultar cada estación individualmente, se hace **1 sola petición batch** al endpoint `/v3/measurements` filtrando por `location_ids=id1,id2,...,id6` cada **90 segundos**. Esto da:
> `(86,400 s / 90 s) × 1 req = 960 req/día` ✅ bajo el límite de 1,000.

### 2.2 Implementación del Scheduler

```javascript
// backend/src/scheduler.js
const cron = require('node-cron');
const { fetchBatchMeasurements } = require('./openaq');
const { saveMeasurements } = require('./db');

// Ejecutar cada 90 segundos
const INTERVAL_MS = 90_000;

async function runFetch() {
  try {
    const data = await fetchBatchMeasurements([
      'SV-001', 'SV-002', 'SV-003', 'SV-004', 'SV-005', 'SV-006'
    ]);
    await saveMeasurements(data);
    console.log(`[${new Date().toISOString()}] Mediciones guardadas: ${data.length}`);
  } catch (err) {
    console.error('Error en fetch OpenAQ:', err.message);
    // No reintentar inmediatamente — esperar al próximo ciclo
  }
}

setInterval(runFetch, INTERVAL_MS);
runFetch(); // Ejecución inicial
```

### 2.3 Cliente OpenAQ con Rate Limiting

```javascript
// backend/src/openaq.js
const axios = require('axios');

const BASE_URL = 'https://api.openaq.io/v3';
const LOCATION_IDS = process.env.OPENAQ_LOCATION_IDS.split(',');

// Throttle: mínimo 85 segundos entre llamadas (buffer de 5 s)
let lastCallTime = 0;
const MIN_INTERVAL = 85_000;

async function fetchBatchMeasurements(locationIds) {
  const now = Date.now();
  const elapsed = now - lastCallTime;

  if (elapsed < MIN_INTERVAL) {
    await sleep(MIN_INTERVAL - elapsed);
  }

  lastCallTime = Date.now();

  const response = await axios.get(`${BASE_URL}/measurements`, {
    params: {
      location_id: locationIds.join(','),
      limit: 1000,
      date_from: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // últimos 2 min
      order_by: 'datetime',
      sort: 'desc',
    },
    headers: {
      'X-API-Key': process.env.OPENAQ_API_KEY,
    },
    timeout: 10_000,
  });

  return response.data.results;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = { fetchBatchMeasurements };
```

---

## 3. Esquema de Base de Datos – MongoDB Atlas

### 3.1 Collection: `stations`

```json
{
  "_id": "ObjectId",
  "openaq_id": "SV-001",
  "name": "Centro Histórico",
  "zone": "Centro",
  "coordinates": { "lat": 13.6929, "lng": -89.2182 },
  "active": true,
  "last_updated": "ISODate"
}
```

### 3.2 Collection: `measurements`

```json
{
  "_id": "ObjectId",
  "station_id": "SV-001",
  "timestamp": "ISODate",
  "pollutants": {
    "pm25":  { "value": 14.2, "unit": "µg/m³" },
    "pm10":  { "value": 28.5, "unit": "µg/m³" },
    "co":    { "value": 0.4,  "unit": "ppm" },
    "no2":   { "value": 22.1, "unit": "µg/m³" },
    "o3":    { "value": 61.0, "unit": "µg/m³" },
    "so2":   { "value": 4.3,  "unit": "µg/m³" }
  },
  "aqi": {
    "value": 58,
    "category": "Moderada",
    "color": "#FACC15",
    "dominant_pollutant": "pm25"
  }
}
```

### 3.3 Collection: `aqi_snapshots` (agregados horarios)

```json
{
  "_id": "ObjectId",
  "station_id": "SV-001",
  "hour": "ISODate",  // truncado a la hora
  "avg_aqi": 55.2,
  "max_aqi": 72.0,
  "min_aqi": 41.0,
  "dominant_pollutant": "pm25"
}
```

### 3.4 Índices recomendados

```javascript
// TTL Index: borrar mediciones > 90 días automáticamente
db.measurements.createIndex(
  { "timestamp": 1 },
  { expireAfterSeconds: 7_776_000 }
);

// Índice compuesto para queries de historial
db.measurements.createIndex({ "station_id": 1, "timestamp": -1 });
```

---

## 4. Cálculo del Índice de Calidad del Aire (ICA)

Implementación de la escala **US EPA AQI** adaptada para El Salvador:

```javascript
// backend/src/aqiEngine.js

const PM25_BREAKPOINTS = [
  { cLow: 0,    cHigh: 12.0,  iLow: 0,   iHigh: 50,  category: 'Buena',       color: '#22C55E' },
  { cLow: 12.1, cHigh: 35.4,  iLow: 51,  iHigh: 100, category: 'Moderada',    color: '#FACC15' },
  { cLow: 35.5, cHigh: 55.4,  iLow: 101, iHigh: 150, category: 'Dañina (G.S)',color: '#FB923C' },
  { cLow: 55.5, cHigh: 150.4, iLow: 151, iHigh: 200, category: 'Dañina',      color: '#EF4444' },
  { cLow: 150.5,cHigh: 250.4, iLow: 201, iHigh: 300, category: 'Muy Dañina',  color: '#A855F7' },
  { cLow: 250.5,cHigh: 500.4, iLow: 301, iHigh: 500, category: 'Peligrosa',   color: '#881337' },
];

function calcAQI(concentration, breakpoints) {
  const bp = breakpoints.find(b => concentration >= b.cLow && concentration <= b.cHigh);
  if (!bp) return null;

  const aqi = Math.round(
    ((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) *
    (concentration - bp.cLow) + bp.iLow
  );

  return { value: aqi, category: bp.category, color: bp.color };
}

function getHealthRecommendation(category) {
  const recommendations = {
    'Buena':       'La calidad del aire es satisfactoria. Ideal para actividades al aire libre.',
    'Moderada':    'Aceptable, pero personas sensibles deben reducir esfuerzo prolongado.',
    'Dañina (G.S)':'Grupos sensibles (niños, adultos mayores) deben limitar actividad exterior.',
    'Dañina':      'Toda la población puede verse afectada. Evite actividades al aire libre.',
    'Muy Dañina':  'Emergencia sanitaria. Permanezca en interiores con ventanas cerradas.',
    'Peligrosa':   'Alerta máxima. No salga al exterior bajo ninguna circunstancia.',
  };
  return recommendations[category] || 'Datos no disponibles';
}

module.exports = { calcAQI, PM25_BREAKPOINTS, getHealthRecommendation };
```

---

## 5. API REST del Backend

| Método | Endpoint                        | Descripción                              |
|--------|---------------------------------|------------------------------------------|
| GET    | `/api/v1/stations`              | Lista todas las estaciones activas       |
| GET    | `/api/v1/stations/:id`          | Detalle de una estación                  |
| GET    | `/api/v1/measurements/latest`   | Última medición de todas las estaciones  |
| GET    | `/api/v1/measurements/:stationId/history?hours=24` | Historial por estación |
| GET    | `/api/v1/zones/compare`         | KPIs comparativos por zona               |
| GET    | `/api/v1/aqi/summary`           | Resumen ICA actual de toda la ciudad     |

### Respuesta ejemplo `/api/v1/measurements/latest`

```json
{
  "success": true,
  "timestamp": "2026-06-26T19:00:00Z",
  "data": [
    {
      "station_id": "SV-001",
      "name": "Centro Histórico",
      "zone": "Centro",
      "coordinates": { "lat": 13.6929, "lng": -89.2182 },
      "aqi": { "value": 58, "category": "Moderada", "color": "#FACC15" },
      "pollutants": {
        "pm25": 14.2, "pm10": 28.5, "co": 0.4,
        "no2": 22.1, "o3": 61.0, "so2": 4.3
      },
      "recommendation": "Aceptable, pero personas sensibles deben reducir esfuerzo prolongado."
    }
  ]
}
```

---

## 6. Variables de Entorno

```bash
# .env (nunca subir a Git)

# OpenAQ
OPENAQ_API_KEY=your_key_here
OPENAQ_LOCATION_IDS=12345,12346,12347,12348,12349,12350

# MongoDB Atlas
MONGODB_URI=mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/airguard

# App
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://airguard.vercel.app

# Rate Limiting
OPENAQ_FETCH_INTERVAL_MS=90000
OPENAQ_DAILY_LIMIT=1000
```

---

## 7. Dockerfile Multi-Stage

```dockerfile
# ─── Stage 1: Builder ───────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build 2>/dev/null || true

# ─── Stage 2: Production ────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# Solo lo necesario
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY package*.json ./

# Usuario no-root (seguridad)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "src/index.js"]
```

---

## 8. Despliegue

### Frontend → Vercel
```bash
npm i -g vercel
cd frontend
vercel --prod
# Configurar en dashboard: VITE_API_URL=https://airguard-api.onrender.com
```

### Backend → Render
- **Service type:** Web Service
- **Runtime:** Node
- **Build command:** `npm install`
- **Start command:** `node src/index.js`
- **Region:** Oregon (más cercano a CA → latencia aceptable desde SV)
- **Plan:** Free (spin-down después de 15 min inactivo — considerar ping keepalive)

### Manifest PWA (`public/manifest.json`)
```json
{
  "name": "AirGuard – Calidad del Aire SV",
  "short_name": "AirGuard",
  "description": "Monitoreo ciudadano del aire en San Salvador",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#F0F4F8",
  "theme_color": "#0EA5E9",
  "orientation": "portrait-primary",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

---

## 9. Estructura de Carpetas del Proyecto

```
airguard/
├── frontend/                   # React + Vite
│   ├── public/
│   │   ├── manifest.json       # PWA
│   │   └── sw.js               # Service Worker
│   ├── src/
│   │   ├── components/
│   │   │   ├── Map/            # Leaflet map
│   │   │   ├── AQICard/        # Tarjetas ICA
│   │   │   ├── Charts/         # Recharts
│   │   │   └── ZoneCompare/    # Comparativa
│   │   ├── hooks/
│   │   │   └── useAirData.js   # SWR/React Query polling
│   │   ├── pages/
│   │   │   ├── Home.jsx
│   │   │   ├── History.jsx
│   │   │   └── Alerts.jsx
│   │   └── utils/
│   │       └── aqiColors.js
│   └── vite.config.js
│
├── backend/                    # Node.js + Express
│   ├── src/
│   │   ├── index.js            # Entry point
│   │   ├── scheduler.js        # Cron 90s
│   │   ├── openaq.js           # API client
│   │   ├── aqiEngine.js        # ICA calculator
│   │   ├── db/
│   │   │   ├── connection.js
│   │   │   └── models/
│   │   └── routes/
│   │       └── api.js
│   ├── Dockerfile
│   └── .env.example
│
└── docs/
    ├── ARCHITECTURE.md         # Este documento
    └── CHANGELOG.md
```

---

*Documentación generada por AirGuard AI Assistant – Última actualización: 2026-06-26*
