import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  activeSessionCount,
  bearerToken,
  createSession,
  findOrCreateAccountByIdentity,
  hashPassword,
  login,
  normalizeEmail,
  purgeExpiredSessions,
  register,
  resolveSession,
  revokeAllSessions,
  revokeSession,
  SESSION_TTL_MS,
  verifyPassword,
} from "./auth.js";
import { db, schema } from "./db/index.js";

/** DB en mémoire (vitest.config.ts) : on repart de tables vides à chaque test. */
beforeEach(async () => {
  await db.delete(schema.sessions);
  await db.delete(schema.accountIdentities);
  await db.delete(schema.accounts);
});

describe("mots de passe", () => {
  it("hash puis vérifie, et rejette un mot de passe faux", () => {
    const stored = hashPassword("orbite-basse-42");
    expect(verifyPassword("orbite-basse-42", stored)).toBe(true);
    expect(verifyPassword("orbite-basse-43", stored)).toBe(false);
  });

  it("deux hash du même mot de passe diffèrent (sel aléatoire)", () => {
    expect(hashPassword("orbite-basse-42")).not.toBe(
      hashPassword("orbite-basse-42"),
    );
  });

  it("un hash mal formé est un échec, jamais une exception", () => {
    expect(verifyPassword("x", "")).toBe(false);
    expect(verifyPassword("x", "bcrypt$sel$hash")).toBe(false);
    expect(verifyPassword("x", "scrypt$sel-sans-hash")).toBe(false);
  });
});

describe("inscription", () => {
  it("crée un compte, ouvre une session, normalise l'e-mail", async () => {
    const result = await register("  Pilote@Exemple.FR ", "orbite-basse-42");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.account.email).toBe("pilote@exemple.fr");
    expect((await resolveSession(result.token))?.id).toBe(result.account.id);
    expect(result.expiresAt).toBeGreaterThan(Date.now());
  });

  it("refuse un e-mail invalide, un mot de passe trop court, un doublon", async () => {
    expect((await register("pas-un-email", "orbite-basse-42")).ok).toBe(false);
    expect((await register("pilote@exemple.fr", "court")).ok).toBe(false);
    expect((await register("pilote@exemple.fr", "orbite-basse-42")).ok).toBe(
      true,
    );
    const dup = await register("PILOTE@exemple.fr", "orbite-basse-42");
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error).toMatch(/existe déjà/);
  });
});

describe("connexion", () => {
  it("accepte les bons identifiants, quelle que soit la casse de l'e-mail", async () => {
    await register("pilote@exemple.fr", "orbite-basse-42");
    const result = await login("Pilote@Exemple.fr", "orbite-basse-42");
    expect(result.ok).toBe(true);
  });

  it("ne distingue pas e-mail inconnu et mot de passe faux", async () => {
    await register("pilote@exemple.fr", "orbite-basse-42");
    const wrongPassword = await login(
      "pilote@exemple.fr",
      "mauvais-mot-de-passe",
    );
    const unknownEmail = await login("inconnu@exemple.fr", "orbite-basse-42");
    expect(wrongPassword.ok).toBe(false);
    expect(unknownEmail.ok).toBe(false);
    if (!wrongPassword.ok && !unknownEmail.ok) {
      expect(wrongPassword.error).toBe(unknownEmail.error);
    }
  });

  it("une seconde connexion ouvre une session supplémentaire", async () => {
    const first = await register("pilote@exemple.fr", "orbite-basse-42");
    if (!first.ok) throw new Error("inscription échouée");
    await login("pilote@exemple.fr", "orbite-basse-42");
    expect(await activeSessionCount(first.account.id)).toBe(2);
  });
});

