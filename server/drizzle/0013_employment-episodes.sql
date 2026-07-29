-- Registro inmutable de cada contratación (add-employment-episode-hire-record): un episodio por
-- operador, con snapshot de reclutador que contrató y campaña atribuida. Base del ciclo de vida
-- laboral (contratación → baja → reingreso).
CREATE TABLE "employment_episodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_id" uuid NOT NULL,
	"person_id" uuid,
	"lead_id" uuid,
	"hired_by_agent_id" uuid,
	"campaign_id" uuid,
	"hire_date" date,
	"episode_type" text DEFAULT 'new' NOT NULL,
	"snapshot_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employment_episodes_operator_id_unique" UNIQUE("operator_id")
);
--> statement-breakpoint
ALTER TABLE "employment_episodes" ADD CONSTRAINT "employment_episodes_operator_id_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operators"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "employment_episodes" ADD CONSTRAINT "employment_episodes_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "employment_episodes" ADD CONSTRAINT "employment_episodes_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "employment_episodes" ADD CONSTRAINT "employment_episodes_hired_by_agent_id_agents_id_fk" FOREIGN KEY ("hired_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "employment_episodes" ADD CONSTRAINT "employment_episodes_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;
