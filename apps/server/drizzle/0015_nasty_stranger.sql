CREATE TABLE `universe_belts` (
	`id` text PRIMARY KEY NOT NULL,
	`system_id` text NOT NULL,
	`belt_index` integer NOT NULL,
	`name` text NOT NULL,
	`orbit_radius` real NOT NULL,
	`deposits` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`system_id`) REFERENCES `universe_systems`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `universe_bodies` (
	`id` text PRIMARY KEY NOT NULL,
	`system_id` text NOT NULL,
	`body_index` integer NOT NULL,
	`kind` text NOT NULL,
	`parent_planet_id` text,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`habitability` integer NOT NULL,
	`slots` integer NOT NULL,
	`deposits` text DEFAULT '{}' NOT NULL,
	`orbit_radius` real NOT NULL,
	`orbit_angle` real NOT NULL,
	FOREIGN KEY (`system_id`) REFERENCES `universe_systems`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `universe_galaxies` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`galaxy_index` integer NOT NULL,
	`name` text NOT NULL,
	`x` integer NOT NULL,
	`y` integer NOT NULL,
	`deposit_bonus` real NOT NULL,
	`anchor_system_id` text NOT NULL,
	`parent_galaxy_index` integer,
	`generator_version` integer NOT NULL,
	`materialized_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `universe_links` (
	`galaxy_id` text NOT NULL,
	`a_system_id` text NOT NULL,
	`b_system_id` text NOT NULL,
	`link_index` integer NOT NULL,
	PRIMARY KEY(`a_system_id`, `b_system_id`),
	FOREIGN KEY (`galaxy_id`) REFERENCES `universe_galaxies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`a_system_id`) REFERENCES `universe_systems`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`b_system_id`) REFERENCES `universe_systems`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `universe_stations` (
	`id` text PRIMARY KEY NOT NULL,
	`system_id` text NOT NULL,
	`faction_id` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`system_id`) REFERENCES `universe_systems`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `universe_stations_system_id_unique` ON `universe_stations` (`system_id`);--> statement-breakpoint
CREATE TABLE `universe_systems` (
	`id` text PRIMARY KEY NOT NULL,
	`galaxy_id` text NOT NULL,
	`system_index` integer NOT NULL,
	`name` text NOT NULL,
	`x` integer NOT NULL,
	`y` integer NOT NULL,
	FOREIGN KEY (`galaxy_id`) REFERENCES `universe_galaxies`(`id`) ON UPDATE no action ON DELETE no action
);
