# AirGuard – Portal Web para Monitoreo de Calidad del Aire y Salud Ambiental

Portal web para monitoreo ciudadano de calidad del aire.
Desarrollado como proyecto de estancia profesional ESIT Grupo SN- 2

## Objetivo
Desarrollar una plataforma web que permita visualizar información sobre la calidad del aire de manera sencilla, 
apoyando la toma de decisiones de la ciudadanía mediante datos abiertos y herramientas de visualización geográfica.

## Introducción 
AirGuard es una API backend desarrollada para brindar monitoreo ciudadano de la calidad del aire en San Salvador, El Salvador. El sistema recolecta, procesa y distribuye datos de contaminantes atmosféricos (PM2.5, PM10, CO, NO2, O3, SO2) provenientes de estaciones de monitoreo, integrando datos reales de la API pública de OpenAQ junto con un módulo de simulación que permite generar mediciones sintéticas cuando no hay datos disponibles o con fines de prueba y desarrollo.

El proyecto está construido sobre Node.js y Express, utiliza MongoDB como base de datos a través de Mongoose, y cuenta con funcionalidades de autenticación (JWT), notificaciones push (web-push), envío de correos (nodemailer) y tareas programadas (node-cron) para la actualización periódica de datos.

Módulo de simulación (simulatorEngine.js)

Cuando OpenAQ no tiene datos disponibles para El Salvador, este módulo genera mediciones simuladas para 6 estaciones de San Salvador, siguiendo patrones horarios realistas de tráfico vehicular y variación aleatoria para mayor naturalidad.

## Tecnologías
- Backend: Node.js + Express.js
- Frontend: Leaflet
- Datos: API OpenAQ
- Base de datos: MongoDB Atlas
- Hosting: Versel + Render
- Controlde versiones: GitHub

## Estructura
- backend/ → Código fuente del servidor, consumo de la API OpenAQ, procesamiento de datos, conexión con MongoDB.
- documentos entregables/ → incluyendo fases de desarrollo, bitácoras, diagramas, informes técnicos, evidencias y entregables.

## Estado
- Fase 0	Completada
- Fase 1	Completada
- Fase 2	Completada
- Fase 3	En Proceso
- Fase 4	Pendiente


