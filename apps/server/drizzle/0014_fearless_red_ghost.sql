ALTER TABLE "content_installations" ADD COLUMN "grants" text;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "venue_kind" text;--> statement-breakpoint
ALTER TABLE "stations" ADD COLUMN "market_access" text DEFAULT 'closed' NOT NULL;--> statement-breakpoint
ALTER TABLE "stations" ADD COLUMN "market_tax_rate" double precision DEFAULT 0 NOT NULL;