CREATE TABLE `world_events` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`kind` text NOT NULL,
	`galaxy_id` text,
	`faction_id` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
