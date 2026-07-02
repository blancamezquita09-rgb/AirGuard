# AirGuard – Esquema de Base de Datos MongoDB

**Base de Datos:** `airguard` (MongoDB Atlas Free Tier)
**ODM:** Mongoose 8.x
**Colecciones:** `measurements`, `stations`, `subscribers`
**Versión:** v0.9.1 · 2026-07-01

---

## Diagrama de Colecciones

```
airguard (DB)
│
├── measurements
│   ├── _id                ObjectId
│   ├── station_id         String  ──── FK → stations.openaq_id
│   ├── timestamp          Date    (TTL 90 días)
│   ├── pollutants
│   │   ├── pm25           Number  (µg/m³)
│   │   ├── pm10           Number  (µg/m³)
│   │   ├── co              Number  (mg/m³)
│   │   ├── no2             Number  (µg/m³)
│   │   ├── o3               Number  (µg/m³)
│   │   └── so2             Number  (µg/m³)
│   ├── aqi
│   │   ├── value          Number
│   │   ├── category       String
│   │   ├── color          String
│   │   └── dominant_pollutant  String
│   └── recommendation     String
│
├── stations
│   ├── _id                ObjectId
│   ├── openaq_id          String (unique)
│   ├── name               String
│   ├── zone               String (enum: Centro, Norte, Este, Oeste, Sur)
│   ├── coordinates
│   │   ├── lat            Number
│   │   └── lng            Number
│   ├── is_active           Boolean
│   ├── last_updated       Date
│   ├── createdAt          Date (auto)
│   └── updatedAt          Date (auto)
│
└── subscribers
    ├── _id                ObjectId
    ├── email              String (unique)
    ├── alert_threshold    Number (default: 100)
    ├── channels
    │   ├── email          Boolean
    │   └── push           Boolean
    ├── push_subscription  Object (endpoint + keys Web Push)
    ├── confirmed          Boolean
    ├── confirm_token      String
    ├── is_active          Boolean
    ├── createdAt          Date (auto)
    └── updatedAt          Date (auto)
```

---

## Colección: `measurements`

Almacena cada lectura de contaminantes por estación, enriquecida con el ICA calculado automáticamente.

> ⚠️ **Cambio importante en v0.9.1:** hasta v0.9.0 el schema exigía que cada contaminante
> fuera un sub-documento `{value, unit}`, pero el scheduler siempre generó números planos.
> Ese desajuste causaba un `CastError` en cada `insertMany()` que, al no estar capturado,
> crasheaba el proceso completo de Node (`unhandledRejection`) — por eso nunca se
> guardaban mediciones de forma estable. Desde v0.9.1 los contaminantes son campos
> `Number` planos, alineados con lo que el scheduler realmente produce.

### Schema (Mongoose)

```js
const measurementSchema = new mongoose.Schema(
  {
    station_id:  { type: String, required: true },   // sin index: true inline
    timestamp:   { type: Date,   required: true },   // sin index: true inline
    pollutants: {
      pm25: { type: Number, default: 0 },  // µg/m³
      pm10: { type: Number, default: 0 },  // µg/m³
      co:   { type: Number, default: 0 },  // mg/m³
      no2:  { type: Number, default: 0 },  // µg/m³
      o3:   { type: Number, default: 0 },  // µg/m³
      so2:  { type: Number, default: 0 },  // µg/m³
    },
    aqi: {
      value:              Number,
      category:           String,
      color:              String,
      dominant_pollutant: String,
    },
    recommendation: String,
  },
  { versionKey: false, timestamps: false }
);

// Índices declarados una sola vez (evita warning "Duplicate schema index")
measurementSchema.index({ station_id: 1, timestamp: -1 });
measurementSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7_776_000 }); // TTL 90 días
```

### Índices

| Índice | Tipo | Propósito |
|---|---|---|
| `{ station_id: 1, timestamp: -1 }` | Compuesto | Queries de historial por estación |
| `{ timestamp: 1 }` + TTL 90 días | TTL | Auto-eliminar mediciones antiguas |

