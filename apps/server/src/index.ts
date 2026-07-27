import { purgeExpiredSessions } from "./auth.js";
import { GameEngine } from "./game.js";
import { buildApp } from "./http/app.js";

const PORT = Number(process.env.PORT ?? 3001);

const engine = GameEngine.loadOrBootstrap();
// Population PNJ (chantier 14) : distinct de `load()`, idempotent — jamais doublé
// au redémarrage, backfillé si absent sur une partie créée avant ce chantier.
engine.ensureNpcPopulation();
engine.start();
purgeExpiredSessions();

const app = await buildApp(engine);

await app.listen({ port: PORT, host: "127.0.0.1" });
console.log(
  `[server] http://127.0.0.1:${PORT} — partie ${engine.game.id} (seed ${engine.game.seed}), tick ${engine.game.tick}`,
);
