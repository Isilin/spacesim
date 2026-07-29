CREATE TABLE "content_ships" (
	"id" text PRIMARY KEY NOT NULL,
	"name_fr" text NOT NULL,
	"description_fr" text DEFAULT '' NOT NULL,
	"capacity" double precision NOT NULL,
	"cost" text DEFAULT '{}' NOT NULL,
	"build_ms" integer NOT NULL,
	"requires_tech" text,
	"speed_mult" double precision NOT NULL,
	"fuel_per_jump" double precision NOT NULL
);
