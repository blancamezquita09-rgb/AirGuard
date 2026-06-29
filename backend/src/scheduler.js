/**
 * AirGuard – Scheduler v4
 *
 * Ciclo de ingesta de datos cada 90 segundos.
 * Soporta dos modos de operación:
 *
 *   MODO REAL    → SIMULATE_DATA=false (default)
 *                  Obtiene datos de OpenAQ API v3.
 *                  Si no hay estaciones disponibles para El Salvador,
 *                  cae automáticamente al modo simulado.
 *
 *   MODO SIMULADO → SIMULATE_DATA=true
 *                  Genera mediciones con patrones horarios realistas
 *                  para 6 estaciones fijas de San Salvador.
 *                  Útil cuando OpenAQ no tiene cobertura activa en SV.
 */

const { fetchBatchMeasurements, discoverStations } = require('./openaq');
const { saveMeasurements, upsertStation }          = require('./db/measurementService');
const { calcAQI, PM25_BREAKPOINTS, PM10_BREAKPOINTS, getHealthRecommendation } = require('./aqiEngine');
const { triggerAlerts }                            = require('./notificationService');
const { generateSimulatedMeasurements, getSimulatedStations } = require('./simulatorEngine');

const FETCH_INTERVAL_MS   = parseInt(process.env.OPENAQ_FETCH_INTERVAL_MS, 10) || 90_000;
const DAILY_LIMIT         = parseInt(process.env.OPENAQ_DAILY_LIMIT, 10)        || 1_000;
const DISCOVER_EVERY_MS   = 6 * 60 * 60 * 1000; // re-descubrir cada 6h
const ALERT_AQI_THRESHOLD = parseInt(process.env.ALERT_AQI_THRESHOLD, 10)       || 100;

// SIMULATE_DATA=true activa el modo simulado permanentemente
// Si es false o no está definida, el scheduler intenta OpenAQ primero
// y cae al modo simulado automáticamente si obtiene 0 estaciones
const FORCE_SIMULATE = process.env.SIMULATE_DATA === 'true';

let requestsToday     = 0;
let lastResetDate     = new Date().toDateString();
let schedulerInterval = null;
let discoverInterval  = null;
let activeLocationIds = [];
let usingSimulation   = FORCE_SIMULATE;

// ── Helpers ───────────────────────────────────────────────────────

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
    const r = calcAQI(pm25, PM25_BREAKPOINTS);
    if (r) return { ...r, dominant_pollutant: 'pm25' };
  }
  if (pm10 > 0) {
    const r = calcAQI(pm10, PM10_BREAKPOINTS);
    if (r) return { ...r, dominant_pollutant: 'pm10' };
  }
  for (const [key, val] of [['no2', no2], ['o3', o3], ['so2', so2], ['co', co * 1000]]) {
    if (val > 0) {
      const r = calcAQI(val, PM25_BREAKPOINTS);
      if (r) return { ...r, dominant_pollutant: key };
    }
  }
  return { value: 0, category: 'Sin datos', color: '#bdbdbd', dominant_pollutant: null };
}

function enrichMeasurements(rawData) {
  return rawData.map((item) => {
    const normalizedPollutants = {};
    for (const [key, val] of Object.entries(item.pollutants ?? {})) {
      normalizedPollutants[key] = extractValue(val);
    }
    const aqiResult = calcDominantAQI(normalizedPollutants);
    const tag = item._simulated ? '[SIM]' : '[REAL]';
    console.log(`  ${tag} Station ${item.station_id} → AQI: ${aqiResult.value} (${aqiResult.category})`);
    return {
      station_id:     item.station_id,
      timestamp:      item.timestamp,
      pollutants:     normalizedPollutants,
      aqi: {
        value:              aqiResult.value,
        category:           aqiResult.category,
        color:              aqiResult.color,
        dominant_pollutant: aqiResult.dominant_pollutant,
      },
      recommendation: getHealthRecommendation(aqiResult.category),
    };
  });
}

// ── Discovery ─────────────────────────────────────────────────────

