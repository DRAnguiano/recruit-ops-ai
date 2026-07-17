-- Credenciales de canal cifradas (channel-credentials): los secretos por canal
-- salen de env a esta tabla. secrets_encrypted es base64(iv||authTag||ciphertext)
-- del JSON de secretos (AES-256-GCM con la llave maestra de env). El índice
-- único parcial impone una sola credencial activa por kind.
CREATE TABLE "channel_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"secrets_encrypted" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "channel_credentials_active_kind" ON "channel_credentials" USING btree ("kind") WHERE "channel_credentials"."active";
