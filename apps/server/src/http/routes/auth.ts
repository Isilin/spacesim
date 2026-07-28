import type { FastifyInstance } from "fastify";
import {
  bearerToken,
  login,
  register,
  resolveSession,
  revokeSession,
  type AuthResult,
} from "../../auth.js";
import type { GameEngine } from "../../game.js";

/** Corps de réponse commun à l'inscription et à la connexion. */
function authPayload(engine: GameEngine, result: Extract<AuthResult, { ok: true }>) {
  const empire = engine.empireForAccount(result.account.id);
  return {
    token: result.token,
    expiresAt: result.expiresAt,
    email: result.account.email,
    empire: empire ? { id: empire.id, name: empire.name, color: empire.color } : null,
  };
}

// ── Comptes (chantier 8) ─────────────────────────────────────────────────────
export function registerAuthRoutes(app: FastifyInstance, engine: GameEngine): void {
  app.post("/auth/register", async (request, reply) => {
    const { email, password, empireName } = (request.body ?? {}) as {
      email?: string;
      password?: string;
      empireName?: string;
    };
    const result = await register(email ?? "", password ?? "", request.ip);
    if (!result.ok) return reply.code(400).send({ error: result.error });
    // L'empire naît avec le compte : une inscription = un empire dans l'univers partagé.
    if (!engine.createEmpireForAccount(result.account.id, empireName)) {
      return reply.code(503).send({ error: "Univers plein — aucune planète d'accueil disponible" });
    }
    return authPayload(engine, result);
  });

  app.post("/auth/login", async (request, reply) => {
    const { email, password } = (request.body ?? {}) as { email?: string; password?: string };
    const result = await login(email ?? "", password ?? "", request.ip);
    if (!result.ok) return reply.code(401).send({ error: result.error });
    // Compte sans empire (partie réinitialisée sous lui) : on lui en refait un.
    if (!engine.empireForAccount(result.account.id)) {
      engine.createEmpireForAccount(result.account.id);
    }
    return authPayload(engine, result);
  });

  app.post("/auth/logout", async (request) => {
    const token = bearerToken(request.headers.authorization);
    if (token) await revokeSession(token);
    return { ok: true };
  });

  app.get("/auth/me", async (request, reply) => {
    const account = await resolveSession(bearerToken(request.headers.authorization));
    if (!account) return reply.code(401).send({ error: "Session expirée" });
    const empire = engine.empireForAccount(account.id);
    return {
      email: account.email,
      empire: empire ? { id: empire.id, name: empire.name, color: empire.color } : null,
    };
  });
}
