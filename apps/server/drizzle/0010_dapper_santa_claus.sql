CREATE TABLE "content_milestones" (
	"id" text PRIMARY KEY NOT NULL,
	"metric" text NOT NULL,
	"threshold" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_presets" (
	"id" text PRIMARY KEY NOT NULL,
	"name_fr" text NOT NULL,
	"description_fr" text DEFAULT '' NOT NULL,
	"chassis_id" text NOT NULL,
	"modules" text DEFAULT '[]' NOT NULL,
	"starter" integer DEFAULT 0 NOT NULL
);
