/**
 * AirGuard – Subscription Routes
 * Base: /api/v1/subscriptions
 */

const router     = require('express').Router();
const crypto     = require('crypto');
const Subscriber = require('../db/models/Subscriber');

// ── POST /subscribe ──────────────────────────────────────────────
// Registrar email (y opcionalmente push subscription)
router.post('/subscribe', async (req, res) => {
  try {
    const { email, alert_threshold, push_subscription } = req.body;
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: 'Email inválido.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const existing = await Subscriber.findOne({ email: email.toLowerCase().trim() });

    if (existing) {
      // Reactivar si estaba desuscrito
      if (!existing.is_active) {
        await Subscriber.findByIdAndUpdate(existing._id, {
          is_active: true,
          alert_threshold: alert_threshold ?? existing.alert_threshold,
          push_subscription: push_subscription || existing.push_subscription,
          'channels.push': Boolean(push_subscription),
        });
        return res.json({ success: true, message: 'Suscripción reactivada.' });
      }
      return res.json({ success: true, message: 'Este email ya está suscrito.' });
    }

    await Subscriber.create({
      email: email.toLowerCase().trim(),
      alert_threshold: alert_threshold ?? 100,
      push_subscription: push_subscription || null,
      channels: { email: true, push: Boolean(push_subscription) },
      confirmed: true, // Simplificado: sin doble opt-in por ahora
      confirm_token: token,
    });

    res.status(201).json({ success: true, message: '✅ Suscripción registrada. Recibirás alertas cuando el AQI supere tu umbral.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /subscribe/push ─────────────────────────────────────────
// Guardar o actualizar Web Push subscription para un email existente
router.post('/subscribe/push', async (req, res) => {
  try {
    const { email, push_subscription } = req.body;
    if (!email || !push_subscription?.endpoint) {
      return res.status(400).json({ error: 'Email y push_subscription requeridos.' });
    }
    const sub = await Subscriber.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      { push_subscription, 'channels.push': true },
      { new: true, upsert: false },
    );
    if (!sub) return res.status(404).json({ error: 'Email no suscrito. Suscríbete primero.' });
    res.json({ success: true, message: 'Notificaciones push activadas.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /unsubscribe ─────────────────────────────────────────────
// Cancelar suscripción via link de email
router.get('/unsubscribe', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).send('Email requerido.');
    await Subscriber.findOneAndUpdate(
      { email: decodeURIComponent(email).toLowerCase() },
      { is_active: false },
    );
    res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#f0f4f8">
        <h2 style="color:#1565c0">✅ Suscripción cancelada</h2>
        <p style="color:#555">Ya no recibirás alertas de AirGuard en este email.</p>
        <a href="/" style="color:#1565c0">Volver a AirGuard</a>
      </body></html>`);
  } catch (err) {
    res.status(500).send('Error al cancelar suscripción.');
  }
});

// ── GET /vapid-public-key ────────────────────────────────────────
// El frontend necesita la clave pública VAPID para registrar push
router.get('/vapid-public-key', (_req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return res.status(503).json({ error: 'Push notifications no configuradas.' });
  res.json({ vapidPublicKey: key });
});

module.exports = router;
