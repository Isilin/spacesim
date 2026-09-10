import { existsSync } from "node:fs";
import { SCHEMA_SNAPSHOT } from "./test-global-setup.js";

/**
 * Setup global vitest (chantier 20.1) : `db/index.ts` n'applique plus les migrations
 * au chargement du module (effet de bord d'import supprimé) — chaque fichier de test
 * isolé doit donc les appliquer explicitement une fois avant ses propres `beforeEach`
 * (plusieurs fichiers touchent `db` directement sans passer par `GameEngine.boot`).
 *
 * Depuis le chantier 49, il ne les REJOUE plus : `test-global-setup.ts` a produit une
 * archive de datadir déjà migrée, et ce fichier fait naître la base depuis elle. Les
 * migrations sont tout de même relancées derrière — sur une base à jour c'est une
 * lecture du journal et rien d'autre, et c'est ce qui garantit qu'une archive périmée
 * serait rattrapée plutôt que silencieusement acceptée.
 *
 * L'ordre compte, et c'est la raison des imports DYNAMIQUES : `config.ts` lit
 * l'environnement au chargement du module et `db/index.ts` ouvre la connexion dans la
 * foulée. Poser `SPACESIM_DB` après un import statique n'aurait donc rien changé.
 */
const restored = existsSync(SCHEMA_SNAPSHOT);
if (restored) {
  process.env.SPACESIM_DB = `snapshot:${SCHEMA_SNAPSHOT}`;
}

const { config } = await import("./config.js");
const { db, runMigrations } = await import("./db/index.js");

// Les rejouer derrière une restauration ne servirait à rien : `test-global-setup.ts`
// reconstruit l'archive à CHAQUE exécution, à partir des migrations du moment — une
// archive périmée n'existe pas le temps d'une suite. Et ce rejeu n'était pas gratuit :
// il relit le journal et les trente fichiers SQL par fichier de test.
if (!restored) {
  await runMigrations(config.databaseUrl, db);
}
