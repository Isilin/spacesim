import { purgeExpiredSessions } from "./auth.js";
import { config } from "./config.js";
import { db, runMigrations } from "./db/index.js";
import { GameEngine } from "./game.js";
import { buildApp } from "./http/app.js";

// Migrations appliquées explicitement au tout début du boot (chantier 20.1) — plus
// un effet de bord de l'import de `db/index.ts`.
await runMigrations(config.databaseUrl, db);

const engine = await GameEngine.loadOrBootstrap();
// Population PNJ (chantier 14) : distinct de `load()`, idempotent — jamais doublé
// au redémarrage, backfillé si absent sur une partie créée avant ce chantier.
engine.ensureNpcPopulation();
engine.start();
await purgeExpiredSessions();

const app = await buildApp(engine);

await app.listen({ port: config.port, host: "127.0.0.1" });
console.log(
  `[server] http://127.0.0.1:${config.port} — partie ${engine.game.id} (seed ${engine.game.seed}), tick ${engine.game.tick}`,
);
