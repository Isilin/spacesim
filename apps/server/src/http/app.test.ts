import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "../db/index.js";
import { GameEngine } from "../game.js";
import { buildApp } from "./app.js";

/** Toutes les tables, vidées avant chaque test (même liste que game.test.ts, + comptes/sessions). */
const ALL_TABLES = [
  schema.transfers,
  schema.missions,
  schema.outposts,
  schema.routes,
  schema.colonies,
  schema.battles,
  schema.pirateLairs,
  schema.fleets,
  schema.contracts,
  schema.factionStates,
  schema.relations,
  schema.relationProposals,
  schema.objectives,
  schema.worldEvents,
  schema.blueprints,
  schema.gateways,
  schema.claims,
  schema.players,
  schema.stationStates,
  schema.games,
  schema.sessions,
  schema.accounts,
] as const;

async function resetDb(): Promise<void> {
  const names = ALL_TABLES.map((t) => sql`${t}`);
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
    const app = await buildApp(await GameEngine.loadOrBootstrap(), { devRoutes: false });
    const res = await app.inject({ method: "GET", url: "/dev/empires" });
    expect(res.statusCode).toBe(404);
  });

  it("les routes /dev/* répondent quand devRoutes est activé (défaut hors production)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const res = await app.inject({ method: "GET", url: "/dev/empires" });
    expect(res.statusCode).toBe(200);
  });
});
