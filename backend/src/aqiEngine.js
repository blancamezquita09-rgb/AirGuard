/**
 * AirGuard – AQI Engine (Backend)
 */

const PM25_BREAKPOINTS = [
  { cLow: 0,     cHigh: 12.0,  iLow: 0,   iHigh: 50,  category: 'Buena',              color: '#4caf50' },
  { cLow: 12.1,  cHigh: 35.4,  iLow: 51,  iHigh: 100, category: 'Moderada',           color: '#ffc107' },
  { cLow: 35.5,  cHigh: 55.4,  iLow: 101, iHigh: 150, category: 'Dañina (G. Sens.)',  color: '#ff9800' },
  { cLow: 55.5,  cHigh: 150.4, iLow: 151, iHigh: 200, category: 'Dañina',             color: '#f44336' },
  { cLow: 150.5, cHigh: 250.4, iLow: 201, iHigh: 300, category: 'Muy Dañina',         color: '#9c27b0' },
  { cLow: 250.5, cHigh: 500.4, iLow: 301, iHigh: 500, category: 'Peligrosa',          color: '#7b1fa2' },
];

const PM10_BREAKPOINTS = [
  { cLow: 0,   cHigh: 54,   iLow: 0,   iHigh: 50,  category: 'Buena',              color: '#4caf50' },
  { cLow: 55,  cHigh: 154,  iLow: 51,  iHigh: 100, category: 'Moderada',           color: '#ffc107' },
  { cLow: 155, cHigh: 254,  iLow: 101, iHigh: 150, category: 'Dañina (G. Sens.)',  color: '#ff9800' },
  { cLow: 255, cHigh: 354,  iLow: 151, iHigh: 200, category: 'Dañina',             color: '#f44336' },
  { cLow: 355, cHigh: 424,  iLow: 201, iHigh: 300, category: 'Muy Dañina',         color: '#9c27b0' },
  { cLow: 425, cHigh: 604,  iLow: 301, iHigh: 500, category: 'Peligrosa',          color: '#7b1fa2' },
];

function calcAQI(concentration, breakpoints = PM25_BREAKPOINTS) {
  if (!concentration || concentration <= 0) return null;
  const bp = breakpoints.find(
    (b) => concentration >= b.cLow && concentration <= b.cHigh
  );
  if (!bp) return null;
  const value = Math.round(
    ((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) *
      (concentration - bp.cLow) + bp.iLow
  );
  return { value, category: bp.category, color: bp.color };
}

function aqiToCategory(aqi) {
  if (aqi <= 50)  return { category: 'Buena',              color: '#4caf50' };
  if (aqi <= 100) return { category: 'Moderada',           color: '#ffc107' };
  if (aqi <= 150) return { category: 'Dañina (G. Sens.)',  color: '#ff9800' };
  if (aqi <= 200) return { category: 'Dañina',             color: '#f44336' };
  if (aqi <= 300) return { category: 'Muy Dañina',         color: '#9c27b0' };
  return               { category: 'Peligrosa',             color: '#7b1fa2' };
}

function getHealthRecommendation(category) {
  const map = {
    'Buena':             'La calidad del aire es satisfactoria. Ideal para actividades al aire libre sin restricciones.',
    'Moderada':          'Aceptable. Personas muy sensibles deben considerar reducir esfuerzo prolongado exterior.',
    'Dañina (G. Sens.)': 'Grupos sensibles (niños, adultos mayores, asmáticos) deben limitar actividad exterior.',
    'Dañina':            'Toda la población puede verse afectada. Evite actividades físicas intensas al aire libre.',
    'Muy Dañina':        'Emergencia sanitaria. Grupos sensibles no deben salir. Minimice la exposición.',
    'Peligrosa':         'Alerta máxima. No salga al exterior. Cierre ventanas.',
    'Sin datos':         'No hay mediciones recientes disponibles para esta estación.',
  };
  return map[category] ?? 'Sin información disponible.';
}

module.exports = { calcAQI, aqiToCategory, PM25_BREAKPOINTS, PM10_BREAKPOINTS, getHealthRecommendation };
