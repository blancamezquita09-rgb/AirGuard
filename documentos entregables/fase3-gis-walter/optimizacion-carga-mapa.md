# Optimizacion de tiempo de carga del mapa
Responsable: Walter Edgardo Rodriguez Valle - GIS Jr.

## Problema detectado
Se identificaron retrasos en la carga del mapa, relacionados con el
tiempo de respuesta de la API (ver Bitacora Fase 3, seccion 4).

## Analisis
El mapa depende de la funcion fetchAll(), la cual espera la respuesta
del backend (a traves de apiFetch()) antes de dibujar los marcadores.
Cuando la API responde lento, el mapa muestra un estado de carga
("Cargando datos...") en lugar de quedar en blanco o romperse.

## Recomendacion GIS
- Mantener el estado de carga visible mientras se obtienen las
  coordenadas, para no confundir al usuario con un mapa vacio.
- Aprovechar el Service Worker ya implementado para mostrar datos en
  cache mientras se espera la respuesta nueva, en vez de esperar en
  blanco.

Evidencia: https://airguard-9sm4.onrender.com/ (seccion Mapa)
