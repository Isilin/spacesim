import type { RoleId } from "@spacesim/protocol";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db, schema } from "../../../db/index.js";

/** Inscrit un compte de test (via l'API HTTP réelle) et renvoie son jeton + son id. */
export async function registerTestAccount(
  app: FastifyInstance,
  email: string,
): Promise<{ token: string; accountId: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "orbite-basse-42" },
  });
  const { token } = res.json();
  const accounts = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.email, email));
  return { token, accountId: accounts[0]!.id };
}

/** Promeut un compte de test à un rôle donné — geste manuel documenté (chantier 23.1). */
export async function setTestRole(
  accountId: string,
  role: RoleId,
): Promise<void> {
  await db
    .update(schema.accounts)
    .set({ role })
    .where(eq(schema.accounts.id, accountId));
}
