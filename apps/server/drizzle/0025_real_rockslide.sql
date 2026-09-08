CREATE TABLE "universe_bridges" (
	"galaxy_id" text NOT NULL,
	"a_system_id" text NOT NULL,
	"b_system_id" text NOT NULL,
	"bridge_index" integer NOT NULL,
	CONSTRAINT "universe_bridges_a_system_id_b_system_id_pk" PRIMARY KEY("a_system_id","b_system_id")
);
--> statement-breakpoint
CREATE TABLE "universe_stars" (
	"id" text PRIMARY KEY NOT NULL,
	"system_id" text NOT NULL,
	"star_index" integer NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"type_id" text NOT NULL,
	"mass" double precision NOT NULL,
	"orbit_radius" double precision DEFAULT 0 NOT NULL,
	"orbit_angle" double precision DEFAULT 0 NOT NULL,
	"inclination" double precision DEFAULT 0 NOT NULL,
	"ascending_node" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "universe_galaxies" ADD COLUMN "type_id" text DEFAULT 'spiral' NOT NULL;--> statement-breakpoint
ALTER TABLE "universe_bridges" ADD CONSTRAINT "universe_bridges_galaxy_id_universe_galaxies_id_fk" FOREIGN KEY ("galaxy_id") REFERENCES "public"."universe_galaxies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "universe_bridges" ADD CONSTRAINT "universe_bridges_a_system_id_universe_systems_id_fk" FOREIGN KEY ("a_system_id") REFERENCES "public"."universe_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "universe_bridges" ADD CONSTRAINT "universe_bridges_b_system_id_universe_systems_id_fk" FOREIGN KEY ("b_system_id") REFERENCES "public"."universe_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "universe_stars" ADD CONSTRAINT "universe_stars_system_id_universe_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."universe_systems"("id") ON DELETE no action ON UPDATE no action;