### Ejemplo de Documento

```json
{
  "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
  "station_id": "sv-centro-historico",
  "timestamp": "2026-07-01T11:00:00.000Z",
  "pollutants": {
    "pm25": 18.4,
    "pm10": 32.1,
    "co":   1.2,
    "no2":  28.5,
    "o3":   38.2,
    "so2":  8.1
  },
  "aqi": {
    "value": 54,
    "category": "Moderada",
    "color": "#ffff00",
    "dominant_pollutant": "pm25"
  },
  "recommendation": "Grupos sensibles deben limitar la exposición prolongada al aire libre."
}
```

---

## Colección: `stations`

Metadata de cada estación de monitoreo. El scheduler la actualiza automáticamente al descubrir estaciones nuevas en OpenAQ o al sembrar las estaciones simuladas.

> ⚠️ **Cambio importante en v0.9.1:** el schema usaba el campo `active`, mientras que todo
> el resto del código (`upsertStation`, `/api/v1/stations`, `getActiveStations`) consultaba
> `is_active`. Esto hacía que `/stations` devolviera siempre un arreglo vacío. Se unificó
> el schema a `is_active` y se migraron los 6 documentos existentes en Atlas. También se
> corrigió `last_update` → `last_updated` para que coincida con el campo real del schema.

### Schema (Mongoose)

```js
const stationSchema = new mongoose.Schema(
  {
    openaq_id:   { type: String,  required: true, unique: true },
    name:        { type: String,  required: true },
    zone:        { type: String,  enum: ['Centro', 'Norte', 'Este', 'Oeste', 'Sur'], default: 'Centro' },
    coordinates: {
      lat:       { type: Number,  required: true },
      lng:       { type: Number,  required: true },
    },
    is_active:    { type: Boolean, default: true },
    last_updated: { type: Date,    default: Date.now },
  },
  { versionKey: false, timestamps: true }
);
```

### Ejemplo de Documento

```json
{
  "_id": "64f1a2b3c4d5e6f7a8b9c0d2",
  "openaq_id": "sv-centro-historico",
  "name": "Centro Histórico",
  "zone": "Centro",
  "coordinates": { "lat": 13.6942, "lng": -89.2219 },
  "is_active": true,
  "last_updated": "2026-07-01T13:43:27.458Z",
  "createdAt": "2026-06-29T03:53:40.259Z",
  "updatedAt": "2026-07-01T13:43:27.458Z"
}
```

---

## Colección: `subscribers`

Usuarios suscritos a alertas por email y/o notificaciones push cuando el AQI supera su umbral configurado.

### Schema (Mongoose)

```js
const subscriberSchema = new mongoose.Schema(
  {
    email:            { type: String,  required: true, unique: true, lowercase: true, trim: true },
    alert_threshold:  { type: Number,  default: 100 },
    channels: {
      email:          { type: Boolean, default: true },
      push:           { type: Boolean, default: false },
    },
    push_subscription: { type: mongoose.Schema.Types.Mixed, default: null },
    confirmed:        { type: Boolean, default: true },
    confirm_token:    { type: String },
    is_active:        { type: Boolean, default: true },
  },
  { versionKey: false, timestamps: true }
);
```

### Ejemplo de Documento

```json
{
  "_id": "64f1a2b3c4d5e6f7a8b9c0d3",
  "email": "usuario@ejemplo.com",
  "alert_threshold": 100,
  "channels": { "email": true, "push": true },
  "push_subscription": {
    "endpoint": "https://fcm.googleapis.com/fcm/send/...",
    "keys": { "p256dh": "...", "auth": "..." }
  },
  "confirmed": true,
  "is_active": true,
  "createdAt": "2026-06-28T10:00:00.000Z",
  "updatedAt": "2026-06-28T19:00:00.000Z"
}
```

---

## Endpoints de la API

