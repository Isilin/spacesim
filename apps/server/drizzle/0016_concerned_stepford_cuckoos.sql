-- Reprend les guerres en cours dans le nouveau modèle de relation (chantier 16) avant
-- de supprimer l'ancienne table — since inconnue (jamais suivie par `wars`), 0 fait foi.
INSERT INTO `relations` (`game_id`, `empire_a`, `empire_b`, `state`, `since`, `until`)
SELECT `game_id`, `empire_a`, `empire_b`, 'war', 0, NULL FROM `wars`;
--> statement-breakpoint
DROP TABLE `wars`;