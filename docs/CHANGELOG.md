# AirGuard – Changelog

---

## [v0.9.2] - 2026-07-01
### Fixed
- **Mapa sin marcadores**: `getLatestMeasurements()` en `measurementService.js` nunca
  hacía `$lookup` con la colección `stations`, por lo que las mediciones devueltas por
  `/api/v1/measurements/latest` no incluían `coordinates`. El frontend (`updateMapMarkers`)
  requiere `coordinates.lat/lng` para dibujar los marcadores Leaflet, así que el mapa
  quedaba vacío aunque las 6 estaciones ya tuvieran datos.
- Se agregó `$lookup` + `$unwind` + `$addFields` al pipeline de agregación para enriquecer
  cada medición con `coordinates`, `station_name` y `zone` desde la colección `stations`.
  Verificado directamente contra MongoDB Atlas: las 6 estaciones ya retornan coordenadas
  correctas.

---

## [v0.9.1] - 2026-07-01
### Fixed
- **BUG CRÍTICO**: `Measurement.js` exigía que cada contaminante fuera un sub-documento
  `{value, unit}`, pero el scheduler guardaba números planos (`pm25: 18.4`). Esto causaba
  un `CastError` en cada `insertMany()`, que al no estar capturado generaba un
  `unhandledRejection` y **crasheaba el proceso completo de Node en cada ciclo**. Render
  reiniciaba el servicio una y otra vez sin que ninguna medición llegara a persistirse.
- `pollutants` ahora se define como campos `Number` planos en el schema, alineado con lo
  que produce `enrichMeasurements()`.
- `Station.js` usaba el campo `active`, pero todo el código (`upsertStation`, queries de
  `/stations`) usaba `is_active`. Se unificó el schema a `is_active` y se migraron los
  6 documentos existentes en MongoDB Atlas.
- `upsertStation()` escribía `last_update` en vez de `last_updated` (no coincidía con el
  schema, campo huérfano).
- Se añadió un try/catch envolvente en `runFetch()`, `runDiscover()` y
  `checkAndTriggerAlerts()` para que un error futuro nunca vuelva a tumbar el proceso —
  solo se omite el ciclo y se loguea.
- Se añadieron manejadores globales `process.on('unhandledRejection'/'uncaughtException')`
  en `index.js` como red de seguridad adicional.

---

## [v0.9.0] - 2026-06-28
### Added
- **Simulator Engine** (`simulatorEngine.js`): genera mediciones realistas para 6 estaciones
  fijas de San Salvador cuando OpenAQ no tiene cobertura activa en El Salvador
- Patrones horarios calibrados: picos de contaminación 7–9h y 17–19h por tráfico vehicular
- Variación aleatoria ±15% por lectura para naturalidad visual
- Perfiles de contaminantes diferenciados por zona: industrial (Norte), residencial (Oeste),
  mixto (Centro, Este, Sur)
- O₃ modelado inversamente proporcional al tráfico (comportamiento fotoquímico real)
- Variable de entorno `SIMULATE_DATA=true/false` para control desde Render sin tocar código

### Changed
- **Scheduler v4**: lógica dual real/simulado
  - `SIMULATE_DATA=false` (default): intenta OpenAQ → cae automáticamente a simulado si obtiene 0 estaciones
  - `SIMULATE_DATA=true`: modo simulado forzado permanente
  - Logs identifican cada medición como `[REAL]` o `[SIM]`
- `measurementService.js`: `upsertStation()` acepta campo `is_active` además de `active`
  para compatibilidad con estaciones simuladas y reales
- `.env.example` actualizado a v0.9.0 con nueva variable `SIMULATE_DATA`
- `render.yaml` incluye `SIMULATE_DATA=false` como valor por defecto

### Estaciones simuladas incluidas
| ID | Nombre | Zona |
|---|---|---|
| sv-centro-historico | Centro Histórico | Centro |
| sv-zona-industrial | Zona Industrial Norte | Norte |
| sv-soyapango | Soyapango | Este |
| sv-santa-tecla | Santa Tecla | Oeste |
| sv-san-marcos | San Marcos | Sur |
| sv-ilopango | Ilopango | Este |

---

## [v0.8.3] - 2026-06-28
### Fixed
- Error `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` de express-rate-limit en Render
- Agregado `app.set('trust proxy', 1)` en `index.js` antes de cualquier middleware

---

## [v0.8.2] - 2026-06-28
### Fixed
- Error `ENOENT: index.html` en Render — frontend movido a `backend/public/`
- Variable `FRONTEND_DIR=/opt/render/project/src/public` en render.yaml

---

## [v0.8.1] - 2026-06-28
### Fixed
- Detección automática de ruta del frontend en 3 candidatos
- El servidor arranca igual si no encuentra el frontend (error 503 útil)

---

## [v0.8.0] - 2026-06-28
### Added
- Auto-refresh, suscripción email, push VAPID, export PDF, compartir redes, PWA, Chart.js, render.yaml

---

## [v0.7.0] - 2026-06-28
### Added
- Notificaciones push (web-push + VAPID), alertas email (nodemailer), modelo Subscriber

---

## [v0.6.0] - 2026-06-28
### Added
- Panel admin `/panel-air` con JWT + rate limiting + CRUD de estaciones

---

## [v0.4.0] - 2026-06-28
### Fixed
- Cálculo AQI corregido: extracción correcta de valores numéricos de OpenAQ v3

---

## [v0.3.1] - 2026-06-28
### Fixed
- Índice duplicado Measurement.js, dominio corregido a api.openaq.org

---

## [v0.2.0] - 2026-06-27
### Added
- Conexión MongoDB Atlas, modelos Measurement/Station, scheduler inicial, rutas API base

---

## [v0.1.0] - 2026-06-26
### Added
- Concepto inicial, stack definido, prototipo HTML aprobado, arquitectura single-stack
