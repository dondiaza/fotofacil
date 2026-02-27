# Manual Básico por Roles

## Acceso común
1. Abrir `/login`.
2. Iniciar sesión con usuario/email y contraseña.
3. El sistema redirige según rol:
   - `STORE` -> `/store`
   - `CLUSTER` y `SUPERADMIN` -> `/admin`

## Rol Tienda

### Qué puede hacer
- Ver su estado diario y checklist en `Mi tienda` (`/store`).
- Subir fotos/vídeos en lote desde `Subir fotos` (`/store/upload`).
- Revisar historial y abrir galería/comentarios de sus envíos (`/store/history`).
- Chatear con su cluster (superadmin también puede participar) en `Mensajes` (`/store/messages`).

### Flujo típico
1. Entrar en `Subir fotos`.
2. Elegir fecha (ventana: 7 días atrás / 7 días adelante).
3. Usar `Captura guiada` para subir fotos por grupo requerido.
4. Añadir vídeos (cámara o archivo) si el día lo exige.
5. Revisar la cola y pulsar `Enviar todo`.
6. Ir a `Historial` para revisar versiones, comentarios y correcciones.

### Incidencias comunes y solución
- `Hoy sigue incompleto`: falta al menos un grupo de fotos requerido y/o un vídeo.
- Error de red al subir un elemento: volver a `Enviar todo` (reintenta los pendientes/error).
- No permite enviar mensaje: la tienda no tiene cluster vinculado; debe revisarlo superadmin.

## Rol Cluster

### Qué puede hacer
- Ver dashboard de sus tiendas asignadas (`/admin`).
- Gestionar tiendas asignadas y reglas de días requeridos:
  - Global de su cluster.
  - Individual por tienda (`/admin/stores`).
- Revisar biblioteca por tienda/fecha (`/admin/media`):
  - Galería móvil/desktop.
  - Validar/quitar validación.
  - Comentar con dibujo.
  - Solicitar V2 y revisar versiones.
  - Eliminar archivos.
- Usar bandeja de mensajería por tienda (`/admin/messages`).
- Enviar recordatorios a tiendas desde dashboard.

### Límites del rol
- No tiene acceso a:
  - `Gestor de cuentas` (`/admin/accounts`).
  - `Ajustes` globales (`/admin/settings`).
- No puede ver ni operar tiendas de otros clusters.

### Incidencias comunes y solución
- Tienda no visible en dashboard/media: verificar que esté vinculada al cluster en cuentas (superadmin).
- Acción denegada sobre una tienda: la tienda no pertenece a su cluster.

## Rol Superadmin

### Qué puede hacer
- Todo lo de Cluster, pero a nivel global (todas las tiendas).
- Gestionar cuentas (`/admin/accounts`):
  - Crear/editar/eliminar clusters y tiendas.
  - Resetear contraseñas.
  - Vincular tiendas a cluster (única vinculación por tienda).
  - Importar CSV (clusters/tiendas) y descargar plantillas.
- Configuración global (`/admin/settings`):
  - Carpeta raíz de Google Drive.
  - SMTP (host, puerto, usuario, clave, remitente).
  - Cambio de contraseña de superadmin.

### Flujo típico operativo diario
1. Revisar `Dashboard` para pendientes/parciales/completadas y KPIs.
2. Enviar recordatorios manuales a tiendas pendientes.
3. Revisar `Biblioteca` y validar/corregir contenido.
4. Atender `Mensajes`.
5. Ajustar reglas globales o cuentas cuando cambie la operativa.

### Incidencias comunes y solución
- Error al vincular Drive: confirmar ID de carpeta raíz y permisos reales de la cuenta backend sobre esa carpeta.
- No salen correos: revisar SMTP habilitado, host/puerto/secure y credenciales.
- Usuario no puede entrar: revisar estado activo, contraseña y vinculación correcta (tienda/cluster).

