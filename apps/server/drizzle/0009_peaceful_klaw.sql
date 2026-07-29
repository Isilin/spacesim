CREATE TABLE "content_chassis" (
	"id" text PRIMARY KEY NOT NULL,
	"name_fr" text NOT NULL,
	"description_fr" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"domain" text NOT NULL,
	"hull" double precision NOT NULL,
	"base_initiative" double precision NOT NULL,
	"power" double precision NOT NULL,
	"tonnage" double precision NOT NULL,
	"calc" double precision NOT NULL,
	"slots" text DEFAULT '{}' NOT NULL,
	"base_speed_mult" double precision NOT NULL,
	"base_fuel_per_jump" double precision NOT NULL,
	"role_bonus" text,
	"cost" text DEFAULT '{}' NOT NULL,
	"build_ms" integer NOT NULL,
	"requires_tech" text
);
--> statement-breakpoint
CREATE TABLE "content_modules" (
	"id" text PRIMARY KEY NOT NULL,
	"name_fr" text NOT NULL,
	"description_fr" text DEFAULT '' NOT NULL,
	"slot" text NOT NULL,
	"role" text NOT NULL,
	"power" double precision NOT NULL,
	"tonnage" double precision NOT NULL,
	"calc" double precision NOT NULL,
	"cost" text DEFAULT '{}' NOT NULL,
	"build_ms" integer NOT NULL,
	"requires_tech" text,
	"effects" text DEFAULT '{}' NOT NULL
);
