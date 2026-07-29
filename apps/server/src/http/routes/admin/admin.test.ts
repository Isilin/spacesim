import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "../../../db/index.js";
import { GameEngine } from "../../../game.js";
import { buildApp } from "../../app.js";

beforeEach(async () => {
  await db.delete(schema.adminAuditLog);
  await db.delete(schema.sessions);
  await db.delete(schema.accounts);
});

/** Inscrit un compte et renvoie son jeton de session + son id. */
async function registerAccount(
  app: Awaited<ReturnType<typeof buildApp>>,
  email: string,
): Promise<{ token: string; accountId: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "orbite-basse-42" },
  });
  const { token } = res.json();
  const accounts = await db.select().from(schema.accounts).where(eq(schema.accounts.email, email));
  return { token, accountId: accounts[0]!.id };
}

describe("/api/admin", () => {
  it("refuse sans session (401)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const res = await app.inject({ method: "GET", url: "/api/admin/audit" });
    expect(res.statusCode).toBe(401);
  });

  it("refuse un compte joueur ordinaire (403)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token } = await registerAccount(app, "pilote@exemple.fr");
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/audit",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("laisse passer un compte admin (200) et renvoie le journal", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerAccount(app, "admin@exemple.fr");
    await db
      .update(schema.accounts)
      .set({ role: "admin" })
      .where(eq(schema.accounts.id, accountId));
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
    const { token, accountId } = await registerAccount(app, "mod@exemple.fr");
    await db
      .update(schema.accounts)
      .set({ role: "moderator" })
      .where(eq(schema.accounts.id, accountId));
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/audit",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
