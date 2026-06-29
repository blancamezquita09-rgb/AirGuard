/**
 * AirGuard Backend – Entry Point v0.7.0
 * - API pública /api/v1 (mediciones, estaciones, AQI)
 * - API suscripciones /api/v1/subscriptions (email + push)
 * - API admin /api/admin (CRUD estaciones, JWT)
 * - Panel admin en /panel-air (ruta oculta)
 * - Frontend público servido como SPA
 */

require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');
const path      = require('path');

const connectDB              = require('./db/connection');
const apiRouter              = require('./routes/api');
const adminRouter            = require('./routes/admin');
const subscriptionsRouter    = require('./routes/subscriptions');
const { startScheduler }     = require('./scheduler');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── CORS ──────────────────────────────────────────────────────────
const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL, 'http://localhost:3001', 'http://127.0.0.1:3001']
  : true;
app.use(cors({ origin: allowedOrigins, methods: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD'], credentials: false }));

// ── Security ──────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// ── General Middleware ────────────────────────────────────────────
app.use(morgan('combined'));
app.use(express.json());

// ── Rate Limiters ─────────────────────────────────────────────────
app.use('/api/v1', rateLimit({
  windowMs: 15 * 60 * 1000, max: 300,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Intenta en 15 minutos.' },
}));
app.use('/api/admin/login', rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  standardHeaders: true, legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Demasiados intentos de login. Espera 15 minutos.' },
}));

// ── Health Check ──────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status:    'ok',
    service:   'AirGuard API',
    version:   '0.7.0',
    timestamp: new Date().toISOString(),
    db:        require('mongoose').connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

// ── Rutas API ─────────────────────────────────────────────────────
app.use('/api/v1',            apiRouter);
app.use('/api/v1',            subscriptionsRouter); // /api/v1/subscribe, /api/v1/unsubscribe, etc.
app.use('/api/admin',         adminRouter);

// ── Panel Admin (ruta oculta) ─────────────────────────────────────
const ADMIN_DIR = path.join(__dirname, '..', 'admin');
app.use('/panel-air', express.static(ADMIN_DIR));
app.get('/panel-air*', (_req, res) => res.sendFile(path.join(ADMIN_DIR, 'index.html')));

// ── Frontend Público ──────────────────────────────────────────────
const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend');
app.use(express.static(FRONTEND_DIR));
app.get('*', (_req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));

// ── Error Handler ─────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[Error]', err.message);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

// ── Start ─────────────────────────────────────────────────────────
async function main() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`\n🌿 AirGuard v0.7.0 — http://localhost:${PORT}`);
    console.log(`   Frontend:    http://localhost:${PORT}`);
    console.log(`   Panel admin: http://localhost:${PORT}/panel-air`);
    console.log(`   API pública: http://localhost:${PORT}/api/v1`);
    console.log(`   Suscripciones: http://localhost:${PORT}/api/v1/subscribe\n`);
    startScheduler();
  });
}

main().catch((err) => {
  console.error('Error fatal al iniciar:', err.message);
  process.exit(1);
});
