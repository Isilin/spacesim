ALTER TABLE "universe_bodies" ADD COLUMN "class_id" text DEFAULT 'rocky' NOT NULL;--> statement-breakpoint
ALTER TABLE "universe_bodies" ADD COLUMN "variant_id" text DEFAULT 'barren' NOT NULL;--> statement-breakpoint
ALTER TABLE "universe_bodies" DROP COLUMN "type";