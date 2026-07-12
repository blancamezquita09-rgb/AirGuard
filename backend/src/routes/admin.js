/**
 * AirGuard – Admin Routes
 * CRUD de estaciones protegido con JWT
 */

const router  = require('express').Router();
const Station = require('../db/models/Station');
const { generateToken, verifyPassword, requireAuth } = require('../auth');
const { aqiToCategory }  = require('../aqiEngine');
const { triggerAlerts }  = require('../notificationService');

// ── POST /api/admin/login ────────────────────────────────────────
router.post('/login', verifyPassword, (_req, res) => {
  const token = generateToken();
  res.json({ token, expiresIn: '8h' });
});

// ── GET /api/admin/stations ──────────────────────────────────────
router.get('/stations', requireAuth, async (_req, res) => {
  try {
    const stations = await Station.find({}).sort({ name: 1 }).lean();
    res.json({ data: stations, count: stations.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/stations ─────────────────────────────────────
router.post('/stations', requireAuth, async (req, res) => {
  try {
    const { name, openaq_id, coordinates, zone, description, alert_threshold } = req.body;
    if (!name || !coordinates?.lat || !coordinates?.lng) {
      return res.status(400).json({ error: 'name, coordinates.lat y coordinates.lng son requeridos.' });
    }
    const station = await Station.create({
      name,
      openaq_id: openaq_id || `manual-${Date.now()}`,
      coordinates: { lat: Number(coordinates.lat), lng: Number(coordinates.lng) },
      zone:        zone || 'Sin zona',
      description: description || '',
      alert_threshold: Number(alert_threshold) || 100,
      is_active:   true,
      last_update: new Date(),
    });
    res.status(201).json({ data: station });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/admin/stations/:id ──────────────────────────────────
router.put('/stations/:id', requireAuth, async (req, res) => {
  try {
    const { name, coordinates, zone, description, alert_threshold, is_active, openaq_id } = req.body;
    const update = {};
    if (name !== undefined)            update.name            = name;
    if (openaq_id !== undefined)       update.openaq_id       = openaq_id;
    if (zone !== undefined)            update.zone            = zone;
    if (description !== undefined)     update.description     = description;
    if (alert_threshold !== undefined) update.alert_threshold = Number(alert_threshold);
    if (is_active !== undefined)       update.is_active       = Boolean(is_active);
    if (coordinates?.lat !== undefined && coordinates?.lng !== undefined) {
      update.coordinates = {
        lat: Number(coordinates.lat),
        lng: Number(coordinates.lng),
      };
    }
    update.last_update = new Date();

    const station = await Station.findByIdAndUpdate(req.params.id, update, {
      new: true, runValidators: true,
    });
    if (!station) return res.status(404).json({ error: 'Estación no encontrada.' });
    res.json({ data: station });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/admin/stations/:id ──────────────────────────────
router.delete('/stations/:id', requireAuth, async (req, res) => {
  try {
    const station = await Station.findByIdAndDelete(req.params.id);
    if (!station) return res.status(404).json({ error: 'Estación no encontrada.' });
    res.json({ message: `Estación "${station.name}" eliminada.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/test-alert ───────────────────────────────────
// Dispara una alerta REAL (email/push) a los suscriptores activos con un
// valor de AQI de prueba, SIN insertar ningún registro falso en la colección
// Measurements — así el dashboard, mapa e historial no se ven afectados.
// Útil para verificar que el flujo de notificaciones funciona end-to-end.
router.post('/test-alert', requireAuth, async (req, res) => {
  try {
    const aqi     = Number(req.body?.aqi) || 180; // 180 = categoría "Dañina" por defecto
    const station = req.body?.station || 'Prueba Manual (Panel Admin)';
    const { category, color } = aqiToCategory(aqi);

    await triggerAlerts(aqi, category, color, station);

    res.json({
      success: true,
      message: `Alerta de prueba (AQI ${aqi} — ${category}) enviada a los suscriptores elegibles.`,
      aqi, category, color, station,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
