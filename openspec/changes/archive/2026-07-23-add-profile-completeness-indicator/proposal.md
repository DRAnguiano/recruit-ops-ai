## Why

El diccionario de perfilamiento (`custom-fields`) ya tiene 17 campos sembrados (2 de lead, 15 de
persona), 11 marcados como requeridos (circuito/vacante de interés, experiencia, tipo de unidad,
licencia con su vigencia y validación, apto médico con vigencia y validación, referencia laboral).
Hoy no hay forma de ver, de un vistazo, qué tan completo está el perfil de un candidato ni qué le
falta — el reclutador tiene que leer los 17 campos uno por uno. Con 208 de 269 leads sin perfil
estructurado (§7 del análisis operativo), un indicador de cumplimiento con desglose es lo que
permite priorizar el seguimiento.

## What Changes

- **Indicador de cumplimiento** dentro del panel «Campos personalizados» (visor de chat): «Perfil
  completo: X/11 (Y%)» calculado sobre los 11 campos requeridos (lead + persona) del candidato
  actual, con barra de progreso.
- **Desglose auditable**: lista de los campos requeridos que faltan (por su `label`, no su `key`),
  visible siempre que el perfil no esté al 100% — cumple la regla de auditabilidad (no es un número
  opaco).
- Cálculo 100% client-side, reutilizando los datos que `CustomFieldsPanel` ya trae de
  `GET .../custom-fields` — sin endpoint nuevo, sin cambio de esquema.

Fuera de alcance: mostrar el % en la Bandeja de Leads (tabla, requiere agregación por lead — change
futuro si se pide); cualquier lógica de scoring/decisión (esto es solo completitud de captura, no
un puntaje de aptitud — `add-scoring` es un change distinto, futuro, en F3).

## Capabilities

### New Capabilities

- `lead-profile-completeness`: el panel de campos personalizados muestra el % de cumplimiento del
  perfil (candidato + persona) sobre los campos requeridos, con el desglose de lo que falta.

## Impact

- **Frontend**: `src/components/CustomFieldsPanel.tsx`. **Sin backend, sin migración, sin
  dependencias nuevas.**
- **Datos**: ya aplicado (11 campos marcados `required:true` vía la API existente, sin código).
