/**
 * AirGuard Backend – Entry Point v0.8.3
 */

require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');
const path      = require('path');
const fs        = require('fs');

const connectDB           = require('./db/connection');
const apiRouter           = require('./routes/api');
const adminRouter         = require('./routes/admin');
const subscriptionsRouter = require('./routes/subscriptions');
const { startScheduler }  = require('./scheduler');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Trust Proxy ───────────────────────────────────────────────────
// Render (y cualquier plataforma con load balancer) pasa el IP real
// del cliente en el header X-Forwarded-For.
// Sin esta línea, express-rate-limit lanza ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
// '1' = confiar en UN nivel de proxy (el de Render). Suficiente y seguro.
app.set('trust proxy', 1);

// ── Resolver ruta del frontend ────────────────────────────────────
function resolveFrontendDir() {
  if (process.env.FRONTEND_DIR) {
    return path.resolve(process.env.FRONTEND_DIR);
  }
  const candidates = [
    path.join(__dirname, '..', 'public'),         // backend/public/ ← Render
    path.join(__dirname, '..', '..', 'frontend'), // monorepo local
    path.join(__dirname, '..', 'frontend'),       // backend/frontend/
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'index.html'))) return c;
  }
  console.warn('[AirGuard] ⚠️  index.html no encontrado. Configura FRONTEND_DIR en Render.');
  return candidates[0];
}

const FRONTEND_DIR = resolveFrontendDir();
const ADMIN_DIR    = path.join(__dirname, '..', 'admin');
console.log(`[AirGuard] Frontend: ${FRONTEND_DIR}`);

// ── CORS ──────────────────────────────────────────────────────────
const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL, `http://localhost:${PORT}`, 'http://127.0.0.1:3001']
  : true;
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD'],
  credentials: false,
}));

// ── Security & Logging ────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(morgan('combined'));
app.use(express.json());

// ── Rate Limiters ─────────────────────────────────────────────────
// trust proxy ya está activo, así que express-rate-limit puede leer el IP real
app.use('/api/v1', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Intenta en 15 minutos.' },
}));
app.use('/api/admin/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Demasiados intentos de login. Espera 15 minutos.' },
}));

// ── Health Check ──────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status:    'ok',
    service:   'AirGuard API',
    version:   '0.8.3',
    timestamp: new Date().toISOString(),
    db:        require('mongoose').connection.readyState === 1 ? 'connected' : 'disconnected',
    frontend:  fs.existsSync(path.join(FRONTEND_DIR, 'index.html')) ? 'found' : 'missing',
  });
});

// ── Rutas API ─────────────────────────────────────────────────────
app.use('/api/v1',    apiRouter);
app.use('/api/v1',    subscriptionsRouter);
app.use('/api/admin', adminRouter);

// ── Panel Admin ───────────────────────────────────────────────────
if (fs.existsSync(ADMIN_DIR)) {
  app.use('/panel-air', express.static(ADMIN_DIR));
  app.get('/panel-air*', (_req, res) => {
    const f = path.join(ADMIN_DIR, 'index.html');
    fs.existsSync(f) ? res.sendFile(f) : res.status(404).send('Panel no encontrado.');
  });
}

// ── Frontend SPA ──────────────────────────────────────────────────
app.use(express.static(FRONTEND_DIR));
app.get('*', (_req, res) => {
  const f = path.join(FRONTEND_DIR, 'index.html');
  if (fs.existsSync(f)) return res.sendFile(f);
  res.status(503).json({
    error: 'Frontend no encontrado.',
    hint:  'Configura FRONTEND_DIR en Render apuntando a la carpeta con index.html.',
    tried: FRONTEND_DIR,
  });
});

// ── Error Handler ─────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[Error]', err.message);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

// ── Start ─────────────────────────────────────────────────────────
async function main() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`\n🌿 AirGuard v0.8.3 — http://localhost:${PORT}`);
    console.log(`   API:         http://localhost:${PORT}/api/v1`);
    console.log(`   Panel admin: http://localhost:${PORT}/panel-air`);
    console.log(`   Frontend:    ${FRONTEND_DIR}\n`);
    startScheduler();
  });
}

main().catch((err) => {
  console.error('Error fatal al iniciar:', err.message);
  process.exit(1);
});
