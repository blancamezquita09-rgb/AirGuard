/**
 * AirGuard – Mongoose Model: Measurement
 */

const mongoose = require('mongoose');

const pollutantSchema = new mongoose.Schema(
  {
    value: { type: Number, required: true },
    unit:  { type: String, required: true },
  },
  { _id: false }
);

const aqiSchema = new mongoose.Schema(
  {
    value:              { type: Number },
    category:           { type: String },
    color:              { type: String },
    dominant_pollutant: { type: String, default: 'pm25' },
  },
  { _id: false }
);

const measurementSchema = new mongoose.Schema(
  {
    // Sin "index: true" aquí — los índices se declaran abajo con schema.index()
    station_id:     { type: String, required: true },
    timestamp:      { type: Date,   required: true },
    pollutants: {
      pm25: pollutantSchema,
      pm10: pollutantSchema,
      co:   pollutantSchema,
      no2:  pollutantSchema,
      o3:   pollutantSchema,
      so2:  pollutantSchema,
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
