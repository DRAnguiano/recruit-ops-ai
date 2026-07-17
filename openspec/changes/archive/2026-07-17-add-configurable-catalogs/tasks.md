# Tasks — add-configurable-catalogs

## 1. Schema y datos

- [x] 1.1 Schema Drizzle: tablas `companies`, `circuits`, `vacancy_types`,
      `lead_statuses` (name/label/active/sortOrder); `goals` (periodKind, company,
      vacancyType, circuit nullable, target; único por combinación con COALESCE);
      `operators.operator_type` + `operators.circuit`
- [x] 1.2 Migración: crear tablas + seeds (6 estados, 4 tipos, DISTINCT de
      empresas/circuitos), copiar `monthly_goals` → `goals` (`periodKind='monthly'`),
      dropear la vieja

## 2. Validación y API

- [x] 2.1 `CatalogValueService`: `isValid(kind, name)` / `activeNames(kind)` con cache
      60 s + invalidación al mutar el catálogo
- [x] 2.2 CRUD `/api/companies` `/api/circuits` `/api/vacancy-types`
      `/api/lead-statuses` (name inmutable, DELETE referenciado → 409, eventos
      `actor='user'`)
- [x] 2.3 `/api/goals` por periodo (periodKind/circuit nuevos, unicidad 409,
      validación contra catálogos) conservando el contrato previo
- [x] 2.4 Validación de catálogo en vacantes (type/circuit/company), operadores
      (operatorType/circuit) y `currency` editable en `PATCH /api/campaigns/:id`
- [x] 2.5 Leads: `status` del PATCH y del filtro de listado contra el catálogo
      `lead-statuses` (400 con los permitidos en `issues`)

## 3. Tests y cierre

- [x] 3.1 Tests CRUD de catálogos: crear/listar ordenado, name inmutable, DELETE
      referenciado 409, entrada nueva válida tras invalidación de cache
- [x] 3.2 Tests de metas por periodo (weekly con circuito, duplicado 409, metas
      mensuales migradas intactas) y de validación en vacantes/operadores/campañas
- [x] 3.3 Tests de leads: status de catálogo aceptado, fuera de catálogo 400, seed
      `new` intacto para el pipeline
- [x] 3.4 README + project.md §10 (split 10a/10b/10c) + suite completa + lint +
      verificación manual (crear circuito y estado por API → usarlos en vacante y lead)
