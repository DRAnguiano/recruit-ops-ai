-- Catálogos de valores de dominio como datos (configurable-catalogs):
-- empresas, circuitos, tipos de vacante y estados de lead dejan de ser
-- enums/texto libre en código. Seeds desde los valores reales existentes.
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"label" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "circuits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"label" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "circuits_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "vacancy_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"label" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vacancy_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "lead_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"label" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_statuses_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_kind" text DEFAULT 'monthly' NOT NULL,
	"company" text NOT NULL,
	"vacancy_type" text NOT NULL,
	"circuit" text,
	"target" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "goals_period_company_type_circuit" ON "goals" ("period_kind","company","vacancy_type",COALESCE("circuit",''));
--> statement-breakpoint
INSERT INTO "goals" ("period_kind","company","vacancy_type","target","created_at","updated_at")
SELECT 'monthly', "company", "vacancy_type", "monthly_target", "created_at", "updated_at" FROM "monthly_goals";
--> statement-breakpoint
DROP TABLE "monthly_goals";
--> statement-breakpoint
ALTER TABLE "operators" ADD COLUMN "operator_type" text;
--> statement-breakpoint
ALTER TABLE "operators" ADD COLUMN "circuit" text;
--> statement-breakpoint
INSERT INTO "lead_statuses" ("name","label","sort_order") VALUES
	('new','Nuevo',0),
	('in_progress','En proceso',1),
	('documents','Documentos',2),
	('hired','Contratado',3),
	('discarded','Descartado',4),
	('no_response','Sin respuesta',5);
--> statement-breakpoint
INSERT INTO "vacancy_types" ("name","label","sort_order") VALUES
	('sencillo','Sencillo',0),
	('full','Full',1),
	('quinta_rueda','Quinta rueda',2),
	('escuelita','Escuelita',3);
--> statement-breakpoint
INSERT INTO "companies" ("name","label")
SELECT DISTINCT "company", "company" FROM (
	SELECT "company" FROM "job_vacancies"
	UNION SELECT "company" FROM "operators"
	UNION SELECT "company" FROM "fleet"
	UNION SELECT "company" FROM "goals"
) AS all_companies
WHERE "company" IS NOT NULL AND "company" <> ''
ON CONFLICT ("name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "circuits" ("name","label")
SELECT DISTINCT "circuit", "circuit" FROM (
	SELECT "circuit" FROM "job_vacancies"
	UNION SELECT "circuit" FROM "goals"
) AS all_circuits
WHERE "circuit" IS NOT NULL AND "circuit" <> ''
ON CONFLICT ("name") DO NOTHING;
