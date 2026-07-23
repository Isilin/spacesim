import { beforeEach, describe, expect, it } from "vitest";
import {
  activeSessionCount,
  bearerToken,
  createSession,
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
beforeEach(() => {
  db.delete(schema.sessions).run();
  db.delete(schema.accounts).run();
});

describe("mots de passe", () => {
  it("hash puis vérifie, et rejette un mot de passe faux", () => {
    const stored = hashPassword("orbite-basse-42");
    expect(verifyPassword("orbite-basse-42", stored)).toBe(true);
    expect(verifyPassword("orbite-basse-43", stored)).toBe(false);
  });

  it("deux hash du même mot de passe diffèrent (sel aléatoire)", () => {
    expect(hashPassword("orbite-basse-42")).not.toBe(hashPassword("orbite-basse-42"));
  });

  it("un hash mal formé est un échec, jamais une exception", () => {
    expect(verifyPassword("x", "")).toBe(false);
    expect(verifyPassword("x", "bcrypt$sel$hash")).toBe(false);
    expect(verifyPassword("x", "scrypt$sel-sans-hash")).toBe(false);
  });
});

describe("inscription", () => {
  it("crée un compte, ouvre une session, normalise l'e-mail", () => {
    const result = register("  Pilote@Exemple.FR ", "orbite-basse-42");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.account.email).toBe("pilote@exemple.fr");
    expect(resolveSession(result.token)?.id).toBe(result.account.id);
    expect(result.expiresAt).toBeGreaterThan(Date.now());
  });

  it("refuse un e-mail invalide, un mot de passe trop court, un doublon", () => {
    expect(register("pas-un-email", "orbite-basse-42").ok).toBe(false);
    expect(register("pilote@exemple.fr", "court").ok).toBe(false);
    expect(register("pilote@exemple.fr", "orbite-basse-42").ok).toBe(true);
    const dup = register("PILOTE@exemple.fr", "orbite-basse-42");
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error).toMatch(/existe déjà/);
  });
});

describe("connexion", () => {
  it("accepte les bons identifiants, quelle que soit la casse de l'e-mail", () => {
    register("pilote@exemple.fr", "orbite-basse-42");
    const result = login("Pilote@Exemple.fr", "orbite-basse-42");
    expect(result.ok).toBe(true);
  });

  it("ne distingue pas e-mail inconnu et mot de passe faux", () => {
    register("pilote@exemple.fr", "orbite-basse-42");
    const wrongPassword = login("pilote@exemple.fr", "mauvais-mot-de-passe");
    const unknownEmail = login("inconnu@exemple.fr", "orbite-basse-42");
    expect(wrongPassword.ok).toBe(false);
    expect(unknownEmail.ok).toBe(false);
    if (!wrongPassword.ok && !unknownEmail.ok) {
      expect(wrongPassword.error).toBe(unknownEmail.error);
    }
  });

  it("une seconde connexion ouvre une session supplémentaire", () => {
    const first = register("pilote@exemple.fr", "orbite-basse-42");
    if (!first.ok) throw new Error("inscription échouée");
    login("pilote@exemple.fr", "orbite-basse-42");
    expect(activeSessionCount(first.account.id)).toBe(2);
  });
});

describe("sessions", () => {
  it("un jeton absent ou inconnu ne résout rien", () => {
    expect(resolveSession(undefined)).toBeNull();
    expect(resolveSession("jeton-inventé")).toBeNull();
  });

  it("une session révoquée ne résout plus", () => {
    const result = register("pilote@exemple.fr", "orbite-basse-42");
    if (!result.ok) throw new Error("inscription échouée");
    revokeSession(result.token);
    expect(resolveSession(result.token)).toBeNull();
  });

  it("une session expirée ne résout plus et sa ligne est purgée", () => {
    const result = register("pilote@exemple.fr", "orbite-basse-42");
    if (!result.ok) throw new Error("inscription échouée");
    const expired = createSession(result.account.id, Date.now() - SESSION_TTL_MS - 1000);
    expect(resolveSession(expired.token)).toBeNull();
    expect(
      db.select().from(schema.sessions).all().some((s) => s.token === expired.token),
    ).toBe(false);
  });

  it("le TTL glissant repousse l'expiration d'une session bientôt périmée", () => {
    const result = register("pilote@exemple.fr", "orbite-basse-42");
    if (!result.ok) throw new Error("inscription échouée");
    // Session ouverte il y a 29 jours : elle vaut encore, mais son TTL doit repartir.
    const old = createSession(result.account.id, Date.now() - SESSION_TTL_MS + 24 * 3600 * 1000);
    const before = db.select().from(schema.sessions).all().find((s) => s.token === old.token)!;
    expect(resolveSession(old.token)?.id).toBe(result.account.id);
    const after = db.select().from(schema.sessions).all().find((s) => s.token === old.token)!;
    expect(after.expiresAt).toBeGreaterThan(before.expiresAt);
  });

  it("purgeExpiredSessions ne supprime que les sessions périmées", () => {
    const result = register("pilote@exemple.fr", "orbite-basse-42");
    if (!result.ok) throw new Error("inscription échouée");
    createSession(result.account.id, Date.now() - SESSION_TTL_MS - 1000);
    expect(db.select().from(schema.sessions).all()).toHaveLength(2);
    purgeExpiredSessions();
    const remaining = db.select().from(schema.sessions).all();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.token).toBe(result.token);
  });

  it("revokeAllSessions ferme toutes les sessions du compte", () => {
    const result = register("pilote@exemple.fr", "orbite-basse-42");
    if (!result.ok) throw new Error("inscription échouée");
    login("pilote@exemple.fr", "orbite-basse-42");
    revokeAllSessions(result.account.id);
    expect(activeSessionCount(result.account.id)).toBe(0);
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
