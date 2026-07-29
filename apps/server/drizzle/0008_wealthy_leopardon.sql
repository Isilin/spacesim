CREATE TABLE "content_techs" (
	"id" text PRIMARY KEY NOT NULL,
	"name_fr" text NOT NULL,
	"description_fr" text DEFAULT '' NOT NULL,
	"branch" text NOT NULL,
	"cost" double precision NOT NULL,
	"duration_ms" integer NOT NULL,
	"requires" text DEFAULT '[]' NOT NULL,
	"effects" text DEFAULT '{}' NOT NULL
);
