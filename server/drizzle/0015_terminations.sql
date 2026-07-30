-- Bajas históricas importadas (add-employee-terminations): hechos crudos del reporte de RH, con
-- vínculo opcional a un operador vigente. Único por (nombre normalizado, fecha de baja) para
-- deduplicar el solape real entre hojas mensuales y semanales del reporte fuente.
CREATE TABLE "terminations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_id" uuid,
	"matched_by" text,
	"employee_name_raw" text NOT NULL,
	"employee_name_normalized" text NOT NULL,
	"emp_no_raw" text,
	"circuit" text,
	"hire_date" date,
	"termination_date" date NOT NULL,
	"termination_type" text,
	"termination_type_raw" text,
	"termination_category" text,
	"reason_short" text,
	"reason_detail" text,
	"comment" text,
	"tenure_days" integer,
	"source_sheet" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "terminations" ADD CONSTRAINT "terminations_operator_id_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operators"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "terminations_name_date_unique" ON "terminations" USING btree ("employee_name_normalized","termination_date");