describe("sessions", () => {
  it("un jeton absent ou inconnu ne résout rien", async () => {
    expect(await resolveSession(undefined)).toBeNull();
    expect(await resolveSession("jeton-inventé")).toBeNull();
  });

  it("une session révoquée ne résout plus", async () => {
    const result = await register("pilote@exemple.fr", "orbite-basse-42");
    if (!result.ok) throw new Error("inscription échouée");
    await revokeSession(result.token);
    expect(await resolveSession(result.token)).toBeNull();
  });

  it("une session expirée ne résout plus et sa ligne est purgée", async () => {
    const result = await register("pilote@exemple.fr", "orbite-basse-42");
    if (!result.ok) throw new Error("inscription échouée");
    const expired = await createSession(
      result.account.id,
      Date.now() - SESSION_TTL_MS - 1000,
    );
    expect(await resolveSession(expired.token)).toBeNull();
    const remaining = await db.select().from(schema.sessions);
    expect(remaining.some((s) => s.token === expired.token)).toBe(false);
  });

  it("le TTL glissant repousse l'expiration d'une session bientôt périmée", async () => {
    const result = await register("pilote@exemple.fr", "orbite-basse-42");
    if (!result.ok) throw new Error("inscription échouée");
    // Session ouverte il y a 29 jours : elle vaut encore, mais son TTL doit repartir.
    const old = await createSession(
      result.account.id,
      Date.now() - SESSION_TTL_MS + 24 * 3600 * 1000,
    );
    const before = (await db.select().from(schema.sessions)).find(
      (s) => s.token === old.token,
    )!;
    expect((await resolveSession(old.token))?.id).toBe(result.account.id);
    const after = (await db.select().from(schema.sessions)).find(
      (s) => s.token === old.token,
    )!;
    expect(after.expiresAt).toBeGreaterThan(before.expiresAt);
  });

  it("purgeExpiredSessions ne supprime que les sessions périmées", async () => {
    const result = await register("pilote@exemple.fr", "orbite-basse-42");
    if (!result.ok) throw new Error("inscription échouée");
    await createSession(result.account.id, Date.now() - SESSION_TTL_MS - 1000);
    expect(await db.select().from(schema.sessions)).toHaveLength(2);
    await purgeExpiredSessions();
    const remaining = await db.select().from(schema.sessions);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.token).toBe(result.token);
  });

  it("revokeAllSessions ferme toutes les sessions du compte", async () => {
    const result = await register("pilote@exemple.fr", "orbite-basse-42");
    if (!result.ok) throw new Error("inscription échouée");
    await login("pilote@exemple.fr", "orbite-basse-42");
    await revokeAllSessions(result.account.id);
    expect(await activeSessionCount(result.account.id)).toBe(0);
  });
});

describe("utilitaires", () => {
  it("bearerToken lit l'en-tête Authorization, insensible à la casse du schéma", () => {
    expect(bearerToken("Bearer abc")).toBe("abc");
    expect(bearerToken("bearer abc")).toBe("abc");
    expect(bearerToken("Basic abc")).toBeUndefined();
    expect(bearerToken(undefined)).toBeUndefined();
    expect(bearerToken("Bearer")).toBeUndefined();
  });

  it("normalizeEmail met en minuscules et retire les espaces", () => {
    expect(normalizeEmail("  Pilote@Exemple.FR  ")).toBe("pilote@exemple.fr");
  });
});

describe("identités SSO (chantier 27.9 — fondation, pas de vrai câblage OAuth)", () => {
  it("crée un compte sans mot de passe à la première connexion par un fournisseur", async () => {
    const account = await findOrCreateAccountByIdentity({
      provider: "faux-fournisseur",
      providerUserId: "ext-123",
      email: "pilote@exemple.fr",
    });
    expect(account.email).toBe("pilote@exemple.fr");
    expect(account.role).toBe("player");

    const rows = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, account.id));
    expect(rows[0]!.passwordHash).toBeNull();

    const identities = await db
      .select()
      .from(schema.accountIdentities)
      .where(eq(schema.accountIdentities.accountId, account.id));
    expect(identities).toHaveLength(1);
    expect(identities[0]!.provider).toBe("faux-fournisseur");
    expect(identities[0]!.providerUserId).toBe("ext-123");
  });

  it("retrouve le même compte à une connexion suivante par la même identité", async () => {
    const first = await findOrCreateAccountByIdentity({
      provider: "faux-fournisseur",
      providerUserId: "ext-123",
      email: "pilote@exemple.fr",
    });
    const second = await findOrCreateAccountByIdentity({
      provider: "faux-fournisseur",
      providerUserId: "ext-123",
      email: "pilote@exemple.fr",
    });
    expect(second.id).toBe(first.id);
    expect(await db.select().from(schema.accounts)).toHaveLength(1);
  });

  it("un compte SSO-seul ne peut pas se connecter par mot de passe (pas d'énumération)", async () => {
    await findOrCreateAccountByIdentity({
      provider: "faux-fournisseur",
      providerUserId: "ext-123",
      email: "pilote@exemple.fr",
    });
    const res = await login("pilote@exemple.fr", "un-mot-de-passe-quelconque");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("Identifiants incorrects");
  });

  it("deux fournisseurs différents pour le même providerUserId créent deux comptes distincts", async () => {
    const a = await findOrCreateAccountByIdentity({
      provider: "google",
      providerUserId: "ext-123",
      email: "a@exemple.fr",
    });
    const b = await findOrCreateAccountByIdentity({
      provider: "discord",
      providerUserId: "ext-123",
      email: "b@exemple.fr",
    });
    expect(a.id).not.toBe(b.id);
  });
});
