/**
 * AirGuard – OpenAQ API Client v3
 * Consume la API v3 de OpenAQ filtrando por El Salvador.
 * Rate-limited para no superar 1,000 req/día.
 *
 * Endpoints usados (OpenAQ v3):
 *   GET /v3/locations?countries_id=222&limit=20     → descubrir estaciones de SV
 *   GET /v3/locations/{id}/latest                   → última lectura por estación
 *   GET /v3/locations/{id}/measurements             → historial por estación
 *
 * Reintentos con backoff exponencial (v0.9.5):
 *   Si OpenAQ responde 429 (rate limit) o 5xx (server error), se reintenta
 *   hasta MAX_RETRIES veces con delays crecientes: 1s, 2s, 4s.
 *   Los errores 4xx (excepto 429) no se reintentan (son permanentes).
 */

const axios = require('axios');

const BASE_URL = 'https://api.openaq.org/v3';
const API_KEY  = process.env.OPENAQ_API_KEY;

// IDs de OpenAQ para estaciones de San Salvador.
// Si no están en .env, se descubren automáticamente al iniciar.
const LOCATION_IDS = (process.env.OPENAQ_LOCATION_IDS ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// El Salvador tiene countries_id = 222 en OpenAQ v3
const SV_COUNTRY_ID = 222;

// Guard: mínimo 85 s entre ciclos de fetch (buffer sobre el intervalo de 90 s)
const MIN_CALL_INTERVAL_MS = 85_000;
let lastCallAt = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────────────────────
// Reintentos con backoff exponencial
// ─────────────────────────────────────────────
const MAX_RETRIES  = 3;
const BASE_DELAY_MS = 1000; // 1s inicial; 2s, 4s en reintentos sucesivos

/**
 * Ejecuta una petición HTTP con reintentos automáticos.
 * - Reintenta en: 429 (Too Many Requests), 5xx (server errors), timeouts, ECONNRESET.
 * - NO reintenta en: 4xx (excepto 429) — son errores permanentes (auth, not found, etc.).
 * - Backoff exponencial: delay = BASE_DELAY_MS * 2^attempt (1s, 2s, 4s).
 *
 * @param {Function} requestFn - Función que devuelve una promesa de axios.
 * @param {String} label - Etiqueta para logs.
 * @returns {Promise<any>} - Respuesta de axios (ya desempaquetada).
 */
async function withRetry(requestFn, label = 'OpenAQ') {
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await requestFn();
      return response;
    } catch (err) {
      lastError = err;

      // Determinar si el error es reintentable
      const status = err.response?.status;
      const code   = err.code; // axios error codes: ECONNRESET, ETIMEDOUT, etc.
      const isRetryable =
        status === 429 ||
        (status >= 500 && status < 600) ||
        code === 'ECONNRESET' ||
        code === 'ETIMEDOUT' ||
        code === 'ECONNABORTED' ||
        code === 'EAI_AGAIN';

      // Errores 4xx (excepto 429) no se reintentan
      if (status && status >= 400 && status < 500 && status !== 429) {
        console.warn(`[${label}] Error ${status} — no reintentable (permanente).`);
        throw err;
      }

      // Si no quedan reintentos, lanzar
      if (attempt === MAX_RETRIES) {
        console.error(`[${label}] Falló tras ${MAX_RETRIES + 1} intentos. Último error: ${err.message}`);
        throw err;
      }

      // Calcular delay exponencial: 1s, 2s, 4s
      const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
      const reason  = status ? `HTTP ${status}` : (code || err.message);
      console.warn(`[${label}] ${reason} — reintentando en ${delayMs}ms (intento ${attempt + 1}/${MAX_RETRIES + 1})...`);

      await sleep(delayMs);
    }
  }

  // No debería llegar aquí, pero por seguridad
  throw lastError;
}

const openaqClient = axios.create({
  baseURL: BASE_URL,
  timeout: 20_000,
  headers: {
    'X-API-Key': API_KEY,
    Accept: 'application/json',
  },
});

