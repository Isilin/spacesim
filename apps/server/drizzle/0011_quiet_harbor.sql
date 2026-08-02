ALTER TABLE "station_states" RENAME TO "trading_post_states";
--> statement-breakpoint
ALTER TABLE "universe_stations" RENAME TO "universe_trading_posts";
--> statement-breakpoint
ALTER TABLE "trading_post_states" RENAME COLUMN "station_id" TO "trading_post_id";
--> statement-breakpoint
ALTER TABLE "trading_post_states" RENAME CONSTRAINT "station_states_station_id_universe_stations_id_fk" TO "trading_post_states_trading_post_id_universe_trading_posts_id_fk";
--> statement-breakpoint
ALTER TABLE "universe_trading_posts" RENAME CONSTRAINT "universe_stations_system_id_unique" TO "universe_trading_posts_system_id_unique";
--> statement-breakpoint
ALTER TABLE "universe_trading_posts" RENAME CONSTRAINT "universe_stations_system_id_universe_systems_id_fk" TO "universe_trading_posts_system_id_universe_systems_id_fk";
