/**
 * AirGuard – Portal Web para monitoreo de calidad del aire y salud ambiental El Salvado
 * Mongoose Model: Station
 */

const mongoose = require('mongoose');

const stationSchema = new mongoose.Schema(
  {
    openaq_id: { type: String, required: true, unique: true },
    name:      { type: String, required: true },
    zone:      { type: String, enum: ['Centro', 'Norte', 'Este', 'Oeste', 'Sur'], default: 'Centro' },
    coordinates: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    is_active:    { type: Boolean, default: true },
    last_updated: { type: Date, default: Date.now },
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

module.exports = mongoose.model('Station', stationSchema);
