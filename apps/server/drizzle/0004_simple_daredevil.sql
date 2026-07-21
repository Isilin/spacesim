CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`joined_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `claims` ADD `owner_id` text;--> statement-breakpoint
ALTER TABLE `colonies` ADD `owner_id` text;--> statement-breakpoint
ALTER TABLE `fleets` ADD `owner_id` text;