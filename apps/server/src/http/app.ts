import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
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
  const app = Fastify({ logger: { level: "warn" } });
  await app.register(websocket);

  app.get("/health", () => ({ ok: true, tick: engine.game.tick }));

  registerAuthRoutes(app, engine);
  // Triches de dev : jamais en production.
  if (opts.devRoutes ?? process.env.NODE_ENV !== "production") {
    registerDevRoutes(app, engine);
  }
  registerWsRoutes(app, engine);

  return app;
}
