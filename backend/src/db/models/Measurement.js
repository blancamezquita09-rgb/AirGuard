/**
 * AirGuard – Mongoose Model: Measurement
 */

const mongoose = require('mongoose');

const aqiSchema = new mongoose.Schema(
  {
    value:              { type: Number },
    category:           { type: String },
    color:              { type: String },
    dominant_pollutant: { type: String, default: 'pm25' },
  },
  { _id: false }
);

// Los contaminantes se guardan como números planos (µg/m³ o ppm según
// corresponda). El scheduler ya normaliza los valores antes de guardar,
// por lo que no se requiere un sub-documento {value, unit} aquí.
const measurementSchema = new mongoose.Schema(
  {
    // Sin "index: true" aquí — los índices se declaran abajo con schema.index()
    station_id:     { type: String, required: true },
    timestamp:      { type: Date,   required: true },
    pollutants: {
      pm25: { type: Number, default: 0 },
      pm10: { type: Number, default: 0 },
      co:   { type: Number, default: 0 },
      no2:  { type: Number, default: 0 },
      o3:   { type: Number, default: 0 },
      so2:  { type: Number, default: 0 },
    },
    aqi:            aqiSchema,
    recommendation: { type: String },
  },
  {
    versionKey: false,
    timestamps: false,
  }
);

// Índice compuesto – historial por estación (query más frecuente)
measurementSchema.index({ station_id: 1, timestamp: -1 });

// TTL – auto-eliminar documentos después de 90 días
// NOTA: timestamp NO debe tener "index: true" en el campo para evitar duplicado
measurementSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7_776_000 });

module.exports = mongoose.model('Measurement', measurementSchema);