// ─────────────────────────────────────────────
// Descubrir estaciones activas en El Salvador
// ─────────────────────────────────────────────
async function discoverStations() {
  const response = await withRetry(
    () => openaqClient.get('/locations', {
      params: {
        countries_id: SV_COUNTRY_ID,
        limit: 20,
      },
    }),
    'OpenAQ:discover'
  );

  const results = response.data.results ?? [];

  return results.map((loc) => ({
    openaq_id:   String(loc.id),
    name:        loc.name ?? 'Estación desconocida',
    zone:        inferZone(loc.name),
    coordinates: {
      lat: loc.coordinates?.latitude  ?? 0,
      lng: loc.coordinates?.longitude ?? 0,
    },
    active: true,
  }));
}

// ─────────────────────────────────────────────
// Obtener última lectura de cada estación
// ─────────────────────────────────────────────
async function fetchBatchMeasurements(locationIds) {
  // Rate guard
  const elapsed = Date.now() - lastCallAt;
  if (elapsed < MIN_CALL_INTERVAL_MS) await sleep(MIN_CALL_INTERVAL_MS - elapsed);
  lastCallAt = Date.now();

  const ids = locationIds.length > 0 ? locationIds : LOCATION_IDS;
  if (ids.length === 0) {
    console.warn('[OpenAQ] No hay location IDs configurados. Ejecuta discoverStations primero.');
    return [];
  }

  // Fetch latest de cada estación con reintentos individuales
  const results = await Promise.allSettled(
    ids.map((id) =>
      withRetry(
        () => openaqClient.get(`/locations/${id}/latest`).then((r) => ({ id, data: r.data })),
        `OpenAQ:fetch:${id}`
      )
    )
  );

  const stations = [];
  for (const r of results) {
    if (r.status === 'rejected') {
      console.warn('[OpenAQ] Error en estación:', r.reason?.message);
      continue;
    }
    const { id, data } = r.value;
    const measurements = data.results ?? [];
    if (measurements.length === 0) continue;

    const first = measurements[0];
    const stationObj = {
      station_id:  String(id),
      timestamp:   first.datetime?.utc ?? new Date().toISOString(),
      coordinates: {
        lat: first.coordinates?.latitude  ?? 0,
        lng: first.coordinates?.longitude ?? 0,
      },
      pollutants: {},
    };

    for (const m of measurements) {
      const key = normalizeParameter(m.parameter);
      if (key) {
        stationObj.pollutants[key] = {
          value: m.value,
          unit:  m.unit ?? 'µg/m³',
        };
      }
    }

    stations.push(stationObj);
  }

  return stations;
}

// ─────────────────────────────────────────────
// Historial de una estación (últimas N horas)
// ─────────────────────────────────────────────
async function fetchHistory(locationId, hours = 24) {
  const dateFrom = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const response = await withRetry(
    () => openaqClient.get(`/locations/${locationId}/measurements`, {
      params: {
        date_from: dateFrom,
        limit: 500,
      },
    }),
    `OpenAQ:history:${locationId}`
  );
  return response.data.results ?? [];
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function normalizeParameter(param) {
  const map = {
    pm25:    'pm25',
    'pm2.5': 'pm25',
    pm10:    'pm10',
    co:      'co',
    no2:     'no2',
    o3:      'o3',
    so2:     'so2',
  };
  return map[(param ?? '').toLowerCase()] ?? null;
}

function inferZone(name = '') {
  const n = name.toLowerCase();
  if (n.includes('norte') || n.includes('north'))  return 'Norte';
  if (n.includes('sur')   || n.includes('south'))  return 'Sur';
  if (n.includes('este')  || n.includes('east'))   return 'Este';
  if (n.includes('oeste') || n.includes('west'))   return 'Oeste';
  return 'Centro';
}

module.exports = { fetchBatchMeasurements, discoverStations, fetchHistory, withRetry };
