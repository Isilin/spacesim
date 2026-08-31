CREATE TABLE "market_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"station_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"side" text NOT NULL,
	"resource" text NOT NULL,
	"remaining" double precision NOT NULL,
	"price_per_unit" double precision NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "station_holdings" (
	"station_id" text NOT NULL,
	"empire_id" text NOT NULL,
	"game_id" text NOT NULL,
	"resources" text DEFAULT '{}' NOT NULL,
	"credits" double precision DEFAULT 0 NOT NULL,
	CONSTRAINT "station_holdings_station_id_empire_id_pk" PRIMARY KEY("station_id","empire_id")
);
--> statement-breakpoint
ALTER TABLE "market_orders" ADD CONSTRAINT "market_orders_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_holdings" ADD CONSTRAINT "station_holdings_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "market_orders_station_idx" ON "market_orders" USING btree ("station_id","resource");