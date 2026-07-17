-- Decisión project.md §3.14: dinero de campañas con moneda explícita (default USD).
-- Rename seguro: los únicos consumidores de spend_mxn viven en este repo.
ALTER TABLE "campaigns" RENAME COLUMN "spend_mxn" TO "spend";--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "currency" text DEFAULT 'USD' NOT NULL;
