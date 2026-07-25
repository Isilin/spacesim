CREATE TABLE `relations` (
	`game_id` text NOT NULL,
	`empire_a` text NOT NULL,
	`empire_b` text NOT NULL,
	`state` text DEFAULT 'neutral' NOT NULL,
	`since` integer NOT NULL,
	`until` integer
);
