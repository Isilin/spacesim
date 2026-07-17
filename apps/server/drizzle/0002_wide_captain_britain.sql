CREATE TABLE `gateways` (
	`galaxy_id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`progress` text DEFAULT '{}' NOT NULL,
	`activates_at` integer,
	`active` integer DEFAULT 0 NOT NULL
);
