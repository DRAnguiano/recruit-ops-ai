# Tasks — add-automatic-phone-attribution

## 1. Backend: cruce y persistencia

- [x] 1.1 `LeadsService.autoAttributeByPhone()`: obtiene candidatos de WhatsApp sin operador
      vinculado (con su teléfono normalizado a 10 dígitos vía `channel_identities`) y operadores sin
      episodio atribuido (con `normalizedPhones`); agrupa por teléfono (últimos 10 dígitos).
- [x] 1.2 Para cada teléfono con exactamente 1 candidato y 1 operador: `linkOperator` +
      `update(id, { status: 'hired' })`. Para teléfonos con más de un candidato u operador: agregar
      a `ambiguous[]` sin aplicar.
- [x] 1.3 Devolver `{ linked: number, ambiguous: { phone, leadIds, operatorIds }[] }`.
- [x] 1.4 `LeadsController`: `POST /api/leads/auto-attribute-by-phone`.

## 2. Frontend

- [x] 2.1 Botón «Cruzar por teléfono» en el panel de atribución manual (`src/App.tsx`), que llama al
      endpoint y muestra el resultado (vinculados / ambiguos) en `attributionStatusMsg`.
- [x] 2.2 Tras un cruce exitoso, recargar leads/operadores (`loadAllFromApi`) para reflejar los
      nuevos vínculos y episodios en las tablas existentes.

## 3. Verificación

- [x] 3.1 `npm run lint` (server + SPA) y `npm run build` del server en verde.
- [x] 3.2 Ejecutar el cruce contra `crm_reclutamiento`; confirmar que enlaza los matches unívocos
      esperados (~6), que sus episodios quedan con `hiredByAgent`/`campaign` y que una 2ª corrida no
      duplica ni re-vincula (idempotente).
- [x] 3.3 Confirmar en el dashboard: «Operadores contratados» y el registro de contrataciones
      reflejan los nuevos hires.
