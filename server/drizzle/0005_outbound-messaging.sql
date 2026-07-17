CREATE TABLE "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"language" text DEFAULT 'es_MX' NOT NULL,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"body" text NOT NULL,
	"variables_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'approved' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "delivery" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "message_templates_name_language_channel" ON "message_templates" USING btree ("name","language","channel");