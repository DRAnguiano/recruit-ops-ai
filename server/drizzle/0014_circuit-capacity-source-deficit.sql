-- Captura el DIF crudo del reporte HC 2026 por separado del déficit calculado (siempre
-- hcAuthorized - hcReal). Referencia para detectar divergencias con la fuente, nunca se usa
-- para calcular. Nullable: reportes sin columna DIF quedan sin advertencia.
ALTER TABLE "circuit_capacity" ADD COLUMN "source_deficit" integer;
