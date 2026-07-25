CREATE TABLE `blueprints` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`chassis_id` text NOT NULL,
	`modules` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL
);
