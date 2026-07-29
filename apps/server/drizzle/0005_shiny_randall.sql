CREATE TABLE "content_buildings" (
	"id" text PRIMARY KEY NOT NULL,
	"name_fr" text NOT NULL,
	"description_fr" text DEFAULT '' NOT NULL,
	"cost" text DEFAULT '{}' NOT NULL,
	"build_ms" integer NOT NULL,
	"outputs" text,
	"inputs" text,
	"deposit_scaled" text,
	"jobs_per_instance" integer
);