### Públicos — `/api/v1`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/v1/stations` | Lista todas las estaciones activas |
| GET | `/api/v1/stations/:id` | Detalle de una estación por `openaq_id` |
| GET | `/api/v1/measurements/latest` | Última medición de todas las estaciones |
| GET | `/api/v1/measurements/:id/history?hours=24` | Historial de una estación (máx 168h) |
| GET | `/api/v1/zones/compare` | Comparativa AQI promedio por zona |
| GET | `/api/v1/aqi/summary` | Resumen de ciudad: AQI promedio, máximo, peor estación |
| POST | `/api/v1/subscribe` | Suscribir email (+ push opcional) |
| POST | `/api/v1/subscribe/push` | Registrar/actualizar Web Push para un email |
| GET | `/api/v1/unsubscribe?email=...` | Cancelar suscripción desde link de email |
| GET | `/api/v1/vapid-public-key` | Obtener clave pública VAPID para el frontend |

### Admin — `/api/admin` (requiere JWT)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/admin/login` | Autenticar con `ADMIN_PASSWORD`, retorna JWT (8h) |
| GET | `/api/admin/stations` | Lista todas las estaciones (activas e inactivas) |
| POST | `/api/admin/stations` | Crear estación manualmente |
| PUT | `/api/admin/stations/:id` | Editar nombre, zona, umbral, coordenadas, estado |
| DELETE | `/api/admin/stations/:id` | Eliminar estación |

### Sistema

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado del servidor, DB y frontend |

---

## Queries Más Usadas

### Última medición de todas las estaciones
```js
db.measurements.aggregate([
  { $sort: { timestamp: -1 } },
  { $group: { _id: "$station_id", doc: { $first: "$$ROOT" } } },
  { $replaceRoot: { newRoot: "$doc" } },
  { $sort: { "aqi.value": -1 } }
])
```

### Historial 24h de una estación
```js
const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
db.measurements.find(
  { station_id: "sv-centro-historico", timestamp: { $gte: since } }
).sort({ timestamp: 1 }).limit(96)
```

### Suscriptores activos con push habilitado
```js
db.subscribers.find({ is_active: true, "channels.push": true })
```

---

## Estimación de Almacenamiento (Free Tier 512MB)

| Concepto | Valor |
|---|---|
| Frecuencia de ingesta | 6 estaciones cada 90 segundos |
| Documentos/día | ~5,760 |
| Documentos/mes | ~172,800 |
| Tamaño estimado/doc | ~800 bytes |
| Total/mes | ~138 MB |
| TTL (auto-purge) | 90 días |
| Máximo en disco | ~420 MB |
| Límite Atlas Free | 512 MB ✅ |

---

## Troubleshooting

### ECONNREFUSED al conectar con Atlas
1. Verificar URI en `.env`: `mongodb+srv://usuario:pass@cluster.mongodb.net/airguard`
2. Atlas → Network Access → agregar `0.0.0.0/0`
3. Atlas → Database Access → usuario con rol `readWrite`

### Authentication failed
- Usuario o contraseña incorrectos en `MONGODB_URI`
- Verificar en Atlas → Database Access que el usuario exista

### Duplicate schema index warning
Resuelto en v0.3.1: no usar `index: true` inline cuando el índice ya está declarado con `schema.index()`.

### `/api/v1/stations` o `/measurements/latest` devuelven vacío pese a tener datos en Atlas
Resuelto en v0.9.1: `Station.js` usaba el campo `active`, pero el resto del código
consultaba `is_active`. Verificar que ambos coincidan y que los documentos existentes en
Atlas tengan `is_active: true` (los documentos antiguos con solo `active` deben migrarse).

### El scheduler no persiste mediciones / el servicio se reinicia solo en Render
Resuelto en v0.9.1: `pollutants` como sub-documentos `{value, unit}` no coincidía con los
números planos generados por el scheduler, provocando un `CastError` no capturado que
crasheaba el proceso en cada ciclo. Ver `CHANGELOG.md` v0.9.1 para el detalle completo.

---

*AirGuard v0.9.1 · 2026-07-01 · San Salvador, El Salvador*
