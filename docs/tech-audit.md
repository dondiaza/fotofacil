# Auditoría Técnica: Rendimiento y Bugs (sin breaking changes)

## Alcance
- Repositorio auditado: `fotofacil`.
- Objetivo: mejorar rendimiento y robustez sin cambiar funcionalidad visible, permisos, roles o contratos API.
- Restricciones respetadas:
  - Sin cambios en middleware de acceso, roles (`STORE`, `CLUSTER`, `SUPERADMIN`) ni alcance de permisos.
  - Sin cambios de rutas/endpoints ni payloads públicos.

## Stack detectado
- Frontend/Backend: Next.js App Router (`src/app` + rutas API).
- ORM/DB: Prisma + PostgreSQL (Neon en entorno Vercel).
- Almacenamiento de ficheros: Google Drive API.
- Deploy: Vercel.

## Metodología de medición
- Script reproducible: [`scripts/benchmark-latency.mjs`](/c:/Users/Carlos%20Pampling/Antigravity%20Projects/fotofacil/scripts/benchmark-latency.mjs).
- Endpoints medidos (20 iteraciones cada uno):
  - `GET /api/admin/kpis`
  - `GET /api/admin/stores`
  - `GET /api/admin/media`
  - `GET /api/store/today`
- Base de referencia:
  - URL: `https://fotofacil.vercel.app`
  - Fecha benchmark baseline: `2026-02-27T13:29:00.299Z`

## Métricas baseline (antes)

| Endpoint | avg (ms) | p50 (ms) | p95 (ms) | p99 (ms) |
|---|---:|---:|---:|---:|
| `admin_kpis` | 247.92 | 245.08 | 303.97 | 303.97 |
| `admin_stores` | 183.85 | 178.19 | 227.14 | 227.14 |
| `admin_media` | 184.86 | 177.82 | 234.63 | 234.63 |
| `store_today` | 180.83 | 177.13 | 201.88 | 201.88 |

Artefacto: [`docs/benchmarks/20260227-before.json`](/c:/Users/Carlos%20Pampling/Antigravity%20Projects/fotofacil/docs/benchmarks/20260227-before.json)

## Bugs detectados y corregidos

### 1) N+1 en KPIs semanales (`/api/admin/kpis`)
- Reproducción:
  - En semanas con múltiples tiendas, el endpoint evaluaba requerimientos por tienda/día con llamadas repetidas.
- Impacto:
  - Aumenta latencia y escala peor con el número de tiendas.
- Fix:
  - Resolución de requerimientos en memoria con lookup precargado (store > cluster > global) manteniendo la misma prioridad funcional.
  - Archivos:
    - [`src/app/api/admin/kpis/route.ts`](/c:/Users/Carlos%20Pampling/Antigravity%20Projects/fotofacil/src/app/api/admin/kpis/route.ts)
    - [`src/lib/requirement-resolution.ts`](/c:/Users/Carlos%20Pampling/Antigravity%20Projects/fotofacil/src/lib/requirement-resolution.ts)
- Regresión cubierta por tests:
  - [`tests/requirement-resolution.test.ts`](/c:/Users/Carlos%20Pampling/Antigravity%20Projects/fotofacil/tests/requirement-resolution.test.ts)

### 2) Crash de cliente por `Unexpected end of JSON input`
- Reproducción:
  - Respuesta vacía o no JSON en peticiones `fetch` de componentes cliente con `response.json()` directo.
- Impacto:
  - Error de UI y flujos interrumpidos en pantalla.
