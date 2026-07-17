CREATE TABLE `colonies` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`planet_id` text NOT NULL,
	`name` text NOT NULL,
	`resources` text NOT NULL,
	`buildings` text NOT NULL,
	`queue` text NOT NULL,
	`population` real DEFAULT 0 NOT NULL,
	`satisfaction` real DEFAULT 50 NOT NULL,
	`ships` text DEFAULT '{}' NOT NULL,
	`ships_busy` text DEFAULT '[]' NOT NULL,
	`ship_queue` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`seed` text NOT NULL,
	`tick` integer DEFAULT 0 NOT NULL,
	`last_tick_at` integer NOT NULL,
	`explored` text DEFAULT '[]' NOT NULL,
	`researched` text DEFAULT '[]' NOT NULL,
	`research` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `missions` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`kind` text NOT NULL,
	`from_colony_id` text NOT NULL,
	`target_id` text NOT NULL,
	`departed_at` integer NOT NULL,
	`arrives_at` integer NOT NULL,
	`cargo` text,
	`budget` real,
	`buy_resource` text,
	`capacity` real
);
--> statement-breakpoint
CREATE TABLE `outposts` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`belt_id` text NOT NULL,
	`owner_colony_id` text NOT NULL,
	`ore_stock` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `routes` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`owner_colony_id` text NOT NULL,
	`from_id` text NOT NULL,
	`from_kind` text DEFAULT 'colony' NOT NULL,
	`to_id` text NOT NULL,
	`to_kind` text NOT NULL,
	`resource` text NOT NULL,
	`rule` text NOT NULL,
	`ships` text NOT NULL,
	`active_cycle` text,
	`paused` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `station_states` (
	`station_id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`stocks` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`from_colony_id` text NOT NULL,
	`to_colony_id` text NOT NULL,
	`resources` text NOT NULL,
	`departed_at` integer NOT NULL,
	`arrives_at` integer NOT NULL
);
