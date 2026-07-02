# AirGuard – Guía de Implementación Completa
**Versión:** 2.2.0 | **Fecha:** 2026-07-01 | **Proyecto:** AirGuard – Monitoreo Ciudadano de Calidad del Aire, San Salvador

---

## ¿Qué es AirGuard?

AirGuard es una aplicación web progresiva (PWA) que muestra en tiempo real la calidad del aire en San Salvador, El Salvador. Obtiene datos de sensores reales a través de la API pública de OpenAQ v3, los almacena en MongoDB Atlas, y los presenta al ciudadano con el índice de calidad del aire (ICA/AQI), mapas Leaflet, gráficos históricos (Chart.js) y alertas automáticas por email o notificación push cuando los niveles son peligrosos.

---

## Arquitectura del Sistema

```
[OpenAQ API v3]  →  [Backend Express en Render]  →  [MongoDB Atlas]
                            ↕
                  [Usuario en el navegador]
                  (Frontend servido por el mismo Express)
```

**Single-stack:** el servidor Express sirve tanto la API REST (`/api/v1`) como el frontend HTML estático (`/public`). No hay servidor de frontend separado. Todo se despliega en un solo Web Service de Render.

### Estructura del repositorio en GitHub

```
airguard/
└── backend/
    ├── public/              ← Frontend (index.html, sw.js, manifest, iconos)
    ├── admin/               ← Panel de administración (/panel-air)
    ├── src/
    │   ├── index.js         ← Servidor Express (punto de entrada)
    │   ├── aqiEngine.js     ← Cálculo del ICA/AQI
    │   ├── openaq.js        ← Cliente API OpenAQ v3
    │   ├── scheduler.js     ← Ciclo de ingesta cada 90 segundos
    │   ├── notificationService.js
    │   ├── auth.js
    │   ├── db/
    │   │   ├── connection.js
    │   │   ├── measurementService.js
    │   │   └── models/      ← Measurement, Station, Subscriber
    │   └── routes/          ← api.js, admin.js, subscriptions.js
    ├── .env.example
    ├── package.json
    └── render.yaml
```

---

## PARTE 1: MongoDB Atlas (Base de datos)

### 1.1 Crear cuenta y cluster

