ALTER TABLE "universe_belts" ADD COLUMN "inclination" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "universe_belts" ADD COLUMN "ascending_node" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "universe_bodies" ADD COLUMN "inclination" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "universe_bodies" ADD COLUMN "ascending_node" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "universe_galaxies" ADD COLUMN "z" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "universe_systems" ADD COLUMN "z" integer DEFAULT 0 NOT NULL;