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

describe("/api/admin/accounts", () => {
  it("un compte joueur ne peut pas lister les comptes (403)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token } = await registerTestAccount(app, "pilote@exemple.fr");
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/accounts",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("un moderator liste les comptes inscrits, avec leur empire", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "mod@exemple.fr");
    await setTestRole(accountId, "moderator");
    await registerTestAccount(app, "pilote@exemple.fr");
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/accounts",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(2);
    const pilote = body.accounts.find((a: { email: string }) => a.email === "pilote@exemple.fr");
    expect(pilote.role).toBe("player");
    expect(pilote.empire).not.toBeNull();
  });

  it("la recherche filtre par sous-chaîne d'e-mail", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "admin@exemple.fr");
    await setTestRole(accountId, "admin");
    await registerTestAccount(app, "alice@exemple.fr");
    await registerTestAccount(app, "bob@exemple.fr");
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/accounts?query=alice",
      headers: { authorization: `Bearer ${token}` },
    });
    const body = res.json();
    expect(body.total).toBe(1);
    expect(body.accounts[0].email).toBe("alice@exemple.fr");
  });

  it("le détail d'un compte inclut le résumé de son empire", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "admin@exemple.fr");
    await setTestRole(accountId, "admin");
    const { accountId: pilotId } = await registerTestAccount(app, "pilote@exemple.fr");
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/accounts/${pilotId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.email).toBe("pilote@exemple.fr");
    expect(body.activeSessions).toBe(1);
    expect(body.empireSummary).not.toBeNull();
    expect(body.empireSummary.colonies).toHaveLength(1);
  });

  it("un id de compte inconnu renvoie 404", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "admin@exemple.fr");
    await setTestRole(accountId, "admin");
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/accounts/id-inconnu",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