1. Ve a [cloud.mongodb.com](https://cloud.mongodb.com) y crea una cuenta gratuita.
2. Crea un proyecto, por ejemplo `airguard-proyecto`.
3. Clic en **"Create"** → **"Build a Database"** → plan **M0 FREE**.
4. Proveedor: cualquiera (AWS recomendado). Región: **N. Virginia (us-east-1)**.
5. Nombre del cluster: `airguard`. Clic en **"Create Deployment"**.

### 1.2 Crear usuario de base de datos

1. Menú izquierdo → **"Database Access"** → **"Add New Database User"**.
2. Método: **Password**.
3. Usuario: `airguard` | Contraseña: crea una segura y guárdala.
4. Privilegios: **"Read and write to any database"**.
5. Clic en **"Add User"**.

### 1.3 Abrir el acceso de red

1. Menú izquierdo → **"Network Access"** → **"Add IP Address"**.
2. Clic en **"Allow Access from Anywhere"** → agrega `0.0.0.0/0`.
3. Clic en **"Confirm"**.

> ⚠️ Sin este paso, Render no puede conectarse a la base de datos y verás `ECONNREFUSED` en los logs.

### 1.4 Obtener la cadena de conexión (MONGODB_URI)

1. **"Database"** → **"Connect"** sobre tu cluster → **"Drivers"** → Node.js 6.x.
2. Copia la cadena y arma la URI final:

```
mongodb+srv://airguard:TuContraseña@airguard0.abc123.mongodb.net/airguard?retryWrites=true&w=majority&appName=airguard
```

Reemplaza `TuContraseña` y el hostname con los de tu cluster real.

> Esta cadena es tu `MONGODB_URI`. No la subas a GitHub ni la compartas.

---

## PARTE 2: API Key de OpenAQ v3

OpenAQ es la fuente gratuita de datos de calidad del aire. AirGuard usa su API v3 con el dominio `api.openaq.org`.

### 2.1 Registrarse

1. Ve a [explore.openaq.org/register](https://explore.openaq.org/register).
2. Crea cuenta con tu email y actívala.

### 2.2 Obtener la clave

1. Inicia sesión → ve a tu perfil → sección **"API Keys"**.
2. Crea una nueva key y cópiala.

> ⚠️ Límite gratuito: **1,000 peticiones/día**. AirGuard usa ~960/día (1 cada 90s). No bajes `OPENAQ_FETCH_INTERVAL_MS` por debajo de 90000 o agotarás el límite.

> ⚠️ Sin la API key el scheduler falla con `401 Unauthorized` y la app no tendrá datos reales.

---

## PARTE 3: Correo para alertas (Gmail SMTP)

### 3.1 Activar verificación en dos pasos

1. [myaccount.google.com/security](https://myaccount.google.com/security) → activar **"2-Step Verification"**.

### 3.2 Crear contraseña de aplicación

1. [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
2. Escribe el nombre de la app: `AirGuard` → clic en **"Generate"**.
3. Copia los 16 caracteres (sin espacios). Esa es tu `SMTP_PASS`.

> ⚠️ No uses tu contraseña normal de Gmail. Google la bloqueará con error `535-5.7.8`. Siempre usa la contraseña de aplicación.

> Si no configuras el email, la app funciona pero los suscriptores no recibirán alertas por correo.

---

## PARTE 4: Claves VAPID para notificaciones push

Las notificaciones push llegan al celular o navegador aunque el usuario no tenga la página abierta. Requieren un par de claves VAPID (generadas una sola vez).

### 4.1 Generar las claves

Desde la carpeta `backend`:

```bash
node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log('VAPID_PUBLIC_KEY='+k.publicKey+'\nVAPID_PRIVATE_KEY='+k.privateKey)"
```

Verás:

```
VAPID_PUBLIC_KEY=BGy7m3fHrk...
VAPID_PRIVATE_KEY=mFkL7cXs9...
```

> ⚠️ Genera estas claves **una sola vez** y guárdalas permanentemente. Si las cambias, las suscripciones push existentes quedarán inválidas y los usuarios dejarán de recibir notificaciones.

> Si no configuras VAPID, el botón de notificaciones push mostrará "No configuradas". Las alertas por email sí funcionan independientemente.

---

## PARTE 5: Secreto JWT para el panel admin

El panel de administración (`/panel-air`) usa JWT para autenticar al administrador.

### 5.1 Generar el secreto

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Copia la cadena resultante. Esa es tu `ADMIN_JWT_SECRET`.

> ⚠️ No uses un secreto corto o predecible. Usa siempre el generado aleatoriamente con 64 bytes.


---

## PARTE 5.5: Modo de Datos Simulados

Si OpenAQ no tiene estaciones activas monitoreando El Salvador, el scheduler no encontrará datos y la aplicación quedará sin lecturas reales. AirGuard incluye un motor de simulación que genera mediciones realistas basadas en patrones horarios calibrados.

### Cómo funciona

El **Simulator Engine** (`simulatorEngine.js`) genera mediciones para 6 estaciones fijas de San Salvador con:
- **Patrones horarios reales:** picos de contaminación a las 7–9h y 17–19h por tráfico vehicular
- **Variación aleatoria ±15%** por lectura para naturalidad visual (no son valores fijos)
- **Perfiles por zona:** la Zona Industrial Norte tiene PM10 y SO2 más altos; Santa Tecla (residencial) tiene valores más bajos
- **O₃ inversamente proporcional al tráfico:** comportamiento fotoquímico real

### Estaciones simuladas incluidas

| ID | Nombre | Zona | Perfil |
|---|---|---|---|
| sv-centro-historico | Centro Histórico | Centro | Tráfico alto, PM2.5 elevado |
| sv-zona-industrial | Zona Industrial Norte | Norte | PM10 y SO2 más altos |
| sv-soyapango | Soyapango | Este | Mixto industrial/residencial |
| sv-santa-tecla | Santa Tecla | Oeste | Residencial, valores más bajos |
| sv-san-marcos | San Marcos | Sur | Comercial, valores moderados |
| sv-ilopango | Ilopango | Este | Aeropuerto, NO2 y CO algo elevados |

### Modos de operación

El comportamiento se controla con la variable `SIMULATE_DATA`:

| Valor | Comportamiento |
|---|---|
| `false` (default) | Intenta OpenAQ primero. Si obtiene 0 estaciones, activa el simulado automáticamente |
| `true` | Modo simulado permanente. No consume quota de OpenAQ |

### Configurar en Render

En el dashboard de Render → **"Environment"**:

```
SIMULATE_DATA=true    # para activar el simulador permanentemente
SIMULATE_DATA=false   # para intentar OpenAQ primero (recomendado)
```

No se necesita redeploy — Render aplica el cambio de variable al reiniciar el servicio.

### Cómo saber qué modo está activo

En los logs de Render busca:
```
[SIM] Station sv-centro-historico → AQI: 52 (Moderada)   ← datos simulados
[REAL] Station 123456 → AQI: 48 (Buena)                  ← datos reales de OpenAQ
```

O visita `/health`:
```json
{ "status": "ok", "db": "connected", "frontend": "found" }
```

Y luego `/api/v1/measurements/latest` — si ves IDs como `sv-centro-historico`, son datos simulados.

### Cuando OpenAQ tenga datos de El Salvador

1. En Render cambia `SIMULATE_DATA=false`
2. Reinicia el servicio
3. El scheduler descubrirá las estaciones reales automáticamente
4. Los datos simulados antiguos permanecen en MongoDB (TTL los elimina en 90 días)

---

## PARTE 6: Deploy en Render

### 6.1 Preparar el repositorio en GitHub

```
airguard/
└── backend/      ← Sube SOLO esta carpeta (o el repo entero con rootDir: backend)
    ├── public/   ← Frontend incluido aquí (NO usar carpeta frontend/ separada)
    ├── src/
    └── ...
```

> ⚠️ Nunca subas `.env` a GitHub. El `.gitignore` ya lo excluye, pero verifica.

### 6.2 Crear el servicio en Render

1. [render.com](https://render.com) → **"New"** → **"Web Service"**.
2. Conecta tu cuenta de GitHub y selecciona el repositorio.
3. Render detecta `render.yaml` automáticamente y configura:
   - **Build Command:** `npm install`
   - **Start Command:** `node src/index.js`
   - **Root Directory:** `backend`

### 6.3 Variables de entorno en Render

En el dashboard de Render → **"Environment"**, ingresa manualmente las variables marcadas como `sync: false`:

| Variable | Descripción | Ejemplo |
|---|---|---|
| `MONGODB_URI` | Cadena de conexión completa a Atlas | `mongodb+srv://...` |
| `OPENAQ_API_KEY` | API key de OpenAQ v3 | `abc123xyz...` |
| `ADMIN_PASSWORD` | Contraseña del panel /panel-air | `MiContraseñaSegura2026` |
| `ADMIN_JWT_SECRET` | Secreto JWT (generado en Parte 5) | `a3f8c2d1e4b7...` |
| `APP_URL` | URL pública asignada por Render | `https://airguard.onrender.com` |
| `SMTP_USER` | Email remitente | `tucuenta@gmail.com` |
| `SMTP_PASS` | Contraseña de aplicación Gmail | `abcd efgh ijkl mnop` |
| `VAPID_PUBLIC_KEY` | Clave pública VAPID (Parte 4) | `BGy7m3fHrk...` |
| `VAPID_PRIVATE_KEY` | Clave privada VAPID (Parte 4) | `mFkL7cXs9...` |

Las siguientes ya tienen valor en `render.yaml` pero puedes ajustarlas:

| Variable | Valor por defecto | Para qué sirve |
|---|---|---|
| `PORT` | `3001` | Puerto del servidor |
| `FRONTEND_DIR` | `/opt/render/project/src/public` | Ruta del frontend dentro de Render |
| `NODE_ENV` | `production` | Modo de ejecución |
| `OPENAQ_FETCH_INTERVAL_MS` | `90000` | Intervalo del scheduler (ms) |
| `OPENAQ_DAILY_LIMIT` | `1000` | Límite diario de peticiones |
| `ALERT_AQI_THRESHOLD` | `100` | AQI mínimo para disparar alertas |

### 6.4 Verificar el deploy

Cuando Render termine el build, visita:

```
https://tu-app.onrender.com/health
```

Deberías ver:

```json
{
  "status": "ok",
  "service": "AirGuard API",
  "version": "0.9.1",
  "db": "connected",
  "frontend": "found"
}
```

Si `db` dice `disconnected` → revisar `MONGODB_URI`.
Si `frontend` dice `missing` → verificar que la carpeta `backend/public/` exista en el repo.

---

## PARTE 7: Probar la aplicación

### 7.1 Verificar datos en tiempo real

```bash
curl https://tu-app.onrender.com/api/v1/measurements/latest | python3 -m json.tool
```

Debe retornar mediciones reales de estaciones en San Salvador con AQI calculado.

### 7.2 Probar suscripción por email

```bash
curl -X POST https://tu-app.onrender.com/api/v1/subscribe \
  -H "Content-Type: application/json" \
  -d '{"email": "tu@email.com", "alert_threshold": 50}'
```

### 7.3 Probar notificaciones (método rápido)

1. En Render → **"Environment"** → cambia `ALERT_AQI_THRESHOLD` a `1`.
2. Espera máximo 90 segundos (próximo ciclo del scheduler).
3. Recibirás un email de alerta en los suscriptores registrados.
4. Devuelve el valor a `100`.

### 7.4 Panel de administración

Visita `https://tu-app.onrender.com/panel-air` e inicia sesión con tu `ADMIN_PASSWORD`. Desde ahí puedes gestionar estaciones, ver métricas y activar pruebas.

---

## PARTE 8: Notas sobre el plan gratuito de Render

| Limitación | Detalle |
|---|---|
| Inactividad | El servicio se "duerme" tras 15 minutos sin peticiones |
| Arranque en frío | La primera petición tras el sleep puede tardar 30–60 segundos |
| Horas de uso | 750 horas/mes gratis (suficiente para 1 servicio 24/7) |
| Solución recomendada | Usar [UptimeRobot](https://uptimerobot.com) (gratuito) para hacer ping cada 10 minutos y mantener el servicio activo |

### Configurar UptimeRobot (opcional pero recomendado)

1. Crea cuenta en [uptimerobot.com](https://uptimerobot.com).
2. Clic en **"New Monitor"** → tipo: **HTTP(s)**.
3. URL: `https://tu-app.onrender.com/health`.
4. Intervalo: **10 minutes**.
5. Guarda. UptimeRobot hará ping cada 10 minutos y el servicio no se dormirá.

---

## PARTE 9: Troubleshooting

### El servidor no arranca

| Error | Causa | Solución |
|---|---|---|
| `Authentication failed` | `MONGODB_URI` con credenciales incorrectas | Verificar usuario/contraseña en Atlas → Database Access |
| `ECONNREFUSED` o timeout | IP de Render bloqueada en Atlas | Atlas → Network Access → agregar `0.0.0.0/0` |
| `ENOENT: index.html` | Carpeta `public/` no existe en el repo | Verificar que `backend/public/index.html` esté en GitHub |
| `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` | Express sin `trust proxy` con Render | Verificado: `app.set('trust proxy', 1)` ya está en `index.js` desde v0.8.3 |
| `Cannot find module '...'` | Dependencias no instaladas | Build Command debe ser `npm install` |

### Las notificaciones push no llegan

1. Verificar que `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` estén configuradas en Render.
2. Verificar que el usuario se suscribió (el endpoint `/api/v1/subscribe/push` retornó 200).
3. Verificar que el navegador otorgó permiso de notificaciones.
4. Probar bajando el umbral `ALERT_AQI_THRESHOLD` a `1` temporalmente.

### Los emails de alerta no llegan

1. Verificar `SMTP_USER` y `SMTP_PASS` (debe ser la contraseña de aplicación, no la de Gmail).
2. Verificar que la verificación en 2 pasos de Google esté activa (requisito para contraseñas de aplicación).
3. Revisar la carpeta de spam.
4. Verificar que el email del suscriptor esté en la colección `subscribers` con `is_active: true`.

### El AQI aparece como 0

- Resuelto desde v0.4.0: la ingesta extrae correctamente los valores numéricos de contaminantes desde OpenAQ v3.
- Si persiste, verificar en los logs de Render que el scheduler imprima valores no nulos.

### El scheduler no guarda mediciones / el proceso se reinicia solo (Render)

- **Causa raíz identificada en v0.9.1:** el modelo `Measurement.js` exigía que cada
  contaminante fuera un sub-documento `{value, unit}`, pero el scheduler siempre generó
  números planos (`pm25: 18.4`). Cada `insertMany()` lanzaba un `CastError` sin captura,
  lo que provocaba un `unhandledRejection` y **crasheaba todo el proceso de Node**. Render
  reiniciaba el servicio en bucle sin que ninguna medición llegara a persistirse — daba la
  falsa impresión de que el servicio "se dormía" constantemente.
- **Solución aplicada:** `pollutants` ahora se define como campos `Number` planos en el
  schema. Además, `runFetch()`, `runDiscover()` y `checkAndTriggerAlerts()` en
  `scheduler.js` están envueltos en try/catch, y `index.js` registra manejadores globales
  `process.on('unhandledRejection'/'uncaughtException')` como red de seguridad adicional.
- **Cómo verificar que no vuelva a pasar:** en los logs de Render, un ciclo fallido ahora
  imprime `[Scheduler] ❌ Error en runFetch (ciclo omitido, proceso sigue vivo)` en vez de
  reiniciar el proceso completo.
- Relacionado: se unificó el campo de estado de estaciones a `is_active` (antes `Station.js`
  usaba `active` mientras el resto del código usaba `is_active`, causando que `/stations`
  devolviera siempre un arreglo vacío).

### ENOTFOUND al conectar con OpenAQ

- Verificar que el dominio en `openaq.js` sea `api.openaq.org` (no `api.openaq.io`).
- En desarrollo local: verificar la conexión a internet y que el DNS resuelva `api.openaq.org`.

---

## PARTE 10: Mantenimiento y actualizaciones

### Actualizar el código

```bash
# 1. Editar archivos localmente
# 2. Subir a GitHub
git add .
git commit -m "feat: descripción del cambio"
git push origin main
# Render detecta el push y hace redeploy automáticamente
```

### Ver logs en tiempo real (Render)

En el dashboard de Render → tu servicio → pestaña **"Logs"**. Busca:
- `[AirGuard] Frontend: /opt/render/project/src/public` → frontend encontrado ✅
- `MongoDB conectado` → base de datos conectada ✅
- `Scheduler iniciado` → ingesta de datos activa ✅

### Respaldar datos de MongoDB

Desde MongoDB Atlas → tu cluster → **"..."** → **"Command Line Tools"** → usa `mongodump` con tu URI.

---

*AirGuard v0.9.1 · Guía v2.2.0 · 2026-07-01 · San Salvador, El Salvador*
