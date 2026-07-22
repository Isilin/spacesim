ALTER TABLE `players` ADD `researched` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `research` text;--> statement-breakpoint
ALTER TABLE `players` ADD `influence` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `faction_rep` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `explored` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
-- Chantier 7b : migre l'état d'empire de `games` vers les `players` déjà existants
-- (sauvegardes créées au chantier 7a). Sans effet sur une base neuve (aucun player).
UPDATE `players` SET
  `researched`  = (SELECT `researched`  FROM `games` WHERE `games`.`id` = `players`.`game_id`),
  `research`    = (SELECT `research`     FROM `games` WHERE `games`.`id` = `players`.`game_id`),
  `influence`   = (SELECT `influence`    FROM `games` WHERE `games`.`id` = `players`.`game_id`),
  `faction_rep` = (SELECT `faction_rep`  FROM `games` WHERE `games`.`id` = `players`.`game_id`),
  `explored`    = (SELECT `explored`     FROM `games` WHERE `games`.`id` = `players`.`game_id`);