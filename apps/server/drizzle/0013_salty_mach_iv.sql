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
CREATE TABLE `faction_states` (
	`faction_id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`mood` text DEFAULT 'neutral' NOT NULL,
	`mood_until` integer
);
--> statement-breakpoint
CREATE TABLE `objectives` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`empire_id` text NOT NULL,
	`kind` text NOT NULL,
	`target_count` real,
	`target_system_id` text,
	`reward` real NOT NULL,
	`created_at` integer NOT NULL,
	`deadline` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `relation_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`from_empire_id` text NOT NULL,
	`to_empire_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `relations` (
	`game_id` text NOT NULL,
	`empire_a` text NOT NULL,
	`empire_b` text NOT NULL,
	`state` text DEFAULT 'neutral' NOT NULL,
	`since` integer NOT NULL,
	`until` integer
);
--> statement-breakpoint
CREATE TABLE `world_events` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`kind` text NOT NULL,
	`galaxy_id` text,
	`faction_id` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `missions` ADD `contract_id` text;--> statement-breakpoint
ALTER TABLE `players` ADD `kind` text DEFAULT 'human' NOT NULL;