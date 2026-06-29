/**
 * AirGuard – Scheduler v3
 * - Fetch de datos OpenAQ cada 90s
 * - Dispara alertas automáticas cuando AQI supera umbrales
 */

const { fetchBatchMeasurements, discoverStations } = require('./openaq');
const { saveMeasurements, upsertStation }          = require('./db/measurementService');
const { calcAQI, PM25_BREAKPOINTS, PM10_BREAKPOINTS, getHealthRecommendation } = require('./aqiEngine');
const { triggerAlerts }                            = require('./notificationService');

const FETCH_INTERVAL_MS = parseInt(process.env.OPENAQ_FETCH_INTERVAL_MS, 10) || 90_000;
const DAILY_LIMIT       = parseInt(process.env.OPENAQ_DAILY_LIMIT, 10)        || 1_000;
const DISCOVER_EVERY_MS = 6 * 60 * 60 * 1000;
// AQI mínimo para disparar alertas (Dañino para grupos sensibles)
const ALERT_AQI_THRESHOLD = parseInt(process.env.ALERT_AQI_THRESHOLD, 10) || 100;

let requestsToday    = 0;
let lastResetDate    = new Date().toDateString();
let schedulerInterval = null;
let discoverInterval  = null;
let activeLocationIds = [];

function resetDailyCounterIfNeeded() {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    requestsToday = 0;
    lastResetDate = today;
    console.log('[Scheduler] Contador diario reiniciado.');
  }
}

function canMakeRequest(cost = 1) {
  resetDailyCounterIfNeeded();
  return (DAILY_LIMIT - requestsToday) > (40 + cost);
}

function extractValue(p) {
  if (p === null || p === undefined) return 0;
  if (typeof p === 'number') return p;
  if (typeof p === 'object') return p.value ?? 0;
  return parseFloat(p) || 0;
}

function calcDominantAQI(pollutants) {
  const pm25 = extractValue(pollutants?.pm25);
  const pm10 = extractValue(pollutants?.pm10);
  const no2  = extractValue(pollutants?.no2);
  const o3   = extractValue(pollutants?.o3);
  const so2  = extractValue(pollutants?.so2);
  const co   = extractValue(pollutants?.co);

  if (pm25 > 0) {
    const result = calcAQI(pm25, PM25_BREAKPOINTS);
    if (result) return { ...result, dominant_pollutant: 'pm25' };
  }
  if (pm10 > 0) {
    const result = calcAQI(pm10, PM10_BREAKPOINTS);
    if (result) return { ...result, dominant_pollutant: 'pm10' };
  }
  const candidates = [
    { key: 'no2', val: no2, bps: PM25_BREAKPOINTS },
    { key: 'o3',  val: o3,  bps: PM25_BREAKPOINTS },
    { key: 'so2', val: so2, bps: PM25_BREAKPOINTS },
    { key: 'co',  val: co * 1000, bps: PM25_BREAKPOINTS },
  ];
  for (const c of candidates) {
    if (c.val > 0) {
      const result = calcAQI(c.val, c.bps);
      if (result) return { ...result, dominant_pollutant: c.key };
    }
  }
  return { value: 0, category: 'Sin datos', color: '#bdbdbd', dominant_pollutant: null };
}

async function runDiscover() {
  if (!canMakeRequest(1)) { console.warn('[Scheduler] Sin quota para discovery.'); return; }
  try {
    console.log('[Scheduler] Descubriendo estaciones de El Salvador...');
    const stations = await discoverStations();
    requestsToday++;
    if (stations.length === 0) { console.warn('[Scheduler] ⚠️  0 estaciones encontradas.'); return; }
    activeLocationIds = stations.map((s) => s.openaq_id);
    console.log(`[Scheduler] ✅ ${stations.length} estaciones: ${activeLocationIds.join(', ')}`);
    for (const s of stations) {
      await upsertStation(s).catch((e) => console.warn('[Scheduler] Warn upsertStation:', e.message));
    }
  } catch (err) {
    console.error('[Scheduler] ❌ Error en discovery:', err.message);
  }
}

async function runFetch() {
  if (activeLocationIds.length === 0) { console.warn('[Scheduler] Sin estaciones.'); return; }
  if (!canMakeRequest(activeLocationIds.length)) {
    console.warn(`[Scheduler] Límite cercano (${requestsToday}/${DAILY_LIMIT}). Omitiendo.`);
    return;
  }

  try {
    console.log(`[Scheduler] Fetching ${activeLocationIds.length} estaciones... (req #${requestsToday + 1})`);
    const rawData = await fetchBatchMeasurements(activeLocationIds);
    requestsToday += activeLocationIds.length;

    if (rawData.length === 0) { console.warn('[Scheduler] ⚠️  0 mediciones.'); return; }

    const enriched = rawData.map((item) => {
      const normalizedPollutants = {};
      for (const [key, val] of Object.entries(item.pollutants ?? {})) {
        normalizedPollutants[key] = extractValue(val);
      }
      const aqiResult = calcDominantAQI(normalizedPollutants);
      console.log(`[Station ${item.station_id}] AQI: ${aqiResult.value} (${aqiResult.category})`);
      return {
        ...item,
        pollutants: normalizedPollutants,
        aqi: {
          value:              aqiResult.value,
          category:           aqiResult.category,
          color:              aqiResult.color,
          dominant_pollutant: aqiResult.dominant_pollutant,
        },
        recommendation: getHealthRecommendation(aqiResult.category),
      };
    });

    await saveMeasurements(enriched);
    console.log(`[Scheduler] ✅ ${enriched.length} mediciones guardadas. Total hoy: ${requestsToday}/${DAILY_LIMIT}`);

    // ── Disparar alertas si algún AQI supera el umbral ─────────
    const maxAqi = Math.max(...enriched.map((m) => m.aqi?.value ?? 0));
    if (maxAqi >= ALERT_AQI_THRESHOLD) {
      const worst = enriched.find((m) => m.aqi?.value === maxAqi);
      console.log(`[Scheduler] 🚨 AQI ${maxAqi} (${worst?.aqi?.category}) — disparando alertas...`);
      triggerAlerts(maxAqi, worst?.aqi?.category, worst?.aqi?.color, worst?.station_id).catch(console.error);
    }
  } catch (err) {
    console.error('[Scheduler] ❌ Error fetch:', err.message);
  }
}

async function startScheduler() {
  console.log(`[Scheduler] Iniciando — intervalo ${FETCH_INTERVAL_MS / 1000}s`);
  await runDiscover();
  await runFetch();
  schedulerInterval = setInterval(runFetch,    FETCH_INTERVAL_MS);
  discoverInterval  = setInterval(runDiscover, DISCOVER_EVERY_MS);
}

function stopScheduler() {
  if (schedulerInterval) { clearInterval(schedulerInterval); schedulerInterval = null; }
  if (discoverInterval)  { clearInterval(discoverInterval);  discoverInterval  = null; }
  console.log('[Scheduler] Detenido.');
}

module.exports = { startScheduler, stopScheduler };
