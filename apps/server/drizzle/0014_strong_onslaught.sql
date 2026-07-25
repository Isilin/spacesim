CREATE TABLE `faction_states` (
	`faction_id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`mood` text DEFAULT 'neutral' NOT NULL,
	`mood_until` integer
);
