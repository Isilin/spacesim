CREATE TABLE `contracts` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`issuer_id` text NOT NULL,
	`issuer_name` text NOT NULL,
	`issuer_color` text NOT NULL,
	`colony_id` text NOT NULL,
	`colony_name` text NOT NULL,
	`system_id` text NOT NULL,
	`resource` text NOT NULL,
	`quantity` real NOT NULL,
	`remaining` real NOT NULL,
	`price_per_unit` real NOT NULL,
	`created_at` integer NOT NULL,
	`deadline` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
ALTER TABLE `players` ADD `kind` text DEFAULT 'human' NOT NULL;