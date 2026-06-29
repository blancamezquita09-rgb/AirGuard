/**
 * AirGuard – Measurement Service
 * Operaciones CRUD sobre las colecciones de mediciones y estaciones.
 */

const Measurement = require('./models/Measurement');
const Station     = require('./models/Station');

/**
 * Guarda un batch de mediciones nuevas.
 * @param {Array} measurements
 */
async function saveMeasurements(measurements) {
  if (!measurements?.length) return;

  const docs = measurements.map((m) => ({
    station_id:     m.station_id,
    timestamp:      new Date(m.timestamp),
    pollutants:     m.pollutants,
    aqi:            m.aqi,
    recommendation: m.recommendation,
  }));

  await Measurement.insertMany(docs, { ordered: false });
}

/**
 * Crea o actualiza una estación en la colección stations.
 * Acepta tanto estaciones reales de OpenAQ como simuladas.
 * @param {Object} station  { openaq_id, name, zone, coordinates, is_active }
 */
async function upsertStation(station) {
  return Station.findOneAndUpdate(
    { openaq_id: station.openaq_id },
    {
      $set: {
        name:        station.name,
        zone:        station.zone         ?? 'Centro',
        coordinates: station.coordinates,
        is_active:   station.is_active    ?? station.active ?? true,
        last_update: new Date(),
      },
    },
    { upsert: true, new: true }
  );
}

/**
 * Obtiene todas las estaciones activas.
 * @returns {Promise<Array>}
 */
async function getActiveStations() {
  return Station.find({ is_active: true }, { __v: 0 }).lean();
}

/**
 * Obtiene la última medición de cada estación.
 * @returns {Promise<Array>}
 */
async function getLatestMeasurements() {
  return Measurement.aggregate([
    { $sort: { timestamp: -1 } },
    {
      $group: {
        _id: '$station_id',
        doc: { $first: '$$ROOT' },
      },
    },
    { $replaceRoot: { newRoot: '$doc' } },
    { $sort: { 'aqi.value': -1 } },
  ]);
}

/**
 * Obtiene el historial de mediciones de una estación en las últimas N horas.
 * @param {string} stationId
 * @param {number} hours
 * @returns {Promise<Array>}
 */
async function getStationHistory(stationId, hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return Measurement.find(
    { station_id: stationId, timestamp: { $gte: since } },
    { _id: 0, __v: 0 }
  )
    .sort({ timestamp: 1 })
    .limit(hours * 4); // máximo 4 lecturas por hora
}

/**
 * Obtiene promedios ICA por zona para comparativa.
 * @returns {Promise<Array>}
 */
async function getZoneComparison() {
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000); // últimas 2h

  return Measurement.aggregate([
    { $match: { timestamp: { $gte: since } } },
    {
      $lookup: {
        from:         'stations',
        localField:   'station_id',
        foreignField: 'openaq_id',
        as:           'station',
      },
    },
    { $unwind: '$station' },
    {
      $group: {
        _id:      '$station.zone',
        avg_aqi:  { $avg: '$aqi.value' },
        max_aqi:  { $max: '$aqi.value' },
        stations: { $addToSet: '$station_id' },
      },
    },
    {
      $project: {
        zone:          '$_id',
        avg_aqi:       { $round: ['$avg_aqi', 1] },
        max_aqi:       1,
        station_count: { $size: '$stations' },
      },
    },
    { $sort: { avg_aqi: -1 } },
  ]);
}

module.exports = {
  saveMeasurements,
  upsertStation,
  getActiveStations,
  getLatestMeasurements,
  getStationHistory,
  getZoneComparison,
};
