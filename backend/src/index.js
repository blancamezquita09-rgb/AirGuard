/**
 * AirGuard Backend – Entry Point v0.8.1
 * - API pública /api/v1
 * - API suscripciones /api/v1/subscriptions
 * - API admin /api/admin
 * - Panel admin en /panel-air
 * - Frontend público servido como SPA
 *
 * FRONTEND_DIR puede configurarse via variable de entorno FRONTEND_DIR
 * para adaptarse a distintas estructuras en Render, Docker o local.
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

// ── Resolver ruta del frontend ────────────────────────────────────
// Orden de búsqueda:
// 1. Variable de entorno FRONTEND_DIR (configurable en Render)
// 2. ../public  (frontend copiado dentro del backend — recomendado en Render)
// 3. ../../frontend (monorepo local: backend/src/index.js → ../../frontend)
function resolveFrontendDir() {
  if (process.env.FRONTEND_DIR) {
    return path.resolve(process.env.FRONTEND_DIR);
  }
  const candidates = [
    path.join(__dirname, '..', 'public'),          // backend/public/
    path.join(__dirname, '..', '..', 'frontend'),  // monorepo local
    path.join(__dirname, '..', 'frontend'),        // backend/frontend/
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'index.html'))) {
      return candidate;
    }
  }
  // Fallback: devolver el primer candidato aunque no exista
  // (el servidor arrancará igual, solo fallará al pedir /)
  console.warn('[AirGuard] ⚠️  No se encontró index.html del frontend en ninguna ruta conocida.');
  console.warn('[AirGuard]    Configura la variable FRONTEND_DIR en Render apuntando a la carpeta correcta.');
  return candidates[0];
}

const FRONTEND_DIR = resolveFrontendDir();
const ADMIN_DIR    = path.join(__dirname, '..', 'admin');

console.log(`[AirGuard] Frontend dir: ${FRONTEND_DIR}`);
console.log(`[AirGuard] Admin dir:    ${ADMIN_DIR}`);

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
    version:   '0.8.1',
    timestamp: new Date().toISOString(),
    db:        require('mongoose').connection.readyState === 1 ? 'connected' : 'disconnected',
    frontend:  fs.existsSync(path.join(FRONTEND_DIR, 'index.html')) ? 'found' : 'missing',
  });
});

// ── Rutas API ─────────────────────────────────────────────────────
app.use('/api/v1',   apiRouter);
app.use('/api/v1',   subscriptionsRouter);
app.use('/api/admin', adminRouter);

// ── Panel Admin (ruta oculta) ─────────────────────────────────────
if (fs.existsSync(ADMIN_DIR)) {
  app.use('/panel-air', express.static(ADMIN_DIR));
  app.get('/panel-air*', (_req, res) => {
    const adminIndex = path.join(ADMIN_DIR, 'index.html');
    if (fs.existsSync(adminIndex)) return res.sendFile(adminIndex);
    res.status(404).send('Panel admin no encontrado.');
  });
}

// ── Frontend Público (SPA) ────────────────────────────────────────
app.use(express.static(FRONTEND_DIR));
app.get('*', (_req, res) => {
  const indexPath = path.join(FRONTEND_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.status(503).json({
    error: 'Frontend no encontrado.',
    hint: 'Configura la variable FRONTEND_DIR en Render apuntando a la carpeta que contiene index.html.',
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
    console.log(`\n🌿 AirGuard v0.8.1 — http://localhost:${PORT}`);
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
