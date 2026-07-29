-- Capacidad de dotación por circuito (add-operational-capacity): snapshot de
-- HC autorizado vs. real por circuito, importado de la hoja «HC 2026». Único
-- por circuito (una foto vigente); reimportar hace upsert.
CREATE TABLE "circuit_capacity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circuit" text NOT NULL,
	"units" integer DEFAULT 0 NOT NULL,
	"units_in_maintenance" integer DEFAULT 0 NOT NULL,
	"units_active" integer DEFAULT 0 NOT NULL,
	"hc_authorized" integer DEFAULT 0 NOT NULL,
	"hc_real" integer DEFAULT 0 NOT NULL,
	"deficit" integer DEFAULT 0 NOT NULL,
	"snapshot_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "circuit_capacity_circuit_unique" UNIQUE("circuit")
);
