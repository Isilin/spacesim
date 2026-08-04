import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "../db/index.js";
import { GameEngine } from "../game.js";
import { ALL_TABLES } from "../test-harness.js";
import { buildApp } from "./app.js";

/** Même liste que test-harness.ts (univers + entités de partie), + comptes/sessions. */
const TABLES = [...ALL_TABLES, schema.sessions, schema.accounts] as const;

async function resetDb(): Promise<void> {
  const names = TABLES.map((t) => sql`${t}`);
  await db.execute(sql`TRUNCATE TABLE ${sql.join(names, sql`, `)} CASCADE`);
}

beforeEach(() => resetDb());

describe("buildApp — routes HTTP", () => {
  it("GET /health renvoie le tick courant", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, tick: 0 });
  });

  it("GET /documentation/json expose un spec OpenAPI valide (chantier 27.8, usage interne orval)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const res = await app.inject({ method: "GET", url: "/documentation/json" });
    expect(res.statusCode).toBe(200);
    const spec = res.json();
    expect(spec.openapi).toBe("3.0.0");
    expect(spec.paths["/api/admin/content/warships/{id}"].put).toBeDefined();
  });

  describe("/auth/register", () => {
    it("refuse un e-mail invalide", async () => {
      const app = await buildApp(await GameEngine.loadOrBootstrap());
      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email: "pas-un-email", password: "orbite-basse-42" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("refuse un mot de passe trop court", async () => {
      const app = await buildApp(await GameEngine.loadOrBootstrap());
      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email: "pilote@exemple.fr", password: "court" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("crée le compte et son empire", async () => {
      const app = await buildApp(await GameEngine.loadOrBootstrap());
      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email: "pilote@exemple.fr", password: "orbite-basse-42" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.token).toBeTypeOf("string");
      expect(body.empire).not.toBeNull();
    });
  });

  it("POST /auth/login refuse des identifiants inconnus", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "inconnu@exemple.fr", password: "orbite-basse-42" },
    });
    expect(res.statusCode).toBe(401);
  });

  describe("/auth/me", () => {
    it("refuse sans jeton", async () => {
      const app = await buildApp(await GameEngine.loadOrBootstrap());
      const res = await app.inject({ method: "GET", url: "/auth/me" });
      expect(res.statusCode).toBe(401);
    });

    it("répond avec le compte et l'empire une fois le jeton fourni", async () => {
      const app = await buildApp(await GameEngine.loadOrBootstrap());
      const registered = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email: "pilote@exemple.fr", password: "orbite-basse-42" },
      });
      const { token } = registered.json();
      const res = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().email).toBe("pilote@exemple.fr");
    });
  });

  it("les routes /dev/* sont absentes quand devRoutes est désactivé", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap(), {
      devRoutes: false,
    });
    const res = await app.inject({ method: "GET", url: "/dev/empires" });
    expect(res.statusCode).toBe(404);
  });

  it("les routes /dev/* répondent quand devRoutes est activé (défaut hors production)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const res = await app.inject({ method: "GET", url: "/dev/empires" });
    expect(res.statusCode).toBe(200);
  });

  it("CORS : l'origine configurée reçoit l'en-tête d'autorisation (chantier 20.5)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "http://localhost:5173" },
    });
    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
  });

  it("rate-limit : /auth/login renvoie 429 au-delà du quota strict (chantier 20.5)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const attempt = () =>
      app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "inconnu@exemple.fr", password: "x" },
      });
    // La 1re tentative échoue (401) sans être bloquée par `isRateLimited` (compte inconnu,
    // pas de compteur d'échecs par IP encore atteint) — seul le quota strict compte ici.
    let last = await attempt();
    for (let i = 1; i < 12; i++) last = await attempt();
    expect(last.statusCode).toBe(429);
  });

  it("Helmet : en-têtes de sécurité présents, CSP autorise les styles inline (chantier 27.11)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.headers["x-frame-options"]).toBeDefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toContain(
      "style-src 'self' 'unsafe-inline'",
    );
  });
});
