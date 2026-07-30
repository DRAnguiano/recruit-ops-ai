## Context

Fuente: hoja(s) «Bajas <Mes><Año>» y «Bajas Sem0X2026» de `Base presentación Semanal 2026.xlsx` (8
hojas útiles; se excluyen «Bajas TMS2025»/«Bajas TMS 2026» — calendarios agregados sin filas por
persona—, «HC. Bajas. Altas» —vacía— y «Altas.Bajas Sem-mes» —resumen agregado, no detalle).
Columnas presentes (nombres varían de orden entre hojas, se resuelven por nombre como en los demás
parsers del proyecto): `Nombre Interno`, `Num Empleado` (**solo en Bajas Enero2026**), `Circuito`,
`Fecha Ingreso`, `Fecha Baja`, `Nom Motivo Baja`, `Clasificacion de baja`, `BOS`, `Submotivo Baja`,
`Comentario Baja`.

Verificado contra el archivo real: 194 filas con nombre+fecha de baja en las 8 hojas; **178 claves
únicas** por `(nombre normalizado, fecha de baja)` — las hojas semanales `Sem03`/`Sem042026`
duplican bajas de enero ya presentes en `Bajas Enero2026`. Los 4 valores de `Nom Motivo Baja`
(insensible a acento/mayúscula) son exactamente: RENUNCIA VOLUNTARIA (80), ABANDONO DE TRABAJO (58),
RESCICIÓN/RESCICION DE CONTRATO (54, dos grafías), PENSIÓN POR INCAPACIDAD (2) — coincide con las 4
categorías de «tipo general de salida» del análisis del usuario (73/52/51/1 en su ventana ene-jun;
la diferencia es la ventana de fechas, no la taxonomía).

La mayoría de las 178 personas ya no están en `operators` (582 vigentes hoy) — dejaron la empresa y
no forman parte de exportaciones posteriores del directorio.

## Goals / Non-Goals

**Goals:** persistir las bajas históricas con su motivo/tipo, permanencia y vínculo opcional
honesto; deduplicar el solape real entre hojas; base para la analítica del change siguiente.

**Non-Goals:** analítica de permanencia (30/60/90, por circuito/tipo) — change siguiente; vista en
la SPA; cerrar `employment_episodes` de operadores vigentes que causen baja en el futuro (mecanismo
distinto, hacia adelante, no parte de esta carga histórica); normalizar `BOS`/`Submotivo Baja` (el
propio análisis del usuario nota que ese catálogo tiene duplicados/variantes de escritura — se
guarda tal cual, sin inventar una normalización no pedida).

## Decisions

### 1. Tabla independiente `terminations`, no una extensión de `employment_episodes`
`employment_episodes.operatorId` es `NOT NULL UNIQUE` — asume un operador vigente. La mayoría de las
178 bajas históricas no tienen operador vigente que referenciar. Forzar el vínculo produciría
episodios huérfanos o requeriría relajar esa restricción para un caso que no es el suyo (contratación
vigente). Se modela como tabla propia con `operatorId` **nullable**, análoga a `circuit_capacity`
o `whatsapp-history-import`: hechos importados de una fuente externa, con vínculo interno opcional.

### 2. Vínculo a operador: por empNo si existe, si no por nombre exacto, nunca ambiguo
Orden: (a) si la fila trae `Num Empleado` (solo enero), match exacto por `operators.emp_no`; (b) si
no, normalizar el nombre (mayúsculas, espacios colapsados, trim) y buscar en `operators.name`
normalizado igual — si hay **exactamente una** coincidencia, se vincula (`matchedBy='name'`); si hay
cero o más de una, se deja `operatorId=null` (regla §2: no inventar). El nombre crudo siempre se
guarda, vinculado o no, para auditoría.

### 3. Tipo de baja: texto validado en 4 categorías, con crudo de respaldo
`terminationType` es `text` (nunca enum de Postgres, ver comentario de diseño ya existente en
`schema.ts`) validado contra las 4 categorías detectadas; si el texto de origen no calza con
ninguna (variante futura no vista), `terminationType` queda `null` y `terminationTypeRaw` conserva
el texto — nunca se fuerza una categoría por adivinanza. No se modela como catálogo editable (como
`companies`/`circuits`) porque refleja la taxonomía fija de un sistema externo (RH), no una regla de
negocio que el usuario vaya a editar desde la UI.

### 4. Deduplicación por `(nombre_normalizado, fecha_baja)`, `ON CONFLICT DO NOTHING`
Constraint único sobre esas dos columnas. Reimportar el mismo archivo (o una hoja que se solape con
otra, como Sem03/Sem04 vs. Enero) no duplica — primera carga gana, consistente con el patrón de
idempotencia ya usado en `whatsapp-history-import`/`meta-pautas-import`.

### 5. `tenureDays` calculado y guardado en la importación
`terminationDate − hireDate` en días, cuando ambas fechas existen; `null` si falta alguna. Se
guarda (no se recalcula en cada lectura) porque las fechas de origen no cambian tras la carga —
misma decisión que `circuit_capacity.deficit`.

## Risks / Trade-offs

- **Vínculo a operador será minoritario** (la mayoría de las 178 personas ya no están en el
  directorio) → esperado y correcto; la analítica de permanencia usa `hireDate`/`terminationDate`
  propios de `terminations`, no depende de `operators`.
- **`BOS`/`Submotivo Baja` sin normalizar** → se guardan crudos; cualquier agrupación futura de
  motivos frecuentes deberá lidiar con las variantes, tal como advierte el propio análisis del
  usuario — no se resuelve aquí para no inventar una taxonomía no solicitada.
- **178 vs. 177** (diferencia de 1 respecto al análisis del usuario) → diferencia mínima, atribuible
  a un caso límite de fecha/nombre; no se investiga más a fondo salvo que la verificación final lo
  amerite.
