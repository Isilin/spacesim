CREATE TABLE "account_sanctions" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"kind" text NOT NULL,
	"reason" text NOT NULL,
	"actor_account_id" text NOT NULL,
	"actor_email" text NOT NULL,
	"created_at" bigint NOT NULL,
	"expires_at" bigint
);
