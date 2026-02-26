# FotoFacil MVP

MVP fullstack mobile-first (PWA) para tiendas que suben fotos diarias con organización automática en Google Drive, mensajería con superadmin y alertas por no subida.

## Stack elegido

- Frontend + backend: `Next.js (App Router) + TypeScript + Tailwind`
- BD: `SQLite local (MVP rápido) + Prisma`
- Auth: sesión JWT en cookie `httpOnly` + middleware por rol
- Drive: `Google Drive API` con Service Account (backend-only)
- Jobs: endpoint cron protegido (`/api/cron/daily-check-missing-uploads`)
- PWA: `manifest.webmanifest + service worker`

## Funcionalidades MVP implementadas

- Roles:
  - `STORE`: dashboard propio, wizard de subida, historial, chat.
  - `SUPERADMIN`: dashboard global, filtros por estado, gestión de tiendas, detalle por tienda, bandeja de mensajes.
- Wizard móvil:
  - Fecha (hoy por defecto, editable últimos 7 días)
  - Slots configurables
  - Captura de cámara (`accept=image/*`, `capture=environment`)
  - Revisión + envío con reintento por foto
- Google Drive:
  - Carpeta tienda: `TIENDA_<storeCode>`
  - Subcarpeta fecha: `YYYY-MM-DD`
  - Nomenclatura: `{storeCode}_{YYYY-MM-DD}_{slotName}_{seq}.{ext}`
  - Normalización de imagen a JPG (calidad 82, ancho max 1600)
- Alertas automáticas:
  - Si no está `COMPLETE` al pasar hora límite -> crea alerta + mensaje automático + email opcional admin
- Chat bidireccional:
  - Tienda <-> Admin
  - Adjuntar 1 imagen opcional
  - No leídos y paginación por cursor
- Auditoría:
  - login, subidas, alertas, mensajes, acciones admin

## Estructura

```txt
src/
  app/
    login
    store/...
    admin/...
    api/
      auth/*
      store/*
      admin/*
      messages/[storeId]
      cron/daily-check-missing-uploads
  components/
  lib/
prisma/
  schema.prisma
  migrations/*
  seed.ts
public/
  manifest.webmanifest
  sw.js
```

## Variables de entorno

Copia `.env.example` a `.env`:

```env
DATABASE_URL="file:./dev.db"
APP_URL="http://localhost:3000"
SESSION_SECRET="..."
CRON_SECRET="..."
DEFAULT_ADMIN_EMAIL="admin@fotofacil.local"
DEFAULT_ADMIN_PASSWORD="ChangeMe123!"

GOOGLE_SERVICE_ACCOUNT_EMAIL=""
GOOGLE_PRIVATE_KEY=""
GOOGLE_DRIVE_ROOT_FOLDER_ID=""
GOOGLE_IMPERSONATE_USER=""

RESEND_API_KEY=""
ADMIN_NOTIFICATION_EMAIL=""
```

## Setup local

Requisitos:

- Windows (para usar `run-local.cmd`) o Node.js 20+ manualmente

Arranque rapido en Windows:

- Ejecuta `run-local.cmd` desde la raiz del proyecto.
- El script fuerza `DATABASE_URL` a ruta absoluta corta para evitar errores de Prisma en rutas con espacios.

1. Instalar dependencias:
   - `npm install`
2. Generar cliente Prisma y migrar:
   - `npm run db:generate`
   - `npm run db:migrate`
3. Seed:
   - `npm run db:seed`
4. Levantar app:
   - `npm run dev`

Si quieres abrir desde móvil en la misma red:

- `npm run dev:mobile`
- URL en móvil: `http://<IP_LOCAL_PC>:3000/login`

## Credenciales seed

- Superadmin:
  - `username`: `superadmin`
  - `email`: `DEFAULT_ADMIN_EMAIL`
  - `password`: `DEFAULT_ADMIN_PASSWORD`
- Tienda demo:
  - `username`: `tienda043`
  - `password`: `DEFAULT_ADMIN_PASSWORD`

## Configuración Google Drive

1. Crear Service Account en Google Cloud y habilitar Drive API.
2. Compartir la carpeta raíz de Drive (`GOOGLE_DRIVE_ROOT_FOLDER_ID`) con el email de la Service Account con permisos de editor.
3. Setear:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `GOOGLE_PRIVATE_KEY` (con `\n` escapados si va en una línea)
   - `GOOGLE_DRIVE_ROOT_FOLDER_ID`
4. Opcional: `GOOGLE_IMPERSONATE_USER` si usas domain-wide delegation.

## Cron de alertas

Endpoint:

- `POST /api/cron/daily-check-missing-uploads`
- Header requerido: `x-cron-secret: <CRON_SECRET>`

Ejemplo Vercel Cron (cada 5 minutos):

```json
{
  "crons": [
    {
      "path": "/api/cron/daily-check-missing-uploads",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

Ya se incluye un `vercel.json` base con este cron.

Debes inyectar `CRON_SECRET` en el request (proxy o scheduler que soporte headers). Si usas otro scheduler (Cloud Scheduler, GitHub Actions), envía `POST` con header.

## Contrato API implementado

- Auth:
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`
  - `GET /api/me`
- Store:
  - `GET /api/store/today?date=YYYY-MM-DD`
  - `POST /api/store/upload` (multipart: `date`, `slotName`, `file`)
  - `GET /api/store/history?from=&to=`
- Admin:
  - `GET /api/admin/stores`
  - `POST /api/admin/stores`
  - `GET /api/admin/stores/:id`
  - `PATCH /api/admin/stores/:id`
  - `GET /api/admin/slot-templates`
  - `PUT /api/admin/slot-templates`
  - `GET /api/admin/uploads?date=YYYY-MM-DD`
  - `GET /api/admin/alerts?date=YYYY-MM-DD`
  - `POST /api/admin/remind/:storeId`
- Mensajes:
  - `GET /api/messages/:storeId?cursor=...`
  - `POST /api/messages/:storeId` (multipart: `text`, `attachment?`)

## Seguridad

- Cookies `httpOnly`, `sameSite=lax`, `secure` en producción.
- Middleware de rutas:
  - `/store/*` solo `STORE`
  - `/admin/*` solo `SUPERADMIN`
- Validación server-side de acceso a tienda.
- Las operaciones de Drive se hacen exclusivamente desde backend.

## Notas de despliegue

- Recomendado: Vercel + Neon/Supabase.
- Si cambias a PostgreSQL en producción, adapta `datasource` y pipeline de migraciones.
- `sharp` requiere entorno compatible Node (Vercel lo soporta).
- Para email opcional, configurar dominio remitente en Resend.

## Estado de validación en este entorno

Validado en este entorno con Node portable:

- `run-local.cmd --setup-only` ejecutado correctamente.
- `http://127.0.0.1:3000/api/health` responde `ok: true`.
- `http://127.0.0.1:3000/login` responde `200 OK`.
- Login admin y tienda verificados por API.
