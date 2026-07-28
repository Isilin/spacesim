CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" bigint NOT NULL,
	"last_login_at" bigint,
	CONSTRAINT "accounts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "battles" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"at" bigint NOT NULL,
	"system_id" text NOT NULL,
	"attacker_name" text NOT NULL,
	"defender_name" text NOT NULL,
	"report" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blueprints" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"chassis_id" text NOT NULL,
	"modules" text DEFAULT '[]' NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"system_id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"owner_id" text,
	"claimed_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "colonies" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"owner_id" text,
	"planet_id" text NOT NULL,
	"name" text NOT NULL,
	"resources" text NOT NULL,
	"orbital_resources" text DEFAULT '{}' NOT NULL,
	"lift_rules" text DEFAULT '{}' NOT NULL,
	"buildings" text NOT NULL,
	"queue" text NOT NULL,
	"population" double precision DEFAULT 0 NOT NULL,
	"satisfaction" double precision DEFAULT 50 NOT NULL,
	"ships" text DEFAULT '{}' NOT NULL,
	"ships_busy" text DEFAULT '[]' NOT NULL,
	"ship_queue" text DEFAULT '[]' NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"issuer_id" text NOT NULL,
	"issuer_name" text NOT NULL,
	"issuer_color" text NOT NULL,
	"colony_id" text NOT NULL,
	"colony_name" text NOT NULL,
	"system_id" text NOT NULL,
	"resource" text NOT NULL,
	"quantity" double precision NOT NULL,
	"remaining" double precision NOT NULL,
	"price_per_unit" double precision NOT NULL,
	"created_at" bigint NOT NULL,
	"deadline" bigint NOT NULL,
	"status" text DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faction_states" (
	"faction_id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"mood" text DEFAULT 'neutral' NOT NULL,
	"mood_until" bigint
);
--> statement-breakpoint
CREATE TABLE "fleets" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"owner_id" text,
	"name" text NOT NULL,
	"system_id" text NOT NULL,
	"home_colony_id" text NOT NULL,
	"ships" text DEFAULT '{}' NOT NULL,
	"directives" text NOT NULL,
	"queue" text DEFAULT '[]' NOT NULL,
	"movement" text
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" text PRIMARY KEY NOT NULL,
	"seed" text NOT NULL,
	"tick" integer DEFAULT 0 NOT NULL,
	"last_tick_at" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	"galaxy_count" integer DEFAULT 3 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gateways" (
	"galaxy_id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"progress" text DEFAULT '{}' NOT NULL,
	"activates_at" bigint,
	"active" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "missions" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"kind" text NOT NULL,
	"from_colony_id" text NOT NULL,
	"target_id" text NOT NULL,
	"departed_at" bigint NOT NULL,
	"arrives_at" bigint NOT NULL,
	"cargo" text,
	"budget" double precision,
	"buy_resource" text,
	"capacity" double precision,
	"contract_id" text
);
--> statement-breakpoint
CREATE TABLE "objectives" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"empire_id" text NOT NULL,
	"kind" text NOT NULL,
	"target_count" double precision,
	"target_system_id" text,
	"reward" double precision NOT NULL,
	"created_at" bigint NOT NULL,
	"deadline" bigint NOT NULL,
	"status" text DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outposts" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"belt_id" text NOT NULL,
	"owner_colony_id" text NOT NULL,
	"ore_stock" double precision DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pirate_lairs" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"system_id" text NOT NULL,
	"ships" text NOT NULL,
	"directives" text NOT NULL,
	"bounty" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"account_id" text,
	"kind" text DEFAULT 'human' NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"joined_at" bigint NOT NULL,
	"researched" text DEFAULT '[]' NOT NULL,
	"research" text,
	"research_queue" text DEFAULT '[]' NOT NULL,
	"influence" double precision DEFAULT 0 NOT NULL,
	"faction_rep" text DEFAULT '{}' NOT NULL,
	"explored" text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relation_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"from_empire_id" text NOT NULL,
	"to_empire_id" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relations" (
	"game_id" text NOT NULL,
	"empire_a" text NOT NULL,
	"empire_b" text NOT NULL,
	"state" text DEFAULT 'neutral' NOT NULL,
	"since" bigint NOT NULL,
	"until" bigint
);
--> statement-breakpoint
CREATE TABLE "routes" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"owner_colony_id" text NOT NULL,
	"from_id" text NOT NULL,
	"from_kind" text DEFAULT 'colony' NOT NULL,
	"to_id" text NOT NULL,
	"to_kind" text NOT NULL,
	"resource" text NOT NULL,
	"rule" text NOT NULL,
	"ships" text NOT NULL,
	"active_cycle" text,
	"paused" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "station_states" (
	"station_id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"stocks" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"from_colony_id" text NOT NULL,
	"to_colony_id" text NOT NULL,
	"resources" text NOT NULL,
	"departed_at" bigint NOT NULL,
	"arrives_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "universe_belts" (
	"id" text PRIMARY KEY NOT NULL,
	"system_id" text NOT NULL,
	"belt_index" integer NOT NULL,
	"name" text NOT NULL,
	"orbit_radius" double precision NOT NULL,
	"deposits" text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "universe_bodies" (
	"id" text PRIMARY KEY NOT NULL,
	"system_id" text NOT NULL,
	"body_index" integer NOT NULL,
	"kind" text NOT NULL,
	"parent_planet_id" text,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"habitability" integer NOT NULL,
	"slots" integer NOT NULL,
	"deposits" text DEFAULT '{}' NOT NULL,
	"orbit_radius" double precision NOT NULL,
	"orbit_angle" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "universe_galaxies" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"galaxy_index" integer NOT NULL,
	"name" text NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"deposit_bonus" double precision NOT NULL,
	"anchor_system_id" text NOT NULL,
	"parent_galaxy_index" integer,
	"generator_version" integer NOT NULL,
	"materialized_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "universe_links" (
	"galaxy_id" text NOT NULL,
	"a_system_id" text NOT NULL,
	"b_system_id" text NOT NULL,
	"link_index" integer NOT NULL,
	CONSTRAINT "universe_links_a_system_id_b_system_id_pk" PRIMARY KEY("a_system_id","b_system_id")
);
--> statement-breakpoint
CREATE TABLE "universe_stations" (
	"id" text PRIMARY KEY NOT NULL,
	"system_id" text NOT NULL,
	"faction_id" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "universe_stations_system_id_unique" UNIQUE("system_id")
);
--> statement-breakpoint
CREATE TABLE "universe_systems" (
	"id" text PRIMARY KEY NOT NULL,
	"galaxy_id" text NOT NULL,
	"system_index" integer NOT NULL,
	"name" text NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_events" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"kind" text NOT NULL,
	"galaxy_id" text,
	"faction_id" text,
	"created_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "battles" ADD CONSTRAINT "battles_system_id_universe_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."universe_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_system_id_universe_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."universe_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colonies" ADD CONSTRAINT "colonies_planet_id_universe_bodies_id_fk" FOREIGN KEY ("planet_id") REFERENCES "public"."universe_bodies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_system_id_universe_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."universe_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleets" ADD CONSTRAINT "fleets_system_id_universe_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."universe_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateways" ADD CONSTRAINT "gateways_galaxy_id_universe_galaxies_id_fk" FOREIGN KEY ("galaxy_id") REFERENCES "public"."universe_galaxies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outposts" ADD CONSTRAINT "outposts_belt_id_universe_belts_id_fk" FOREIGN KEY ("belt_id") REFERENCES "public"."universe_belts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pirate_lairs" ADD CONSTRAINT "pirate_lairs_system_id_universe_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."universe_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_states" ADD CONSTRAINT "station_states_station_id_universe_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."universe_stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "universe_belts" ADD CONSTRAINT "universe_belts_system_id_universe_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."universe_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "universe_bodies" ADD CONSTRAINT "universe_bodies_system_id_universe_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."universe_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "universe_links" ADD CONSTRAINT "universe_links_galaxy_id_universe_galaxies_id_fk" FOREIGN KEY ("galaxy_id") REFERENCES "public"."universe_galaxies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "universe_links" ADD CONSTRAINT "universe_links_a_system_id_universe_systems_id_fk" FOREIGN KEY ("a_system_id") REFERENCES "public"."universe_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "universe_links" ADD CONSTRAINT "universe_links_b_system_id_universe_systems_id_fk" FOREIGN KEY ("b_system_id") REFERENCES "public"."universe_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "universe_stations" ADD CONSTRAINT "universe_stations_system_id_universe_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."universe_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "universe_systems" ADD CONSTRAINT "universe_systems_galaxy_id_universe_galaxies_id_fk" FOREIGN KEY ("galaxy_id") REFERENCES "public"."universe_galaxies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_events" ADD CONSTRAINT "world_events_galaxy_id_universe_galaxies_id_fk" FOREIGN KEY ("galaxy_id") REFERENCES "public"."universe_galaxies"("id") ON DELETE no action ON UPDATE no action;