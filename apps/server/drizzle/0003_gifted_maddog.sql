CREATE TABLE `battles` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`at` integer NOT NULL,
	`system_id` text NOT NULL,
	`attacker_name` text NOT NULL,
	`defender_name` text NOT NULL,
	`report` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fleets` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`name` text NOT NULL,
	`system_id` text NOT NULL,
	`home_colony_id` text NOT NULL,
	`ships` text DEFAULT '{}' NOT NULL,
	`directives` text NOT NULL,
	`queue` text DEFAULT '[]' NOT NULL,
	`movement` text
);
--> statement-breakpoint
CREATE TABLE `pirate_lairs` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`system_id` text NOT NULL,
	`ships` text NOT NULL,
	`directives` text NOT NULL,
	`bounty` real NOT NULL
);