async function runDiscover() {
  // En modo simulado forzado, no consumir quota de OpenAQ
  if (FORCE_SIMULATE) {
    console.log('[Scheduler] Modo SIMULADO forzado — cargando estaciones locales...');
    await seedSimulatedStations();
    return;
  }

  if (!canMakeRequest(1)) {
    console.warn('[Scheduler] Sin quota para discovery.');
    return;
  }

  try {
    console.log('[Scheduler] Descubriendo estaciones de El Salvador en OpenAQ...');
    const stations = await discoverStations();
    requestsToday++;

    if (stations.length === 0) {
      console.warn('[Scheduler] ⚠️  0 estaciones en OpenAQ para El Salvador.');
      console.warn('[Scheduler] 🔄 Activando modo SIMULADO automáticamente.');
      usingSimulation = true;
      await seedSimulatedStations();
      return;
    }

    usingSimulation   = false;
    activeLocationIds = stations.map((s) => s.openaq_id);
    console.log(`[Scheduler] ✅ ${stations.length} estaciones REALES: ${activeLocationIds.join(', ')}`);
    for (const s of stations) {
      await upsertStation(s).catch((e) => console.warn('[upsertStation]', e.message));
    }
  } catch (err) {
    console.error('[Scheduler] ❌ Error en discovery:', err.message);
    console.warn('[Scheduler] 🔄 Fallback a modo SIMULADO por error en OpenAQ.');
    usingSimulation = true;
    await seedSimulatedStations();
  }
}

/**
 * Inserta las estaciones simuladas en MongoDB si no existen.
 */
async function seedSimulatedStations() {
  const stations = getSimulatedStations();
  for (const s of stations) {
    await upsertStation(s).catch((e) => console.warn('[seedSimulated]', e.message));
  }
  activeLocationIds = stations.map((s) => s.openaq_id);
  console.log(`[Scheduler] 📍 ${stations.length} estaciones simuladas registradas en DB.`);
}

// ── Fetch / Generate ──────────────────────────────────────────────

async function runFetch() {
  if (activeLocationIds.length === 0) {
    console.warn('[Scheduler] Sin estaciones. Esperando discovery...');
    return;
  }

  // ── MODO SIMULADO ─────────────────────────────────────────────
  if (usingSimulation || FORCE_SIMULATE) {
    console.log('[Scheduler] 🎭 Generando mediciones simuladas...');
    const rawData = generateSimulatedMeasurements();
    const enriched = enrichMeasurements(rawData);
    await saveMeasurements(enriched);
    console.log(`[Scheduler] ✅ ${enriched.length} mediciones simuladas guardadas.`);
    await checkAndTriggerAlerts(enriched);
    return;
  }

  // ── MODO REAL ─────────────────────────────────────────────────
  if (!canMakeRequest(activeLocationIds.length)) {
    console.warn(`[Scheduler] Límite cercano (${requestsToday}/${DAILY_LIMIT}). Omitiendo ciclo.`);
    return;
  }

  try {
    console.log(`[Scheduler] Fetching ${activeLocationIds.length} estaciones reales... (req #${requestsToday + 1})`);
    const rawData = await fetchBatchMeasurements(activeLocationIds);
    requestsToday += activeLocationIds.length;

    if (rawData.length === 0) {
      console.warn('[Scheduler] ⚠️  0 mediciones recibidas de OpenAQ.');
      return;
    }

    const enriched = enrichMeasurements(rawData);
    await saveMeasurements(enriched);
    console.log(`[Scheduler] ✅ ${enriched.length} mediciones reales guardadas. Total hoy: ${requestsToday}/${DAILY_LIMIT}`);
    await checkAndTriggerAlerts(enriched);
  } catch (err) {
    console.error('[Scheduler] ❌ Error fetch:', err.message);
  }
}

async function checkAndTriggerAlerts(measurements) {
  const maxAqi = Math.max(...measurements.map((m) => m.aqi?.value ?? 0));
  if (maxAqi >= ALERT_AQI_THRESHOLD) {
    const worst = measurements.find((m) => m.aqi?.value === maxAqi);
    console.log(`[Scheduler] 🚨 AQI ${maxAqi} (${worst?.aqi?.category}) — disparando alertas...`);
    triggerAlerts(maxAqi, worst?.aqi?.category, worst?.aqi?.color, worst?.station_id).catch(console.error);
  }
}

// ── Start / Stop ──────────────────────────────────────────────────

async function startScheduler() {
  const mode = FORCE_SIMULATE ? 'SIMULADO (forzado)' : 'AUTO (real → simulado si OpenAQ sin datos)';
  console.log(`\n[Scheduler] Iniciando — modo: ${mode} | intervalo: ${FETCH_INTERVAL_MS / 1000}s`);

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
