/**
 * AirGuard – REST API Routes
 * Base: /api/v1
 */

const express = require('express');
const router = express.Router();
const Station = require('../db/models/Station');
const {
  getLatestMeasurements,
  getStationHistory,
  getZoneComparison,
} = require('../db/measurementService');

// ── GET /stations ────────────────────────────────────────────────
router.get('/stations', async (_req, res, next) => {
  try {
    const stations = await Station.find({ active: true }).select('-__v').lean();
    res.json({ success: true, data: stations });
  } catch (err) { next(err); }
});

// ── GET /stations/:id ────────────────────────────────────────────
router.get('/stations/:id', async (req, res, next) => {
  try {
    const station = await Station.findOne({ openaq_id: req.params.id }).lean();
    if (!station) return res.status(404).json({ success: false, error: 'Estación no encontrada.' });
    res.json({ success: true, data: station });
  } catch (err) { next(err); }
});

// ── GET /measurements/latest ─────────────────────────────────────
router.get('/measurements/latest', async (_req, res, next) => {
  try {
    const data = await getLatestMeasurements();
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      count: data.length,
      data,
    });
  } catch (err) { next(err); }
});

// ── GET /measurements/:stationId/history ─────────────────────────
router.get('/measurements/:stationId/history', async (req, res, next) => {
  try {
    const hours = Math.min(parseInt(req.query.hours, 10) || 24, 168); // máx 7 días
    const data = await getStationHistory(req.params.stationId, hours);
    res.json({ success: true, station_id: req.params.stationId, hours, data });
  } catch (err) { next(err); }
});

// ── GET /zones/compare ───────────────────────────────────────────
router.get('/zones/compare', async (_req, res, next) => {
  try {
    const data = await getZoneComparison();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── GET /aqi/summary ────────────────────────────────────────────
router.get('/aqi/summary', async (_req, res, next) => {
  try {
    const latest = await getLatestMeasurements();
    if (!latest.length) {
      return res.json({ success: true, data: null });
    }

    const avgAqi = latest.reduce((sum, m) => sum + (m.aqi?.value ?? 0), 0) / latest.length;
    const maxAqi = Math.max(...latest.map((m) => m.aqi?.value ?? 0));
    const worstStation = latest.find((m) => m.aqi?.value === maxAqi);

    const { aqiToCategory } = require('../aqiEngine');
    const { category, color } = aqiToCategory(Math.round(avgAqi));

    res.json({
      success: true,
      data: {
        city: 'San Salvador',
        avg_aqi: Math.round(avgAqi),
        max_aqi: maxAqi,
        category,
        color,
        worst_station: worstStation?.station_id ?? null,
        station_count: latest.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
