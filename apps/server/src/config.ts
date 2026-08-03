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
  DATABASE_URL: z.string().min(1).optional(),
  SPACESIM_DB: z.string().min(1).optional(),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  LOG_LEVEL: z.string().min(1).default("warn"),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
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
  /** URL/chemin de connexion DB : `DATABASE_URL` (postgres://…) sinon `SPACESIM_DB` (chemin SQLite / ":memory:") sinon fichier par défaut. */
  databaseUrl: env.DATABASE_URL ?? env.SPACESIM_DB ?? "./spacesim-pgdata",
  nodeEnv: env.NODE_ENV,
  logLevel: env.LOG_LEVEL,
  corsOrigin: env.CORS_ORIGIN,
  rateLimitMax: env.RATE_LIMIT_MAX,
  /** Routes `/dev/*` : jamais en prod sauf override explicite (double verrou, chantier 20.5). */
  devRoutes: env.DEV_ROUTES === "1",
  /** Crée l'univers officiel au prochain boot prod — une bascule, jamais un défaut (chantier 20.4). */
  bootstrap: env.SPACESIM_BOOTSTRAP === "1",
} as const;

export type Config = typeof config;
