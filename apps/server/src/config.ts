import { z } from "zod";

/**
 * Schéma de validation d'environnement (chantier 20.1). Parsé une fois au premier
 * import de ce module — erreurs lisibles immédiatement plutôt que des `undefined`
 * silencieux qui remontent en runtime. `DATABASE_URL` remplace `SPACESIM_DB` mais
 * l'ancien nom reste lu en repli (compat dev/tests existants, `vitest.config.ts`
 * et `playwright.config.ts` posent encore `SPACESIM_DB`).
 */
const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  /** Interface de bind : loopback par défaut, "0.0.0.0" en conteneur (docker-compose). */
  HOST: z.string().min(1).default("127.0.0.1"),
  DATABASE_URL: z.string().min(1).optional(),
  SPACESIM_DB: z.string().min(1).optional(),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  LOG_LEVEL: z.string().min(1).default("warn"),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  /**
   * Quota des routes d'authentification, par IP et par minute (chantier 20.5). Défaut
   * volontairement bas : c'est une protection contre l'énumération de comptes.
   *
   * Configurable depuis le chantier 32.17 pour le seul harnais e2e, où une dizaine
   * d'inscriptions partent de la même boucle locale en moins d'une minute. Relever la
   * valeur en production annulerait la protection ; l'e2e la pose explicitement dans son
   * `webServer`.
   */
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  // Chaîne plutôt que boolean : les variables d'env sont toujours des chaînes,
  // `z.coerce.boolean()` traiterait "0" comme vrai (chaîne non vide).
  DEV_ROUTES: z.enum(["0", "1"]).optional(),
  /** Geste explicite pour créer l'univers officiel EN PRODUCTION (chantier 20.4). */
  SPACESIM_BOOTSTRAP: z.enum(["0", "1"]).optional(),
});

function parseEnv() {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const details = result.error.issues
      .map(
        (issue) =>
          `  - ${issue.path.join(".") || "(racine)"}: ${issue.message}`,
      )
      .join("\n");
    throw new Error(`Configuration d'environnement invalide :\n${details}`);
  }
  return result.data;
}

const env = parseEnv();

export const config = {
  port: env.PORT,
  host: env.HOST,
  /** URL/chemin de connexion DB : `DATABASE_URL` (postgres://…) sinon `SPACESIM_DB` (chemin SQLite / ":memory:") sinon fichier par défaut. */
  databaseUrl: env.DATABASE_URL ?? env.SPACESIM_DB ?? "./spacesim-pgdata",
  nodeEnv: env.NODE_ENV,
  logLevel: env.LOG_LEVEL,
  corsOrigin: env.CORS_ORIGIN,
  rateLimitMax: env.RATE_LIMIT_MAX,
  authRateLimitMax: env.AUTH_RATE_LIMIT_MAX,
  /** Routes `/dev/*` : jamais en prod sauf override explicite (double verrou, chantier 20.5). */
  devRoutes: env.DEV_ROUTES === "1",
  /** Crée l'univers officiel au prochain boot prod — une bascule, jamais un défaut (chantier 20.4). */
  bootstrap: env.SPACESIM_BOOTSTRAP === "1",
} as const;

export type Config = typeof config;
