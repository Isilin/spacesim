import { emailSchema, passwordSchema } from "@spacesim/protocol";
import { eq, lt } from "drizzle-orm";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { db, schema } from "./db/index.js";

/** Durée de vie d'une session, en ms (glissante : prolongée à chaque usage). */
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

/** La session n'est prolongée en DB que si elle a perdu plus d'un jour de validité. */
const SESSION_REFRESH_MS = 24 * 3600 * 1000;

/** Paramètres scrypt : coût mémoire/CPU volontairement élevé côté serveur. */
const SCRYPT_N = 16384;
const SCRYPT_KEYLEN = 64;

/** Anti-force brute : N échecs par IP sur une fenêtre glissante. */
const MAX_FAILED_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

export interface Account {
  id: string;
  email: string;
}

/** Résultat d'une opération d'authentification : succès porteur de session, ou erreur en français. */
export type AuthResult =
  | { ok: true; account: Account; token: string; expiresAt: number }
  | { ok: false; error: string };

// ── Mots de passe ────────────────────────────────────────────────────────────

/** Hash au format `scrypt$sel$clé` (hex) — le sel est tiré au hasard par mot de passe. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N });
  return `scrypt$${salt}$${key.toString("hex")}`;
}

/** Comparaison à temps constant ; toute forme inattendue est un échec, jamais une exception. */
export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, expected.length, { N: SCRYPT_N });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// ── Validation des saisies ───────────────────────────────────────────────────

export function normalizeEmail(email: string): string {
  return emailSchema.parse(email);
}

// ── Anti-force brute ─────────────────────────────────────────────────────────

const failedAttempts = new Map<string, { count: number; firstAt: number }>();

/** L'IP a-t-elle épuisé son quota d'échecs de connexion ? */
export function isRateLimited(ip: string, now = Date.now()): boolean {
  const entry = failedAttempts.get(ip);
  if (!entry) return false;
  if (now - entry.firstAt > ATTEMPT_WINDOW_MS) {
    failedAttempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILED_ATTEMPTS;
}

function recordFailure(ip: string, now = Date.now()): void {
  const entry = failedAttempts.get(ip);
  if (!entry || now - entry.firstAt > ATTEMPT_WINDOW_MS) {
    failedAttempts.set(ip, { count: 1, firstAt: now });
    return;
  }
  entry.count++;
}

function clearFailures(ip: string): void {
  failedAttempts.delete(ip);
}

// ── Sessions ─────────────────────────────────────────────────────────────────

/** Ouvre une session pour un compte : jeton opaque de 32 octets. */
export function createSession(
  accountId: string,
  now = Date.now(),
): { token: string; expiresAt: number } {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = now + SESSION_TTL_MS;
  db.insert(schema.sessions).values({ token, accountId, createdAt: now, expiresAt }).run();
  return { token, expiresAt };
}

/**
 * Résout un jeton de session en compte, en prolongeant le TTL glissant.
 * Retourne null si le jeton est inconnu, expiré (la ligne est alors purgée) ou
 * si le compte a disparu.
 */
export function resolveSession(token: string | undefined, now = Date.now()): Account | null {
  if (!token) return null;
  const session = db.select().from(schema.sessions).where(eq(schema.sessions.token, token)).get();
  if (!session) return null;
  if (session.expiresAt <= now) {
    db.delete(schema.sessions).where(eq(schema.sessions.token, token)).run();
    return null;
  }
  const account = db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.id, session.accountId))
    .get();
  if (!account) return null;
  // TTL glissant : on n'écrit que lorsque le gain dépasse un jour (évite un UPDATE par message).
  if (session.expiresAt - now < SESSION_TTL_MS - SESSION_REFRESH_MS) {
    db.update(schema.sessions)
      .set({ expiresAt: now + SESSION_TTL_MS })
      .where(eq(schema.sessions.token, token))
      .run();
  }
  return { id: account.id, email: account.email };
}

export function revokeSession(token: string): void {
  db.delete(schema.sessions).where(eq(schema.sessions.token, token)).run();
}

/** Purge les sessions expirées (appelée au boot). */
export function purgeExpiredSessions(now = Date.now()): void {
  db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, now)).run();
}

// ── Comptes ──────────────────────────────────────────────────────────────────

export function findAccountByEmail(email: string): { id: string; passwordHash: string } | null {
  const row = db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.email, normalizeEmail(email)))
    .get();
  return row ? { id: row.id, passwordHash: row.passwordHash } : null;
}

/**
 * Inscrit un compte et ouvre sa session. L'empire associé est créé par l'appelant
 * (le moteur de jeu) : ce module ne connaît que l'identité.
 */
export function register(email: string, password: string, ip = "?"): AuthResult {
  const parsedEmail = emailSchema.safeParse(email ?? "");
  if (!parsedEmail.success) return { ok: false, error: "Adresse e-mail invalide" };
  const parsedPassword = passwordSchema.safeParse(password);
  if (!parsedPassword.success && (typeof password !== "string" || password.length < 8)) {
    return {
      ok: false,
      error: "Mot de passe trop court (8 caractères minimum)",
    };
  }
  if (!parsedPassword.success) {
    return { ok: false, error: "Mot de passe trop long" };
  }
  const normalized = parsedEmail.data;
  if (findAccountByEmail(normalized)) {
    return { ok: false, error: "Un compte existe déjà pour cette adresse" };
  }
  const now = Date.now();
  const id = randomUUID();
  db.insert(schema.accounts)
    .values({
      id,
      email: normalized,
      passwordHash: hashPassword(password),
      createdAt: now,
      lastLoginAt: now,
    })
    .run();
  clearFailures(ip);
  const { token, expiresAt } = createSession(id, now);
  return { ok: true, account: { id, email: normalized }, token, expiresAt };
}

/**
 * Connecte un compte existant. Le message d'erreur ne distingue jamais
 * « adresse inconnue » de « mot de passe incorrect » (pas d'énumération de comptes).
 */
export function login(email: string, password: string, ip = "?"): AuthResult {
  if (isRateLimited(ip)) {
    return { ok: false, error: "Trop de tentatives — réessayez dans quelques minutes" };
  }
  const invalid = { ok: false as const, error: "Identifiants incorrects" };
  const parsedEmail = emailSchema.safeParse(email ?? "");
  if (!parsedEmail.success || typeof password !== "string") {
    recordFailure(ip);
    return invalid;
  }
  const normalized = parsedEmail.data;
  const account = findAccountByEmail(normalized);
  if (!account) {
    recordFailure(ip);
    return invalid;
  }
  if (!verifyPassword(password, account.passwordHash)) {
    recordFailure(ip);
    return invalid;
  }
  const now = Date.now();
  db.update(schema.accounts)
    .set({ lastLoginAt: now })
    .where(eq(schema.accounts.id, account.id))
    .run();
  clearFailures(ip);
  const { token, expiresAt } = createSession(account.id, now);
  return { ok: true, account: { id: account.id, email: normalized }, token, expiresAt };
}

/** Jeton porté par l'en-tête `Authorization: Bearer <token>`, si présent. */
export function bearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : undefined;
}

/** Ferme toutes les sessions d'un compte (changement de mot de passe, déconnexion globale). */
export function revokeAllSessions(accountId: string): void {
  db.delete(schema.sessions).where(eq(schema.sessions.accountId, accountId)).run();
}

/** Nombre de sessions actives d'un compte (diagnostic / tests). */
export function activeSessionCount(accountId: string, now = Date.now()): number {
  return db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.accountId, accountId))
    .all()
    .filter((s) => s.expiresAt > now).length;
}
