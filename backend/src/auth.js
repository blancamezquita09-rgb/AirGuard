/**
 * AirGuard – Auth Middleware
 * JWT stateless + rate limiting de intentos de login
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET   = process.env.ADMIN_JWT_SECRET || 'cambia-este-secreto-en-env';
const JWT_EXPIRES  = '8h';
const ADMIN_PASS   = process.env.ADMIN_PASSWORD   || 'cambia-esta-clave-en-env';

// ── Intentos fallidos por IP (en memoria) ────────────────────────
const failedAttempts = new Map(); // ip → { count, blockedUntil }
const MAX_ATTEMPTS   = 3;
const BLOCK_MS       = 15 * 60 * 1000; // 15 minutos

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim()
    || req.socket.remoteAddress
    || 'unknown';
}

// ── Generar token ────────────────────────────────────────────────
function generateToken() {
  return jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

// ── Verificar contraseña con rate limiting ────────────────────────
function verifyPassword(req, res, next) {
  const ip = getClientIP(req);
  const now = Date.now();
  const state = failedAttempts.get(ip) || { count: 0, blockedUntil: 0 };

  if (state.blockedUntil > now) {
    const mins = Math.ceil((state.blockedUntil - now) / 60000);
    return res.status(429).json({
      error: `Demasiados intentos. Intenta de nuevo en ${mins} minuto(s).`,
    });
  }

  const { password } = req.body;
  if (!password || password !== ADMIN_PASS) {
    state.count += 1;
    if (state.count >= MAX_ATTEMPTS) {
      state.blockedUntil = now + BLOCK_MS;
      state.count = 0;
    }
    failedAttempts.set(ip, state);
    const remaining = MAX_ATTEMPTS - state.count;
    return res.status(401).json({
      error: `Contraseña incorrecta.${remaining > 0 ? ` Intentos restantes: ${remaining}` : ' IP bloqueada por 15 minutos.'}`,
    });
  }

  // Éxito → limpiar intentos
  failedAttempts.delete(ip);
  next();
}

// ── Verificar JWT en requests protegidos ─────────────────────────
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Token requerido.' });
  }

  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Sesión expirada. Inicia sesión de nuevo.' });
    }
    return res.status(401).json({ error: 'Token inválido.' });
  }
}

module.exports = { generateToken, verifyPassword, requireAuth };
