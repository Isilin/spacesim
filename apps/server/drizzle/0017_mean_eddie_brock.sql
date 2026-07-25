CREATE TABLE `relation_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`from_empire_id` text NOT NULL,
	`to_empire_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL
);