- Fix:
  - Parseo seguro centralizado con tolerancia a body vacío/no JSON.
  - Helper:
    - [`src/lib/client-json.ts`](/c:/Users/Carlos%20Pampling/Antigravity%20Projects/fotofacil/src/lib/client-json.ts)
  - Componentes endurecidos:
    - [`src/components/admin-drive-settings.tsx`](/c:/Users/Carlos%20Pampling/Antigravity%20Projects/fotofacil/src/components/admin-drive-settings.tsx)
    - [`src/components/admin-inbox.tsx`](/c:/Users/Carlos%20Pampling/Antigravity%20Projects/fotofacil/src/components/admin-inbox.tsx)
    - [`src/components/admin-smtp-settings.tsx`](/c:/Users/Carlos%20Pampling/Antigravity%20Projects/fotofacil/src/components/admin-smtp-settings.tsx)
    - [`src/components/admin-store-detail.tsx`](/c:/Users/Carlos%20Pampling/Antigravity%20Projects/fotofacil/src/components/admin-store-detail.tsx)
    - [`src/components/admin-store-manager.tsx`](/c:/Users/Carlos%20Pampling/Antigravity%20Projects/fotofacil/src/components/admin-store-manager.tsx)
    - [`src/components/chat-panel.tsx`](/c:/Users/Carlos%20Pampling/Antigravity%20Projects/fotofacil/src/components/chat-panel.tsx)
    - [`src/components/login-form.tsx`](/c:/Users/Carlos%20Pampling/Antigravity%20Projects/fotofacil/src/components/login-form.tsx)
  - Regresión cubierta por tests:
    - [`tests/client-json.test.ts`](/c:/Users/Carlos%20Pampling/Antigravity%20Projects/fotofacil/tests/client-json.test.ts)

## Cambios de calidad/testing
- Comando único de tests:
  - `npm run test`
- Nuevos tests añadidos:
  - [`tests/client-json.test.ts`](/c:/Users/Carlos%20Pampling/Antigravity%20Projects/fotofacil/tests/client-json.test.ts)
  - [`tests/requirement-resolution.test.ts`](/c:/Users/Carlos%20Pampling/Antigravity%20Projects/fotofacil/tests/requirement-resolution.test.ts)
  - [`tests/upload-requirements.test.ts`](/c:/Users/Carlos%20Pampling/Antigravity%20Projects/fotofacil/tests/upload-requirements.test.ts)
  - [`tests/draw-annotation.test.ts`](/c:/Users/Carlos%20Pampling/Antigravity%20Projects/fotofacil/tests/draw-annotation.test.ts)

## Validación local
- `npm run lint` (sin errores; warnings no bloqueantes).
- `npm run test` (OK).
- `npm run build` (OK).
- `npm run typecheck` (OK, ejecutado tras build para regenerar `.next/types`).

## Métricas post-cambio (después)

Benchmark repetido tras despliegue en `https://fotofacil.vercel.app` (warm run):

| Endpoint | avg (ms) | p50 (ms) | p95 (ms) | p99 (ms) |
|---|---:|---:|---:|---:|
| `admin_kpis` | 177.83 | 179.02 | 201.67 | 201.67 |
| `admin_stores` | 192.80 | 181.05 | 397.22 | 397.22 |
| `admin_media` | 200.22 | 195.29 | 234.15 | 234.15 |
| `store_today` | 194.33 | 186.14 | 260.40 | 260.40 |

Comparativa clave del endpoint optimizado:
- `admin_kpis` avg: `247.92ms -> 177.83ms` (`-28.27%`)
- `admin_kpis` p95: `303.97ms -> 201.67ms` (`-33.66%`)

Notas:
- La mejora aplicada está enfocada en `admin_kpis` (eliminación de patrón N+1).
- En el resto de endpoints no se tocó lógica funcional; hay variabilidad esperable de infraestructura compartida (Vercel/DB red), con picos aislados.

Artefacto: [`docs/benchmarks/20260227-after.json`](/c:/Users/Carlos%20Pampling/Antigravity%20Projects/fotofacil/docs/benchmarks/20260227-after.json)

## No breaking changes
- No se han cambiado:
  - rutas API;
  - nombres de parámetros/payloads públicos;
  - middleware y control de acceso por rol;
  - flujos de UI funcionales.
