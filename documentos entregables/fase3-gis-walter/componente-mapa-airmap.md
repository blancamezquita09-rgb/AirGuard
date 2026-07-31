# Mapa Interactivo (Leaflet) - Ficha Tecnica
Responsable: Walter Edgardo Rodriguez Valle - GIS Jr.
Fase: 3 - Portal Web y Pruebas

## Descripcion
El frontend de AirGuard esta construido en HTML y JavaScript nativo
(sin frameworks como React o Vue). Al cargar index.html se ejecuta
la funcion fetchAll(), que pide los datos al backend y los vuelve a
pedir de forma periodica.

## Funcionalidad del mapa
- Se construye con Leaflet, usando los datos ya normalizados que
  entrega el backend a traves de la funcion apiFetch().
- Cada estacion con coordenadas validas se dibuja como un marcador.
- El color del marcador corresponde a la categoria ICA.
- Las estaciones sin coordenadas validas no se dibujan en el mapa,
  pero permanecen visibles en la lista lateral, segun quedo validado
  en el Caso de Prueba CV-04 de la matriz de pruebas de Fase 3
  ("Coordenadas faltantes").

## Manejo de fallas
Si el backend no responde, apiFetch() reintenta una vez. Si sigue sin
haber conexion, el mapa no se rompe: se muestra un aviso y se
conserva la ultima informacion guardada en cache (Service Worker).

## Contrato de datos
El mapa nunca calcula el ICA ni guarda mediciones - solo pide, recibe
y muestra, siguiendo el contrato de rutas documentado en
API_CONTRACT.md.

## Evidencia
Portal en vivo: https://airguard-9sm4.onrender.com/
