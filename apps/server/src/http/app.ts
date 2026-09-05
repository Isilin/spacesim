import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { config } from "../config.js";
import type { GameEngine } from "../game.js";
import { registerAdminRoutes } from "./routes/admin/index.js";
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
  // Jeton de session jamais journalisé, même par erreur (chantier 20.5).
  const app = Fastify({
    logger: { level: config.logLevel, redact: ["req.headers.authorization"] },
  });
  // En-têtes de sécurité (chantier 27.11). `styleSrc` élargi : apps/web et packages/ui
  // utilisent des `style={{...}}` inline (ex. point de couleur d'empire) — la CSP par
  // défaut de Helmet les bloquerait sinon. Risque accepté sciemment, pas un oubli.
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "style-src": ["'self'", "'unsafe-inline'"],
      },
    },
  });
  // Compression des trames : ESSAYÉE PUIS RETIRÉE (chantier 37.8).
  //
  // `ws` laisse `perMessageDeflate` désactivé par défaut, et le snapshot d'univers est du
  // JSON très répétitif : la mesure (`universe.payload.test.ts`) donne un facteur quatre.
  // Mais comprimer 270 Ko par joueur et par poussée coûte assez de latence pour qu'un
  // aller-retour WS dépasse cinq secondes — mesuré deux fois en A/B sur les specs à deux
  // sessions (`communication`, `corporation`), qui passent sans et échouent avec.
  //
  // Le bon levier n'est pas de comprimer un envoi trop gros, c'est de ne pas l'envoyer :
  // l'univers part en entier à chaque `hello` et à chaque changement d'exploration, sans
  // aucune pagination. À rouvrir si la mesure change, avec le même A/B pour juge.
  await app.register(websocket);
  await app.register(cors, { origin: config.corsOrigin });
  // Global généreux (config, défaut 100/min) ; `/auth/*` a sa propre limite plus stricte,
  // en plus (pas à la place) du blocage par IP déjà géré par `auth.ts` (isRateLimited).
  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: "1 minute",
  });
  // Validation/sérialisation des schémas Zod sur les routes qui déclarent params/
  // querystring/body en schéma (chantier 27.8) — remplace les casts `as` non validés sur
  // request.query/request.params. `withTypeProvider<ZodTypeProvider>()` s'appelle au
  // point d'enregistrement des routes typées, pas ici.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  // Spec OpenAPI pour usage interne (orval, 27.8b) — pas de @fastify/swagger-ui ni
  // d'exposition publique de /documentation : générer le spec pour du codegen interne
  // n'est pas la même décision que le publier (voir docs/adr si un consommateur externe
  // apparaît un jour).
  await app.register(swagger, {
    transform: jsonSchemaTransform,
    openapi: {
      openapi: "3.0.0",
      info: { title: "SpaceSim admin API", version: "0.1.0" },
    },
  });
  app.get("/documentation/json", () => app.swagger());

  // Le moteur journalise désormais via ce même logger (mêmes messages, même niveau).
  engine.setLogger(app.log);

  app.get("/health", () => ({ ok: true, tick: engine.game.tick }));

  registerAuthRoutes(app, engine);
  // Toujours actif, y compris en production — la protection est le rôle du compte (adminGuard),
  // pas l'environnement (contrairement à /dev/*).
  registerAdminRoutes(app, engine);
  // Triches de dev : jamais en production.
  if (opts.devRoutes ?? config.nodeEnv !== "production") {
    registerDevRoutes(app, engine);
  }
  registerWsRoutes(app, engine);

  return app;
}
