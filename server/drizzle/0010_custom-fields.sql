-- Diccionario de campos personalizados (add-custom-fields): una pareja de
-- tablas por entidad (lead/person) con la misma forma, con FK real hacia su
-- entidad (ON DELETE CASCADE) en vez de una tabla compartida con `entity` +
-- `entity_id` sin FK. Cada valor lleva evidencia (fuente + cita), precursor
-- del score auditable.
CREATE TABLE "lead_field_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" text NOT NULL,
	"options" jsonb,
	"required" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_field_definitions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "person_field_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" text NOT NULL,
	"options" jsonb,
	"required" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_field_definitions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "lead_field_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"definition_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"value" jsonb NOT NULL,
	"source" text DEFAULT 'human' NOT NULL,
	"evidence_text" text,
	"evidence_message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_field_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"definition_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"value" jsonb NOT NULL,
	"source" text DEFAULT 'human' NOT NULL,
	"evidence_text" text,
	"evidence_message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_field_values" ADD CONSTRAINT "lead_field_values_definition_id_lead_field_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."lead_field_definitions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lead_field_values" ADD CONSTRAINT "lead_field_values_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "person_field_values" ADD CONSTRAINT "person_field_values_definition_id_person_field_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."person_field_definitions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "person_field_values" ADD CONSTRAINT "person_field_values_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "lead_field_values_definition_lead" ON "lead_field_values" USING btree ("definition_id","lead_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "person_field_values_definition_person" ON "person_field_values" USING btree ("definition_id","person_id");
