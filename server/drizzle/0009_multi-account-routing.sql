-- Multi-account routing (add-multi-account-routing): varias cuentas por canal.
-- La credencial gana account_external_id (derivado del secreto en la app; el
-- backfill de filas existentes lo hace un paso de arranque, no SQL, porque los
-- secretos están cifrados). La conversación recuerda por qué cuenta responde.
ALTER TABLE "channel_credentials" ADD COLUMN "account_external_id" text;
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "channel_account" text;
--> statement-breakpoint
DROP INDEX IF EXISTS "channel_credentials_active_kind";
--> statement-breakpoint
CREATE UNIQUE INDEX "channel_credentials_active_account" ON "channel_credentials" USING btree ("kind","account_external_id") WHERE "channel_credentials"."active" AND "channel_credentials"."kind" <> 'meta_app';
--> statement-breakpoint
CREATE UNIQUE INDEX "channel_credentials_active_meta_app" ON "channel_credentials" USING btree ("kind") WHERE "channel_credentials"."active" AND "channel_credentials"."kind" = 'meta_app';
