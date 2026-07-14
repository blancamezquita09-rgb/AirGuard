/**
 * AirGuard – Portal Web para Monitoreo de Calidad del Aire y Salud Ambiental
 MongoDB Connection
 * Conecta con MongoDB Atlas usando Mongoose.
 */

const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

async function connectDB() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI no está definida en las variables de entorno.');
  }

  try {
    await mongoose.connect(MONGODB_URI, {
      dbName: 'airguard',
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10_000,
    });
    console.log('✅ MongoDB Atlas conectado correctamente.');
  } catch (err) {
    console.error('❌ Error conectando a MongoDB:', err.message);
    throw err;
  }

  mongoose.connection.on('error', (err) => {
    console.error('[MongoDB] Error de conexión:', err);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[MongoDB] Desconectado. Reconectando...');
  });
}

module.exports = connectDB;
