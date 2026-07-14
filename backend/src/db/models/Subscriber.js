/**
 * AirGuard – Portal Web para Monitoreo de Calidad del Aire y Salud Ambiental
 Modelo Subscriber
 * Suscriptores de alertas por email y/o notificaciones push
 */

const mongoose = require('mongoose');

const subscriberSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Email inválido'],
  },
  // Web Push subscription object (endpoint + keys)
  push_subscription: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  // Umbral de AQI para disparar alertas (por defecto: Dañino para grupos sensibles = 100)
  alert_threshold: {
    type: Number,
    default: 100,
    min: 0,
    max: 500,
  },
  // Tipos de canal activos
  channels: {
    email: { type: Boolean, default: true },
    push:  { type: Boolean, default: false },
  },
  confirmed: { type: Boolean, default: false }, // email verificado
  confirm_token: { type: String, default: null },
  is_active: { type: Boolean, default: true },
  last_alert_sent: { type: Date, default: null },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

module.exports = mongoose.model('Subscriber', subscriberSchema);
