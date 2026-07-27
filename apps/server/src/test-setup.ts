import { db, runMigrations } from "./db/index.js";

/**
 * Setup global vitest (chantier 20.1) : `db/index.ts` n'applique plus les migrations
 * au chargement du module (effet de bord d'import supprimé) — chaque fichier de test
 * isolé doit donc les appliquer explicitement une fois avant ses propres `beforeEach`
 * (plusieurs fichiers touchent `db` directement sans passer par `GameEngine.boot`).
 */
runMigrations(db);
