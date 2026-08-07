# Consumo de API y Visualización - Fase 4 (Cierre)

## Consumo de API

AirGuard integra datos ambientales mediante consultas periódicas hacia la API de OpenAQ, plataforma de datos abiertos de calidad del aire.

El proceso realiza:
- Solicitud de datos actualizados.
- Recepción de mediciones ambientales.
- Validación de la información recibida.
- Transformación de datos al formato utilizado por el sistema.

En caso de no contar con datos disponibles para una zona específica, el sistema permite trabajar con datos simulados para mantener la funcionalidad del portal durante pruebas y demostraciones.

## Procesamiento

Los datos recibidos son validados y clasificados según los niveles de calidad del aire definidos por el backend, antes de ser almacenados.

## Almacenamiento

Las mediciones procesadas se guardan en la colección "Mediciones", que incluye: identificador, estación, país, ciudad, coordenadas geográficas, contaminante, valor registrado, unidad de medición, fecha de medición y categoría de calidad del aire.

## Visualización

El frontend consume los datos ya procesados y los presenta mediante:
- Dashboard de indicadores.
- Mapa interactivo con la ubicación de las estaciones.
- Filtros por contaminante y nivel de calidad.
- Visualización gráfica de los datos históricos.

Este documento cierra el ciclo completo: desde el origen del dato en OpenAQ hasta su representación final en el mapa e indicadores del portal AirGuard.
