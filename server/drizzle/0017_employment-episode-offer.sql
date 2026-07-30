-- Congela la oferta vigente de la campaña al momento de contratar (add-hire-offer-attribution),
-- mismo criterio que hired_by_agent_id/campaign_id: se fija una vez, nunca se sobrescribe.
ALTER TABLE "employment_episodes" ADD COLUMN "offer_version_id" uuid;
--> statement-breakpoint
ALTER TABLE "employment_episodes" ADD CONSTRAINT "employment_episodes_offer_version_id_campaign_offers_id_fk" FOREIGN KEY ("offer_version_id") REFERENCES "public"."campaign_offers"("id") ON DELETE no action ON UPDATE no action;
