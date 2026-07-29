CREATE TABLE "content_combat_tuning" (
	"id" text PRIMARY KEY NOT NULL,
	"category_advantage" text NOT NULL,
	"directives" text NOT NULL,
	"directive_counter" text NOT NULL,
	"counter_bonus" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_warships" (
	"id" text PRIMARY KEY NOT NULL,
	"name_fr" text NOT NULL,
	"description_fr" text DEFAULT '' NOT NULL,
	"hull" double precision NOT NULL,
	"shield" double precision NOT NULL,
	"weapons" text NOT NULL,
	"initiative" double precision NOT NULL,
	"category" text NOT NULL,
	"cost" text DEFAULT '{}' NOT NULL,
	"build_ms" integer NOT NULL,
	"requires_tech" text,
	"fleet_damage_bonus" double precision
);
