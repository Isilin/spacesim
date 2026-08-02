CREATE TABLE "content_installations" (
	"id" text PRIMARY KEY NOT NULL,
	"name_fr" text NOT NULL,
	"description_fr" text DEFAULT '' NOT NULL,
	"zone_type" text NOT NULL,
	"cost" text DEFAULT '{}' NOT NULL,
	"build_ms" integer NOT NULL,
	"inputs" text DEFAULT '{}' NOT NULL,
	"outputs" text DEFAULT '{}' NOT NULL,
	"requires_tech" text
);
--> statement-breakpoint
CREATE TABLE "content_zone_types" (
	"id" text PRIMARY KEY NOT NULL,
	"name_fr" text NOT NULL,
	"description_fr" text DEFAULT '' NOT NULL,
	"cost" text DEFAULT '{}' NOT NULL,
	"build_ms" integer NOT NULL,
	"requires_tech" text
);
--> statement-breakpoint
CREATE TABLE "stations" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"body_id" text NOT NULL,
	"system_id" text NOT NULL,
	"name" text NOT NULL,
	"resources" text NOT NULL,
	"zones" text DEFAULT '{}' NOT NULL,
	"zone_queue" text DEFAULT '[]' NOT NULL,
	"installations" text DEFAULT '{}' NOT NULL,
	"install_queue" text DEFAULT '[]' NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_body_id_universe_bodies_id_fk" FOREIGN KEY ("body_id") REFERENCES "public"."universe_bodies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_system_id_universe_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."universe_systems"("id") ON DELETE no action ON UPDATE no action;