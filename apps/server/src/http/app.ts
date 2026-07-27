import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import { config } from "../config.js";
import type { GameEngine } from "../game.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerDevRoutes } from "./routes/dev.js";
import { registerWsRoutes } from "./routes/ws.js";

export interface BuildAppOptions {
  /** Enregistre les routes `/dev/*`. Défaut : `NODE_ENV !== "production"`. */
  devRoutes?: boolean;
}

/** Assemble l'instance Fastify (routes + WS) sans écouter — le boot appelle `listen` séparément. */
export async function buildApp(
  engine: GameEngine,
  opts: BuildAppOptions = {},
): Promise<FastifyInstance> {
  // Niveau par défaut inchangé (warn) ; LOG_LEVEL permet de le baisser en dev sans redéploiement.
  const app = Fastify({ logger: { level: config.logLevel } });
  await app.register(websocket);
  // Le moteur journalise désormais via ce même logger (mêmes messages, même niveau).
  engine.setLogger(app.log);

  app.get("/health", () => ({ ok: true, tick: engine.game.tick }));

  registerAuthRoutes(app, engine);
  // Triches de dev : jamais en production.
  if (opts.devRoutes ?? config.nodeEnv !== "production") {
    registerDevRoutes(app, engine);
  }
  registerWsRoutes(app, engine);

  return app;
}
