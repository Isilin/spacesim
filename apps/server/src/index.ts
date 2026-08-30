import { purgeExpiredSessions } from "./auth.js";
import { config } from "./config.js";
import { db, runMigrations } from "./db/index.js";
import { GameEngine } from "./game.js";
import { buildApp } from "./http/app.js";

// Migrations appliquées explicitement au tout début du boot (chantier 20.1) — plus
// un effet de bord de l'import de `db/index.ts`.
await runMigrations(config.databaseUrl, db);

/**
 * Boot prod : jamais de bootstrap implicite (chantier 20.4). `load()` lève sur une
 * base vierge — un serveur officiel mal configuré doit planter, pas repartir de
 * zéro. `SPACESIM_BOOTSTRAP=1` est le geste conscient, unique dans la vie du
 * serveur, qui crée l'univers officiel. Dev/tests gardent `loadOrBootstrap()`.
 */
const engine =
  config.nodeEnv === "production"
    ? config.bootstrap
      ? await GameEngine.bootstrapNewUniverse()
      : await GameEngine.load()
    : await GameEngine.loadOrBootstrap();
// Population PNJ (chantier 14) : distinct de `load()`, idempotent — jamais doublé
// au redémarrage, backfillé si absent sur une partie créée avant ce chantier.
engine.ensureNpcPopulation();
engine.start();
await purgeExpiredSessions();

const app = await buildApp(engine);

await app.listen({ port: config.port, host: config.host });
console.log(
  `[server] http://${config.host}:${config.port} — partie ${engine.game.id} (seed ${engine.game.seed}), tick ${engine.game.tick}`,
);
