CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"scope" text NOT NULL,
	"scope_id" text NOT NULL,
	"author_empire_id" text NOT NULL,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"sent_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mails" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"from_empire_id" text NOT NULL,
	"from_name" text NOT NULL,
	"to_empire_id" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"sent_at" bigint NOT NULL,
	"read_at" bigint
);
--> statement-breakpoint
CREATE INDEX "chat_messages_scope_sent_idx" ON "chat_messages" USING btree ("scope","scope_id","sent_at");--> statement-breakpoint
CREATE INDEX "mails_to_sent_idx" ON "mails" USING btree ("to_empire_id","sent_at");