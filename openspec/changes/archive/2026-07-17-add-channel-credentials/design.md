## Context

Las credenciales de canal se leen hoy con `loadEnv()` en varios puntos: los guards
`MetaSignatureGuard` (app secret) y `TelegramSecretGuard` (webhook secret), el handshake
`GET /webhooks/meta` (verify token), los senders de `channel-senders.ts` (tokens/ids de
WhatsApp, Telegram y páginas de Meta) y los downloaders de `media-downloaders.ts`
(tokens de descarga). Todos son síncronos y globales: una sola cuenta por canal, secretos
en texto plano en el entorno.

Existe un patrón maduro a reutilizar: `CatalogValueService` (caché TTL 60 s + invalidación
al mutar) y el CRUD genérico de catálogos (`catalog-entries.controller.ts`, rutas
explícitas por recurso, DELETE referenciado → 409). Los guards son `@Injectable()` y ya
se instancian por DI (`@UseGuards(...)`), así que pueden inyectar un servicio y volverse
`async` (`canActivate` admite `Promise<boolean>`).

Este change saca los secretos a una tabla cifrada conservando **una cuenta activa por
canal**; el ruteo multi-cuenta es el change siguiente (`add-multi-account-routing`).

## Goals / Non-Goals

**Goals:**
- Secretos de canal cifrados en reposo en la DB, administrables por API sin redeploy.
- Reemplazar toda lectura de `loadEnv()` de secretos de canal por resolución desde el
  almacén, sin cambiar el comportamiento observable (misma cuenta única por canal).
- Migración transparente desde las env actuales para despliegues existentes.
- Fallo seguro: sin llave o sin credencial, el canal se comporta como "no configurado".

**Non-Goals:**
- Múltiples cuentas por canal y ruteo del entrante a la cuenta destino (10c-2).
- UI de administración de credenciales (change posterior).
- Rotación/reencriptado de la llave maestra (manual, documentado; sin tooling).
- Credenciales de la Marketing API (`META_ADS_*`) y del bot gateway — no son canales.

## Decisions

### 1. Cifrado: AES-256-GCM con `node:crypto`, blob por fila
Cada fila guarda TODOS sus secretos como un único objeto JSON cifrado con AES-256-GCM:
`iv (12B) || authTag (16B) || ciphertext`, serializado base64 en una columna `text`. Una
sola operación de cifrado/descifrado por fila (los secretos de una credencial se usan
juntos), IV aleatorio por escritura, tag autenticado (detecta llave incorrecta o
manipulación). Sin dependencias nuevas.
- *Alternativa descartada*: cifrado por campo → más IVs y complejidad sin beneficio; los
  secretos de una credencial nunca se usan por separado.
- *Alternativa descartada*: `pgcrypto` en la DB → mueve la llave al servidor de DB y acopla
  a Postgres; preferimos cifrar en la app (la DB nunca ve texto plano ni la llave).

### 2. Llave maestra: `CHANNEL_CREDENTIALS_KEY` (32 bytes base64) en env
La llave vive en env (única credencial de canal que queda ahí). El esquema zod la valida
como base64 de exactamente 32 bytes. Sin llave, el servicio de resolución devuelve `null`
para todo y el arranque no falla: los canales quedan deshabilitados con log.
- *Trade-off*: la llave sigue en texto plano en env. Sube el listón (un dump de DB solo no
  basta) pero no es KMS; integración con secret manager queda fuera de alcance.

### 3. Tabla `channel_credentials` con "una activa por kind"
```
channel_credentials(
  id uuid pk,
  kind text,            -- meta_app | whatsapp | meta_page | telegram
  label text,
  active boolean default true,
  secrets_encrypted text,  -- base64(iv||tag||ciphertext) del JSON de secretos
  created_at, updated_at
)
```
Índice único parcial `(kind) WHERE active` → como máximo una credencial activa por `kind`,
que impone la restricción de este change a nivel de DB. `meta_app` es nivel-app
(compartido por WhatsApp/Messenger/Instagram); `whatsapp`/`meta_page`/`telegram` son
nivel-cuenta. El ruteo multi-cuenta (10c-2) relajará el índice y añadirá el identificador
de cuenta.

