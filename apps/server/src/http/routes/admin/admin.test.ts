import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "../../../db/index.js";
import { GameEngine } from "../../../game.js";
import { buildApp } from "../../app.js";
import { registerTestAccount, setTestRole } from "./test-helpers.js";

beforeEach(async () => {
  await db.delete(schema.adminAuditLog);
  await db.delete(schema.sessions);
  await db.delete(schema.accounts);
});

describe("/api/admin", () => {
  it("refuse sans session (401)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const res = await app.inject({ method: "GET", url: "/api/admin/audit" });
    expect(res.statusCode).toBe(401);
  });

  it("refuse un compte joueur ordinaire (403)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token } = await registerTestAccount(app, "pilote@exemple.fr");
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/audit",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("laisse passer un compte admin (200) et renvoie le journal", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(
      app,
      "admin@exemple.fr",
    );
    await setTestRole(accountId, "admin");
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/audit",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ entries: [] });
  });

  it("un rôle sans permission déclarée sur cette action reste refusé (moderator, 403)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(
      app,
      "mod@exemple.fr",
    );
    await setTestRole(accountId, "moderator");
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/audit",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("/api/admin/ops (chantier 23.12)", () => {
  it("un compte admin voit la santé du moteur", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(
      app,
      "admin@exemple.fr",
    );
    await setTestRole(accountId, "admin");
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/ops/health",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tick).toBeGreaterThanOrEqual(0);
    expect(body.maxGalaxies).toBeGreaterThan(0);
    expect(body.frontierGalaxies).toBeGreaterThan(0);
  });

  it("un compte admin liste les empires", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(
      app,
      "admin@exemple.fr",
    );
    await setTestRole(accountId, "admin");
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/ops/empires",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().empires)).toBe(true);
  });

  it("un moderator n'a pas accès aux ops (403)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(
      app,
      "mod@exemple.fr",
    );
    await setTestRole(accountId, "moderator");
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/ops/health",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("un compte joueur n'a pas accès aux ops (403)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token } = await registerTestAccount(app, "joueur@exemple.fr");
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/ops/empires",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
