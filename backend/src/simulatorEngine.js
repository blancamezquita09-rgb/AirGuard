/**
 * AirGuard – Portal Web para monitoreo de calidad del aire y salud ambiental El Salvador 
 * Simulator Engine
 *
 * Genera mediciones realistas para 6 estaciones de San Salvador
 * cuando OpenAQ no tiene datos disponibles para El Salvador.
 *
 * Características del modelo:
 * - Sigue patrones horarios reales (picos 7–9h y 17–19h por tráfico vehicular)
 * - Variación aleatoria ±15% para naturalidad
 * - Umbrales por zona: industrial > centro > residencial
 * - Los valores base están calibrados con datos históricos de ciudades
 *   latinoamericanas de densidad similar (Ciudad de Guatemala, San José CR)
 *
 * Activación: variable de entorno SIMULATE_DATA=true
 */

/**
 * Módulo de simulación de mediciones de calidad del aire
 * -------------------------------------------------------
 * Descripción:
 * Este módulo genera datos simulados de mediciones de contaminantes
 * (PM2.5, PM10, CO, NO2, O3, SO2) para un conjunto de estaciones
 * de monitoreo, replicando el formato que produce el scheduler al
 * procesar datos reales de la API de OpenAQ.
 *
 * Funciones principales:
 * - generateSimulatedMeasurements(): genera lecturas simuladas por
 *   estación, ajustadas según la hora del día (factor de carga/tráfico)
 *   y con variación aleatoria (jitter) para simular condiciones reales.
 *   El ozono (O3) se calcula de forma inversamente proporcional al
 *   tráfico, reflejando su comportamiento fotoquímico.
 * - getSimulatedStations(): retorna los metadatos de las estaciones
 *   simuladas en el formato esperado por upsertStation().
  */

// ── Estaciones de San Salvador ────────────────────────────────────
const SIMULATED_STATIONS = [
  {
    openaq_id:   'sv-centro-historico',
    name:        'Centro Histórico',
    zone:        'Centro',
    coordinates: { lat: 13.6942, lng: -89.2219 },
    // Zona de alto tráfico vehicular – valores elevados en horas pico
    pollutantProfile: { pm25: 18, pm10: 32, co: 1.2, no2: 28, o3: 38, so2: 8 },
  },
  {
    openaq_id:   'sv-zona-industrial',
    name:        'Zona Industrial Norte',
    zone:        'Norte',
    coordinates: { lat: 13.7180, lng: -89.2090 },
    // Zona industrial – PM10 y SO2 más elevados
    pollutantProfile: { pm25: 22, pm10: 45, co: 1.8, no2: 35, o3: 30, so2: 18 },
  },
  {
    openaq_id:   'sv-soyapango',
    name:        'Soyapango',
    zone:        'Este',
    coordinates: { lat: 13.7073, lng: -89.1514 },
    // Zona densamente poblada con actividad industrial mixta
    pollutantProfile: { pm25: 20, pm10: 38, co: 1.5, no2: 30, o3: 35, so2: 12 },
  },
  {
    openaq_id:   'sv-santa-tecla',
    name:        'Santa Tecla',
    zone:        'Oeste',
    coordinates: { lat: 13.6776, lng: -89.2801 },
    // Zona residencial – valores más bajos
    pollutantProfile: { pm25: 10, pm10: 20, co: 0.6, no2: 15, o3: 42, so2: 4 },
  },
  {
    openaq_id:   'sv-san-marcos',
    name:        'San Marcos',
    zone:        'Sur',
    coordinates: { lat: 13.6621, lng: -89.1984 },
    // Zona residencial/comercial – valores moderados
    pollutantProfile: { pm25: 13, pm10: 25, co: 0.9, no2: 20, o3: 40, so2: 6 },
  },
  {
    openaq_id:   'sv-ilopango',
    name:        'Ilopango',
    zone:        'Este',
    coordinates: { lat: 13.7004, lng: -89.1072 },
    // Cercano al aeropuerto – NO2 y CO algo elevados
    pollutantProfile: { pm25: 15, pm10: 28, co: 1.1, no2: 25, o3: 36, so2: 7 },
  },
];

/**
 * Factor de carga horaria (0.6 – 1.8).
 * Simula el patrón de tráfico vehicular en San Salvador:
 *   - Madrugada (0-5h): baja carga vehicular
 *   - Pico matutino (6-9h): alta carga vehicular
 *   - Mediodía (10-14h): carga media-alta vehicular
 *   - Pico vespertino (15-19h): alta carga vehicular
 *   - Noche (20-23h): baja-media carga vehicular
 */
function hourlyLoadFactor(hour) {
  const factors = [
    0.60, 0.55, 0.52, 0.50, 0.55, 0.70,  // 0–5h  (madrugada)
    0.95, 1.50, 1.80, 1.60, 1.30, 1.20,  // 6–11h (pico mañana)
    1.15, 1.10, 1.05, 1.20, 1.55, 1.75,  // 12–17h (tarde)
    1.70, 1.40, 1.10, 0.90, 0.80, 0.70,  // 18–23h (noche)
  ];
  return factors[hour] ?? 1.0;
}

/**
 * Variación aleatoria ±variation% sobre un valor base.
 */
function jitter(value, variation = 0.15) {
  const factor = 1 + (Math.random() * 2 - 1) * variation;
  return Math.max(0, Math.round(value * factor * 100) / 100);
}

/**
 * Genera mediciones simuladas para todas las estaciones.
 * @returns {Array} Array con formato igual al de OpenAQ procesado por el scheduler
 */
function generateSimulatedMeasurements() {
  const now  = new Date();
  const hour = now.getHours();
  const load = hourlyLoadFactor(hour);

  return SIMULATED_STATIONS.map((station) => {
    const p = station.pollutantProfile;

    const pollutants = {
      pm25: jitter(p.pm25 * load),
      pm10: jitter(p.pm10 * load),
      co:   jitter(p.co   * load),
      no2:  jitter(p.no2  * load),
      o3:   jitter(p.o3   * (2 - load)), // O3 inversamente proporcional al tráfico (fotoquímica)
      so2:  jitter(p.so2  * load),
    };

    return {
      station_id:  station.openaq_id,
      timestamp:   now.toISOString(),
      pollutants,
      _simulated:  true,
    };
  });
}

/**
 * Retorna los metadatos de las estaciones simuladas
 * con el formato esperado por upsertStation().
 */
function getSimulatedStations() {
  return SIMULATED_STATIONS.map((s) => ({
    openaq_id:   s.openaq_id,
    name:        s.name,
    zone:        s.zone,
    coordinates: s.coordinates,
    is_active:   true,
  }));
}

module.exports = { generateSimulatedMeasurements, getSimulatedStations, SIMULATED_STATIONS };
