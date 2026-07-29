## Why

Existen ~386 conversaciones históricas de WhatsApp (exportadas de los dispositivos de las
reclutadoras: 190 Damaris, 115 Gladys, 81 Hernán) que hoy no están en el sistema. Son leads
reales con su fecha de primer contacto, origen (Facebook/orgánico), tipo de vacante detectado
y teléfono del candidato. Sin ellas, el sistema no puede mostrar métricas ni cruzar candidato
↔ operador ↔ campaña con datos reales. El parser de WhatsApp (`parseWhatsAppChat`) ya entiende
exactamente este formato, pero corre en el navegador y no persiste al backend: los datos se
quedan como análisis efímero. Este change los ingiere de verdad para poblar el sistema en modo
demo con información real y medible.

## What Changes

- **Importador de historial de WhatsApp en «Cargar datos»**: la SPA acepta un `.zip` exportado
  (estructura anidada: zip por reclutadora → zip por conversación → `.txt`), lo descomprime en
  el navegador con `jszip` (ya es dependencia), y por cada conversación reutiliza
  `parseWhatsAppChat` para producir mensajes normalizados. La reclutadora dueña se toma del
  nombre de la carpeta (`Chats Hernan` → agente Hernán); Dulce/Damaris se normalizan a una sola.
- **Endpoint de ingestión histórica en el backend**: `POST /api/import/whatsapp-history` recibe
  `NormalizedInboundMessage[]` (etiquetados como históricos) y los ingiere reutilizando el
  `MessageIngestionService` existente — que ya crea persona/identidad/conversación/lead de forma
  **idempotente** por `(channel, external_message_id)`. Reimportar el mismo chat no duplica.
- **Sin efectos en vivo**: la ingestión histórica no notifica al bot ni intenta responder; las
  conversaciones entran en modo humano y con las fechas reales del chat, para que el motor de
  horas hábiles calcule métricas históricas correctas.
- **Atribución honesta**: se detecta origen `Facebook` vs `orgánico` (heurística existente),
  pero sin `ad_id` no se atribuye a una campaña específica — queda como origen, no como campaña
  inventada (coherente con «no atribuir sin evidencia»).

Fuera de alcance: importador de operadores (ya existe; se extiende en otro change), pautas de
Meta, y la Base HC 2026 / bajas (dependen del modelo de episodios laborales aún inexistente).

## Capabilities

### New Capabilities

- `whatsapp-history-import`: ingestión idempotente de exports históricos de WhatsApp al backend
  (persona/conversación/mensaje/lead con fechas reales), reutilizando el parser del cliente y el
  servicio de ingestión existente, sin disparar bot ni envíos.

### Modified Capabilities

<!-- Ninguna: el MessageIngestionService y el pipeline de leads no cambian de comportamiento;
     se exponen por un endpoint nuevo dedicado al histórico. -->

## Impact

- **Backend**: módulo/endpoint nuevo `import/` (`POST /api/import/whatsapp-history`) que valida
  el lote con zod y delega en `MessageIngestionService.ingest()`. Sin migración (usa tablas
  existentes: `people`, `channel_identities`, `conversations`, `messages`, `leads`).
- **Frontend**: en `ImportModule.tsx`, nueva tarjeta «Historial de WhatsApp (.zip)»; función
  `parseWhatsAppHistory(zip)` en `api/` que usa `jszip` + `parseWhatsAppChat` y postea en lotes.
- **Dependencias**: ninguna nueva (`jszip` ya está).
- **Datos**: se cargará en la base de desarrollo real (`crm_reclutamiento`) durante la
  verificación, poblándola con los 386 leads reales para el demo.
- **Privacidad**: los chats traen PII (teléfonos, nombres, datos de apto médico). La carpeta
  `Cargar datos/` ya quedó en `.gitignore`; los datos no se commitean.
- **Requiere**: sembrar las agentes (Damaris/Gladys/Hernán) antes de importar, con el mapeo
  Dulce→Damaris.
