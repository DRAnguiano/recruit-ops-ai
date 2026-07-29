# Tasks — add-meta-pautas-import

## 1. Backend: endpoint de ingestión de pautas

- [x] 1.1 `import/meta-pautas.schemas.ts`: zod del lote (`campaigns[]` con `agent`, `name`,
      `startDate`/`endDate` ISO, `spend` num ≥0, `leadsReported` int ≥0)
- [x] 1.2 `BulkImportService.upsertCampaigns`: **ya persistía `targetAgentId`** vía
      `values = {...item}` (el schema `campaignCreateSchema` ya lo incluye); solo se exportó el
      tipo `CampaignRow` para tiparlo en el controller. Sin cambio de comportamiento del CSV
- [x] 1.3 `import/meta-pautas.controller.ts`: `POST /api/import/meta-pautas`; resuelve/siembra
      el agente por nombre (alias `Dulce→Damaris` lo aplica el cliente), deriva `isoWeek` de
      `startDate`, delega en `upsertCampaigns` con `targetAgentId`; responde `{created, updated}`
- [x] 1.4 Registrar el controller en `ImportModule` (+ exportar `BulkImportService` de `CatalogModule`)

## 2. Frontend: parser del xlsx multi-hoja

- [x] 2.1 `api/meta-pautas.ts`: `parseMetaPautas(file)` con `xlsx` — una hoja por agente,
      resolución de columnas por subcadena normalizada (tolerante a mojibake/orden), agente del
      nombre de hoja; devuelve `{campaigns, errors}`
- [x] 2.2 `ImportModule.tsx`: tarjeta «Pautas de Meta (.xlsx)»; postea a `/api/import/meta-pautas`;
      muestra resumen (campañas creadas/actualizadas, filas con error)

## 3. Tests y verificación

- [x] 3.1 Test backend: lote crea campañas con `targetAgentId` correcto; agente faltante
      sembrado; re-post idempotente por `(name, isoWeek)`
- [x] 3.2 `server/README.md` (endpoint de pautas) + suite completa (28 archivos / 200 tests) +
      lint + **verificación manual con datos reales**: importadas 30 campañas del xlsx real
      (Hernán 6/$127, Gladys 9/$358, Adriana 7/$236, Damaris 8/$299) contra `crm_reclutamiento`,
      cruzando con los leads reales por agente (Damaris 153, Gladys 84, Hernán 67; Adriana 0,
      correcto: sin chats). **Dos bugs reales encontrados y corregidos en la verificación** (que
      el test backend no cubría porque postea nombres ya limpios): (1) `agentFromSheetName` no
      manejaba dos meses pegados sin espacio («Junio julioHernan» → daba «julioHernan» en vez de
      «Hernan») — reescrito a retirar meses iterativamente; (2) discrepancia de grafía entre
      fuentes «Gladis» (pautas) vs «Gladys» (chats) rompía el cruce campaña↔lead — se añadió el
      alias `gladis→Gladys` (canónico = el de los chats). Idempotencia confirmada (re-import:
      created 0, todo update). **Tercer hallazgo (cumple el req 3 del spec)**: la vista de
      Campañas cruzaba por agente **Y** tipo de vacante, defaulteando a `'Sencillo'` cuando la
      campaña no tiene vacante → mostraba 0/9/2 en vez de 67/84/153. Corregido en
      `CampaignsView.tsx`: sin vacante asignada se cuentan todos los leads del agente; el KPI
      agregado cuenta leads distintos (304) para no multiplicar el mismo lead por campaña.