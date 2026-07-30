-- Oferta versionada por campaña (add-campaign-offers): borrador → publicación inmutable.
-- Única por (campaign_id, version); la vigente se deriva (mayor version con status='published').
CREATE TABLE "campaign_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"salary_text" text,
	"payment_form" text,
	"bonuses" text,
	"benefits" text,
	"per_diem" text,
	"rest_days" text,
	"schedule" text,
	"route_type" text,
	"circuit" text,
	"unit_type" text,
	"vacancy_type" text,
	"new_units" boolean,
	"unit_condition" text,
	"maintenance_culture" text,
	"operator_care" text,
	"safety" text,
	"stability" text,
	"family_message" text,
	"substance_free_policy" boolean,
	"requirements" text,
	"location" text,
	"ad_text" text,
	"creative_ref" text,
	"cta" text,
	"valid_from" date,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_offers" ADD CONSTRAINT "campaign_offers_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_offers_campaign_version_unique" ON "campaign_offers" USING btree ("campaign_id","version");
