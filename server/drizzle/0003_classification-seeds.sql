-- Seed de reglas de clasificación: las keywords probadas en la SPA
-- (src/utils/whatsappParser.ts), ahora como datos editables — nunca código.
-- El motor normaliza (minúsculas + sin acentos), por eso no hay variantes con/sin tilde.
INSERT INTO "classification_rules" ("category", "target", "keywords", "priority") VALUES
  ('ad_cta', NULL, '["quiero mas informacion","mas informacion sobre la vacante","unirse (respuesta recibida)","hola, vi esto en facebook","vi un anuncio de facebook","hola! me interesa","hola, me interesa"]'::jsonb, 10),
  ('internal_hr', NULL, '["nomina","vacaciones","infonavit","finiquito","aguinaldo","imss","imms","recibo","mi pago","tarjeta","pago de"]'::jsonb, 10),
  ('vacancy_type', 'escuelita', '["escuelita","capacitacion","aprender"]'::jsonb, 10),
  ('vacancy_type', 'full', '["full","doble articulado","doble remolque","dolly"]'::jsonb, 20),
  ('vacancy_type', 'sencillo', '["sencillo","camion rigido"]'::jsonb, 30),
  ('vacancy_type', 'quinta_rueda', '["5ta rueda","quinta rueda","trailer","ruta foranea","foraneo"]'::jsonb, 40);
--> statement-breakpoint
-- Ventana de inactividad configurable para cerrar conversaciones (decisión §3.7).
INSERT INTO "app_settings" ("key", "value")
VALUES ('conversation_inactivity_days', '21'::jsonb)
ON CONFLICT ("key") DO NOTHING;
