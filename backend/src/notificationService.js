/**
 * AirGuard – Portal Web para monitoreo de calidad del aire y salud ambiental El Salvado 
 * Notification Service
 * Envío de alertas por email (nodemailer) y Web Push (web-push)
 *
 * Dependencias a instalar:
 *   npm install nodemailer web-push
 *
 * Generar claves VAPID (solo una vez):
 *   node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log(JSON.stringify(k,null,2))"
 */

const nodemailer = require('nodemailer');
const webpush    = require('web-push');
const Subscriber = require('./db/models/Subscriber');

// ── VAPID (Web Push) ─────────────────────────────────────────────
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${process.env.ALERT_EMAIL_FROM || 'airguard@noreply.com'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

// ── Email Transport ──────────────────────────────────────────────
function getTransport() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// ── Templates ────────────────────────────────────────────────────
function buildAlertEmailHTML(aqi, category, color, station) {
  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)">
    <div style="background:${color};padding:28px 32px;text-align:center">
      <div style="font-size:52px;font-weight:900;color:#fff;line-height:1">${aqi}</div>
      <div style="font-size:16px;color:rgba(255,255,255,.9);margin-top:6px">Índice de Calidad del Aire</div>
      <div style="display:inline-block;background:rgba(255,255,255,.25);border-radius:20px;padding:4px 16px;margin-top:8px;font-size:14px;color:#fff;font-weight:600">${category}</div>
    </div>
    <div style="padding:28px 32px">
      <h2 style="margin:0 0 8px;color:#1565c0;font-size:18px">⚠️ Alerta de Calidad del Aire</h2>
      <p style="color:#444;font-size:14px;line-height:1.6;margin:0 0 16px">
        Se ha detectado un nivel <strong>${category}</strong> de calidad del aire en <strong>${station || 'San Salvador'}</strong>.
        Toma precauciones y limita tu exposición al aire exterior.
      </p>
      <div style="background:#e3f2fd;border-radius:10px;padding:16px;margin-bottom:20px">
        <div style="font-size:12px;font-weight:700;color:#1565c0;text-transform:uppercase;margin-bottom:6px">Recomendación</div>
        <div style="font-size:13px;color:#333">${getRecommendation(aqi)}</div>
      </div>
      <a href="${process.env.APP_URL || 'http://localhost:3001'}" style="display:inline-block;background:#1565c0;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:600">Ver Monitoreo en Vivo</a>
    </div>
    <div style="padding:16px 32px;background:#f8fafd;border-top:1px solid #e0eaf5;font-size:11px;color:#90a4ae;text-align:center">
      AirGuard – Monitoreo Ciudadano de Calidad del Aire, San Salvador, El Salvador<br/>
      <a href="${process.env.APP_URL || 'http://localhost:3001'}/unsubscribe?email={{EMAIL}}" style="color:#90a4ae">Cancelar suscripción</a>
    </div>
  </div>
</body>
</html>`;
}

function getRecommendation(aqi) {
  if (aqi <= 50)  return 'Calidad buena. Puedes realizar actividades al aire libre con normalidad.';
  if (aqi <= 100) return 'Calidad moderada. Los grupos sensibles deben limitar esfuerzo prolongado al aire libre.';
  if (aqi <= 150) return 'Dañino para grupos sensibles. Niños, adultos mayores y personas con enfermedades respiratorias deben reducir actividad exterior.';
  if (aqi <= 200) return 'Dañino para todos. Limita el tiempo al aire libre y usa mascarilla si sales.';
  if (aqi <= 300) return 'Muy dañino. Evita salir al exterior. Cierra ventanas y usa purificador de aire si tienes.';
  return '🚨 Peligroso. Permanece en interiores. Sigue instrucciones de las autoridades de salud.';
}

// ── Enviar alerta por email ───────────────────────────────────────
async function sendEmailAlert(subscriber, aqi, category, color, station) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('[Notifications] SMTP no configurado. Saltando email.');
    return false;
  }
  try {
    const transport = getTransport();
    const html = buildAlertEmailHTML(aqi, category, color, station)
      .replace('{{EMAIL}}', encodeURIComponent(subscriber.email));

    await transport.sendMail({
      from:    `"AirGuard SV" <${process.env.ALERT_EMAIL_FROM || process.env.SMTP_USER}>`,
      to:      subscriber.email,
      subject: `⚠️ Alerta AQI ${aqi} – ${category} en San Salvador`,
      html,
    });
    console.log(`[Notifications] ✅ Email enviado a ${subscriber.email}`);
    return true;
  } catch (err) {
    console.error(`[Notifications] ❌ Error email a ${subscriber.email}:`, err.message);
    return false;
  }
}

// ── Enviar alerta push ────────────────────────────────────────────
async function sendPushAlert(subscriber, aqi, category, color) {
  if (!process.env.VAPID_PUBLIC_KEY || !subscriber.push_subscription) return false;
  try {
    await webpush.sendNotification(
      subscriber.push_subscription,
      JSON.stringify({
        title: `⚠️ Alerta AQI: ${category}`,
        body:  `Índice ${aqi} detectado en San Salvador. Toma precauciones.`,
        icon:  '/icon-192.png',
        badge: '/badge-96.png',
        data:  { url: process.env.APP_URL || '/' },
        tag:   'airguard-alert',
        renotify: true,
      }),
    );
    console.log(`[Notifications] ✅ Push enviado a ${subscriber.email}`);
    return true;
  } catch (err) {
    if (err.statusCode === 410) {
      // Suscripción expirada — desactivar push
      await Subscriber.findByIdAndUpdate(subscriber._id, {
        'channels.push': false,
        push_subscription: null,
      });
      console.log(`[Notifications] Push expirado para ${subscriber.email} — desactivado.`);
    } else {
      console.error(`[Notifications] ❌ Error push:`, err.message);
    }
    return false;
  }
}

// ── Disparar alertas a todos los suscriptores activos ────────────
const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hora entre alertas al mismo usuario

async function triggerAlerts(aqi, category, color, station) {
  try {
    const now = new Date();
    const subscribers = await Subscriber.find({
      is_active: true,
      confirmed: true,
      alert_threshold: { $lte: aqi },
      $or: [
        { last_alert_sent: null },
        { last_alert_sent: { $lt: new Date(now - ALERT_COOLDOWN_MS) } },
      ],
    });

    if (!subscribers.length) return;
    console.log(`[Notifications] Enviando alertas a ${subscribers.length} suscriptores (AQI ${aqi})...`);

    for (const sub of subscribers) {
      let sent = false;
      if (sub.channels?.email) sent = await sendEmailAlert(sub, aqi, category, color, station) || sent;
      if (sub.channels?.push)  sent = await sendPushAlert(sub, aqi, category, color) || sent;
      if (sent) {
        await Subscriber.findByIdAndUpdate(sub._id, { last_alert_sent: now });
      }
    }
  } catch (err) {
    console.error('[Notifications] Error en triggerAlerts:', err.message);
  }
}

module.exports = { triggerAlerts, sendEmailAlert, sendPushAlert };
