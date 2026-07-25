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
