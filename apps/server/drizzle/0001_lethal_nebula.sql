CREATE TABLE `claims` (
	`system_id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`claimed_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `games` ADD `influence` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `games` ADD `faction_rep` text DEFAULT '{}' NOT NULL;