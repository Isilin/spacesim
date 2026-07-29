CREATE TABLE "admin_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_account_id" text NOT NULL,
	"actor_email" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"reason" text,
	"metadata" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "role" text DEFAULT 'player' NOT NULL;