CREATE TABLE "empire_events" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"empire_id" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" bigint NOT NULL,
	"read_at" bigint,
	"system_id" text,
	"colony_id" text,
	"other_name" text,
	"subject_id" text,
	"amount" double precision
);
--> statement-breakpoint
CREATE INDEX "empire_events_empire_created_idx" ON "empire_events" USING btree ("empire_id","created_at");