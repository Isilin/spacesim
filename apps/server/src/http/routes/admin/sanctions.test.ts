import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "../../../db/index.js";
import { GameEngine } from "../../../game.js";
import { buildApp } from "../../app.js";
import { registerTestAccount, setTestRole } from "./test-helpers.js";

beforeEach(async () => {
  await db.delete(schema.adminAuditLog);
  await db.delete(schema.accountSanctions);
  await db.delete(schema.sessions);
  await db.delete(schema.accounts);
});

async function sanction(
  app: Awaited<ReturnType<typeof buildApp>>,
  adminToken: string,
  accountId: string,
  body: Record<string, unknown>,
) {
  return app.inject({
    method: "POST",
    url: `/api/admin/accounts/${accountId}/sanctions`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: body,
  });
}

describe("/api/admin/accounts/:id/sanctions", () => {
  it("un compte joueur ne peut pas sanctionner (403)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token: playerToken } = await registerTestAccount(app, "joueur@exemple.fr");
    const { accountId: targetId } = await registerTestAccount(app, "cible@exemple.fr");
    const res = await sanction(app, playerToken, targetId, { kind: "warn", reason: "test" });
    expect(res.statusCode).toBe(403);
  });

  it("un id de compte inconnu renvoie 404", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "mod@exemple.fr");
    await setTestRole(accountId, "moderator");
    const res = await sanction(app, token, "id-inconnu", { kind: "warn", reason: "test" });
    expect(res.statusCode).toBe(404);
  });

  it("une raison vide est refusée (400)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "mod@exemple.fr");
    await setTestRole(accountId, "moderator");
    const { accountId: targetId } = await registerTestAccount(app, "cible@exemple.fr");
    const res = await sanction(app, token, targetId, { kind: "warn", reason: "" });
    expect(res.statusCode).toBe(400);
  });

  it("une suspension sans durationMs est refusée (400)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "mod@exemple.fr");
    await setTestRole(accountId, "moderator");
    const { accountId: targetId } = await registerTestAccount(app, "cible@exemple.fr");
    const res = await sanction(app, token, targetId, { kind: "suspend", reason: "spam" });
    expect(res.statusCode).toBe(400);
  });

  it("un avertissement journalise mais ne bloque pas la connexion", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "mod@exemple.fr");
    await setTestRole(accountId, "moderator");
    const { accountId: targetId } = await registerTestAccount(app, "cible@exemple.fr");
    const res = await sanction(app, token, targetId, {
      kind: "warn",
      reason: "comportement limite",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.sanctionStatus.active).toBe(false);
    expect(body.sanctionHistory).toHaveLength(1);

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "cible@exemple.fr", password: "orbite-basse-42" },
    });
    expect(login.statusCode).toBe(200);
  });

  it("un ban journalise, déconnecte, et bloque la connexion avec un message explicite", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "mod@exemple.fr");
    await setTestRole(accountId, "moderator");
    const { accountId: targetId } = await registerTestAccount(app, "cible@exemple.fr");

    const res = await sanction(app, token, targetId, { kind: "ban", reason: "triche avérée" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.sanctionStatus).toEqual({
      active: true,
      kind: "ban",
      reason: "triche avérée",
      expiresAt: null,
    });
    expect(body.activeSessions).toBe(0);

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "cible@exemple.fr", password: "orbite-basse-42" },
    });
    expect(login.statusCode).toBe(401);
    expect(login.json().error).toMatch(/banni.*triche avérée/);
  });

  it("une suspension expire d'elle-même : bloque puis autorise à nouveau après l'échéance", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "mod@exemple.fr");
    await setTestRole(accountId, "moderator");
    const { accountId: targetId } = await registerTestAccount(app, "cible@exemple.fr");

    const res = await sanction(app, token, targetId, {
      kind: "suspend",
      reason: "chat toxique",
      durationMs: 50,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().sanctionStatus.kind).toBe("suspend");

    const blocked = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "cible@exemple.fr", password: "orbite-basse-42" },
    });
    expect(blocked.statusCode).toBe(401);

    await new Promise((resolve) => setTimeout(resolve, 100));
    const allowed = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "cible@exemple.fr", password: "orbite-basse-42" },
    });
    expect(allowed.statusCode).toBe(200);
  });

  it("unban lève un ban : la connexion redevient possible", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "mod@exemple.fr");
    await setTestRole(accountId, "moderator");
    const { accountId: targetId } = await registerTestAccount(app, "cible@exemple.fr");

    await sanction(app, token, targetId, { kind: "ban", reason: "erreur de modération" });
    const unban = await sanction(app, token, targetId, { kind: "unban", reason: "levée d'erreur" });
    expect(unban.json().sanctionStatus.active).toBe(false);

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "cible@exemple.fr", password: "orbite-basse-42" },
    });
    expect(login.statusCode).toBe(200);
  });

  it("force_logout révoque les sessions sans changer le statut de sanction", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "mod@exemple.fr");
    await setTestRole(accountId, "moderator");
    const { accountId: targetId } = await registerTestAccount(app, "cible@exemple.fr");

    const res = await sanction(app, token, targetId, {
      kind: "force_logout",
      reason: "changement de mot de passe suspecté compromis",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.sanctionStatus.active).toBe(false);
    expect(body.activeSessions).toBe(0);
  });

  it("chaque sanction est journalisée dans le journal d'audit", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "mod@exemple.fr");
    await setTestRole(accountId, "moderator");
    const { accountId: targetId } = await registerTestAccount(app, "cible@exemple.fr");

    await sanction(app, token, targetId, { kind: "warn", reason: "premier avertissement" });

    // Le journal d'audit lui-même n'est lisible que par "admin" (moderator ne l'a pas) —
    // second compte pour cette seule vérification.
    const { token: adminToken, accountId: adminId } = await registerTestAccount(
      app,
      "admin@exemple.fr",
    );
    await setTestRole(adminId, "admin");
    const audit = await app.inject({
      method: "GET",
      url: "/api/admin/audit",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const entries = audit.json().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: "account.warn",
      targetType: "account",
      targetId,
      reason: "premier avertissement",
      actorEmail: "mod@exemple.fr",
    });
  });
});
