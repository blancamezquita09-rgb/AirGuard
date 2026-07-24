# Diagrama de Arquitectura - Parte GIS
Responsable: Walter Edgardo Rodríguez Valle - GIS Jr.

## Flujo de los datos hasta el mapa

1. La API de OpenAQ envía los datos de calidad del aire.
2. El backend guarda esos datos en MongoDB, en la coleccion "Measurements".
3. Cada dato tiene coordenadas (latitud y longitud).
4. Para que el mapa pueda buscar puntos por ubicacion de forma rapida,
   se necesita un indice especial en MongoDB llamado "2dsphere".
5. El mapa (Leaflet) toma esos datos y dibuja los puntos en el mapa.

## Leyenda del mapa

Para que el usuario no se confunda, el mapa debe mostrar claramente
si un punto es un dato real (de OpenAQ) o un dato de prueba (demo),
usando colores o etiquetas distintas.
## Evidencia - Mapa funcionando en vivo

El mapa geoespacial ya está desplegado y funcionando en producción,
mostrando las estaciones activas con sus valores en tiempo real.

Portal en vivo: https://airguard-9sm4.onrender.com/
Captura de evidencia: https://github.com/blancamezquita09-rgb/AirGuard/blob/main/documentos%20entregables/fase3-gis-walter/mapa-airguard-walter.png
