ALTER TABLE "transfers" RENAME COLUMN "to_colony_id" TO "to_id";
--> statement-breakpoint
ALTER TABLE "transfers" ADD COLUMN "to_kind" text DEFAULT 'colony' NOT NULL;
