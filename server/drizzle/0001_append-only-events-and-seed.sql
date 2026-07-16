-- domain_events es append-only: cualquier UPDATE o DELETE se rechaza a nivel
-- de base de datos. Para mantenimientos controlados (p. ej. purga legal),
-- deshabilitar temporalmente el trigger en una migración explícita:
--   ALTER TABLE domain_events DISABLE TRIGGER domain_events_append_only;
CREATE OR REPLACE FUNCTION reject_domain_events_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'domain_events is append-only: % not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER domain_events_append_only
  BEFORE UPDATE OR DELETE ON "domain_events"
  FOR EACH ROW EXECUTE FUNCTION reject_domain_events_mutation();
--> statement-breakpoint
-- Horario laboral por defecto (mismos valores que usaba la SPA), TZ IANA.
INSERT INTO "work_schedules" ("name", "work_days", "start_time", "end_time", "timezone")
VALUES ('default', '[1,2,3,4,5]'::jsonb, '07:45', '17:10', 'America/Mexico_City')
ON CONFLICT ("name") DO NOTHING;