### 4. `ChannelCredentialsService`: resolución cacheada + getters tipados
`resolve(kind)` devuelve los secretos descifrados de la fila activa (o `null`), con caché
TTL 60 s (mismo patrón que catálogos/settings) invalidada por cada mutación del CRUD.
Getters tipados por consumidor: `metaApp()`, `whatsapp()`, `metaPage()`, `telegram()`,
cada uno con la forma de secretos que espera ese canal. Un descifrado fallido (llave
incorrecta) se trata como "no configurado" + log de error, nunca crash.

### 5. Guards y handshake pasan a async, resolviendo del almacén
`MetaSignatureGuard`/`TelegramSecretGuard` inyectan el servicio y `canActivate` devuelve
`Promise<boolean>`: resuelven `meta_app.app_secret` / `telegram.webhook_secret` del
almacén; sin credencial → `false` → 403 (idéntico a hoy). El handshake `GET /webhooks/meta`
compara contra `meta_app.verify_token` resuelto. Senders y downloaders `await` el getter
correspondiente antes de construir la request.

### 6. CRUD que nunca devuelve secretos
`GET /api/channel-credentials` y el detalle devuelven solo metadatos (`kind`, `label`,
`active`, timestamps) más `configured: true`; **jamás** el valor ni una máscara derivada
del secreto (evita fugas por longitud/prefijo). `POST`/`PATCH` aceptan los secretos, los
validan por `kind` (zod discriminado) y los cifran; `PATCH` sin secretos solo toca
`label`/`active`. `DELETE` de una credencial referenciada por conversaciones → 409
`RESOURCE_REFERENCED` (en este change no hay referencia aún; la regla queda lista para
10c-2). Toda mutación emite `domain_event` `actor='user'` sin el secreto en el payload.

### 7. Migración desde env: seed idempotente leyendo `process.env` directo
Al arrancar, si hay `CHANNEL_CREDENTIALS_KEY` y no existe fila de un `kind`, el seed
construye esa credencial desde los nombres de env legacy leídos **directamente de
`process.env`** (no del esquema zod, que ya no los declara). Idempotente: no pisa filas
existentes. Esto permite retirar las env del esquema zod (BREAKING de config) y aun así
migrar despliegues cuyo `.env` todavía las tenga; tras el primer arranque el operador
puede borrar esas líneas.
- *Por qué leer `process.env` directo*: mantener las env en el esquema zod solo para el
  seed contradiría "reemplazar env"; leerlas como entrada de migración las trata como lo
  que son (legacy transitorio), no como config válida del sistema.

## Risks / Trade-offs

- [Pérdida de la llave maestra → credenciales irrecuperables] → Documentar el respaldo de
  `CHANNEL_CREDENTIALS_KEY` como crítico; los secretos siempre se pueden re-capturar por
  el CRUD (no hay pérdida de datos de negocio, solo de credenciales).
- [Llave en env sigue en texto plano] → Aceptado y documentado; sube el listón frente a un
  dump de DB. KMS/secret manager fuera de alcance.
- [Guard consulta la DB por webhook] → Caché TTL 60 s; volumen de webhooks moderado. La
  invalidación al mutar mantiene la coherencia dentro del proceso.
- [Secretos descifrados en memoria (caché)] → Mismo modelo de exposición que env hoy;
  aceptable. TTL corto limita la ventana.
- [Rotar la llave exige re-encriptar todas las filas] → Sin tooling en este change;
  documentado como procedimiento manual (leer con llave vieja vía CRUD no expone secretos,
  así que la rotación real llega con su propio change si se necesita).

## Migration Plan

1. Generar la llave: `openssl rand -base64 32` → `CHANNEL_CREDENTIALS_KEY`.
2. Desplegar con la llave puesta y las env de canal legacy aún presentes en `.env`.
3. Primer arranque: el seed crea las filas equivalentes; verificar con
   `GET /api/channel-credentials` (deben aparecer los `kind` esperados, `configured:true`).
4. Borrar las líneas de env de secretos por canal del `.env` y redeploy.
5. Rollback: revertir el deploy; las env legacy siguen soportadas por el commit anterior.
   La tabla nueva es inerte para la versión vieja (no la consulta).

## Open Questions

- Ninguna bloqueante. (El formato de "cuenta destino" y el índice multi-cuenta se definen
  en `add-multi-account-routing`.)
