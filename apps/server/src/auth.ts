import {
  emailSchema,
  passwordSchema,
  type RoleId,
  type SanctionKind,
} from "@spacesim/protocol";
import { and, desc, eq, lt } from "drizzle-orm";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
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
  /** Rôle applicatif (chantier 23.1) — vérifié contre `ROLE_PERMISSIONS` pour `/api/admin/*`. */
  role: RoleId;
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
export async function createSession(
  accountId: string,
  now = Date.now(),
): Promise<{ token: string; expiresAt: number }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = now + SESSION_TTL_MS;
  await db
    .insert(schema.sessions)
    .values({ token, accountId, createdAt: now, expiresAt });
  return { token, expiresAt };
}

/**
 * Résout un jeton de session en compte, en prolongeant le TTL glissant.
 * Retourne null si le jeton est inconnu, expiré (la ligne est alors purgée) ou
 * si le compte a disparu.
 */
export async function resolveSession(
  token: string | undefined,
  now = Date.now(),
): Promise<Account | null> {
  if (!token) return null;
  const sessions = await db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.token, token));
  const session = sessions[0];
  if (!session) return null;
  if (session.expiresAt <= now) {
    await db.delete(schema.sessions).where(eq(schema.sessions.token, token));
    return null;
  }
  const accounts = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.id, session.accountId));
  const account = accounts[0];
  if (!account) return null;
  // TTL glissant : on n'écrit que lorsque le gain dépasse un jour (évite un UPDATE par message).
  if (session.expiresAt - now < SESSION_TTL_MS - SESSION_REFRESH_MS) {
    await db
      .update(schema.sessions)
      .set({ expiresAt: now + SESSION_TTL_MS })
      .where(eq(schema.sessions.token, token));
  }
  return { id: account.id, email: account.email, role: account.role as RoleId };
}

export async function revokeSession(token: string): Promise<void> {
  await db.delete(schema.sessions).where(eq(schema.sessions.token, token));
}

/** Purge les sessions expirées (appelée au boot). */
export async function purgeExpiredSessions(now = Date.now()): Promise<void> {
  await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, now));
}

// ── Comptes ──────────────────────────────────────────────────────────────────

export async function findAccountByEmail(
  email: string,
): Promise<{ id: string; passwordHash: string | null; role: RoleId } | null> {
  const rows = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.email, normalizeEmail(email)));
  const row = rows[0];
  return row
    ? { id: row.id, passwordHash: row.passwordHash, role: row.role as RoleId }
    : null;
}

/** Identité chez un fournisseur SSO — forme minimale, pas encore le vrai échange OAuth
 *  (chantier 27.10). */
export interface ExternalIdentity {
  provider: string;
  providerUserId: string;
  email: string;
}

/**
 * Trouve le compte lié à une identité SSO (provider, providerUserId), ou en crée un
 * nouveau — sans mot de passe (`passwordHash` nul) — si c'est la première connexion par
 * ce fournisseur (chantier 27.9, fondation du schéma). Ne fusionne pas avec un compte
 * mot de passe existant de même e-mail — décision de produit à trancher au vrai câblage
 * OAuth (chantier 27.10), pas une hypothèse à figer maintenant.
 */
export async function findOrCreateAccountByIdentity(
  identity: ExternalIdentity,
): Promise<Account> {
  const linked = (
    await db
      .select()
      .from(schema.accountIdentities)
      .where(
        and(
          eq(schema.accountIdentities.provider, identity.provider),
          eq(schema.accountIdentities.providerUserId, identity.providerUserId),
        ),
      )
  )[0];
  if (linked) {
    const account = (
      await db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.id, linked.accountId))
    )[0];
    if (!account)
      throw new Error("Identité SSO orpheline — compte introuvable");
    return {
      id: account.id,
      email: account.email,
      role: account.role as RoleId,
    };
  }

  const now = Date.now();
  const accountId = randomUUID();
  const email = normalizeEmail(identity.email);
  await db.insert(schema.accounts).values({
    id: accountId,
    email,
    passwordHash: null,
    createdAt: now,
    lastLoginAt: now,
  });
  await db.insert(schema.accountIdentities).values({
    id: randomUUID(),
    accountId,
    provider: identity.provider,
    providerUserId: identity.providerUserId,
    createdAt: now,
  });
  return { id: accountId, email, role: "player" };
}

/**
 * Inscrit un compte et ouvre sa session. L'empire associé est créé par l'appelant
 * (le moteur de jeu) : ce module ne connaît que l'identité.
 */
export async function register(
  email: string,
  password: string,
  ip = "?",
): Promise<AuthResult> {
  const parsedEmail = emailSchema.safeParse(email ?? "");
  if (!parsedEmail.success)
    return { ok: false, error: "Adresse e-mail invalide" };
  const parsedPassword = passwordSchema.safeParse(password);
  if (
    !parsedPassword.success &&
    (typeof password !== "string" || password.length < 8)
  ) {
    return {
      ok: false,
      error: "Mot de passe trop court (8 caractères minimum)",
    };
  }
  if (!parsedPassword.success) {
    return { ok: false, error: "Mot de passe trop long" };
  }
  const normalized = parsedEmail.data;
  if (await findAccountByEmail(normalized)) {
    return { ok: false, error: "Un compte existe déjà pour cette adresse" };
  }
  const now = Date.now();
  const id = randomUUID();
  await db.insert(schema.accounts).values({
    id,
    email: normalized,
    passwordHash: hashPassword(password),
    createdAt: now,
    lastLoginAt: now,
  });
  clearFailures(ip);
  const { token, expiresAt } = await createSession(id, now);
  return {
    ok: true,
    account: { id, email: normalized, role: "player" },
    token,
    expiresAt,
  };
}

/**
 * Connecte un compte existant. Le message d'erreur ne distingue jamais
 * « adresse inconnue » de « mot de passe incorrect » (pas d'énumération de comptes).
 */
export async function login(
  email: string,
  password: string,
  ip = "?",
): Promise<AuthResult> {
  if (isRateLimited(ip)) {
    return {
      ok: false,
      error: "Trop de tentatives — réessayez dans quelques minutes",
    };
  }
  const invalid = { ok: false as const, error: "Identifiants incorrects" };
  const parsedEmail = emailSchema.safeParse(email ?? "");
  if (!parsedEmail.success || typeof password !== "string") {
    recordFailure(ip);
    return invalid;
  }
  const normalized = parsedEmail.data;
  const account = await findAccountByEmail(normalized);
  if (!account) {
    recordFailure(ip);
    return invalid;
  }
  // Compte SSO-seul (chantier 27.9) : aucun mot de passe à vérifier, même message
  // générique que des identifiants incorrects (pas d'énumération de comptes).
  if (
    account.passwordHash === null ||
    !verifyPassword(password, account.passwordHash)
  ) {
    recordFailure(ip);
    return invalid;
  }
  // Identifiants corrects mais compte sanctionné : message explicite (volontairement
  // différent du non-distinguo anti-énumération ci-dessus — un compte banni doit savoir
  // pourquoi), ni échec ni session ouverte.
  const sanction = await accountSanctionStatus(account.id);
  if (sanction.active) {
    clearFailures(ip);
    const until =
      sanction.kind === "ban"
        ? ""
        : ` jusqu'au ${new Date(sanction.expiresAt!).toLocaleString("fr-FR")}`;
    return {
      ok: false,
      error: `Compte ${sanction.kind === "ban" ? "banni" : "suspendu"}${until} : ${sanction.reason}`,
    };
  }
  const now = Date.now();
  await db
    .update(schema.accounts)
    .set({ lastLoginAt: now })
    .where(eq(schema.accounts.id, account.id));
  clearFailures(ip);
  const { token, expiresAt } = await createSession(account.id, now);
  return {
    ok: true,
    account: { id: account.id, email: normalized, role: account.role },
    token,
    expiresAt,
  };
}

/** Jeton porté par l'en-tête `Authorization: Bearer <token>`, si présent. */
export function bearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : undefined;
}

/** Ferme toutes les sessions d'un compte (changement de mot de passe, déconnexion globale). */
export async function revokeAllSessions(accountId: string): Promise<void> {
  await db
    .delete(schema.sessions)
    .where(eq(schema.sessions.accountId, accountId));
}

/** Nombre de sessions actives d'un compte (diagnostic / tests). */
export async function activeSessionCount(
  accountId: string,
  now = Date.now(),
): Promise<number> {
  const rows = await db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.accountId, accountId));
  return rows.filter((s) => s.expiresAt > now).length;
}

// ── Sanctions (chantier 23.4) ────────────────────────────────────────────────
// Portées ici (pas dans admin/) : « un compte sanctionné ne peut pas se connecter » est
// une règle d'auth à part entière, vérifiée par `login()` ci-dessous. L'écriture (poser une
// sanction) reste côté admin (`admin/sanctions-service.ts`), qui importe `revokeAllSessions`
// d'ici — dépendance à sens unique, jamais l'inverse.

export interface SanctionEntry {
  id: string;
  accountId: string;
  kind: SanctionKind;
  reason: string;
  actorAccountId: string;
  actorEmail: string;
  createdAt: number;
  expiresAt: number | null;
}

export interface SanctionStatus {
  active: boolean;
  kind: "ban" | "suspend" | null;
  reason: string | null;
  expiresAt: number | null;
}

/** Historique des sanctions d'un compte, plus récentes d'abord. */
export async function sanctionHistory(
  accountId: string,
): Promise<SanctionEntry[]> {
  const rows = await db
    .select()
    .from(schema.accountSanctions)
    .where(eq(schema.accountSanctions.accountId, accountId))
    .orderBy(desc(schema.accountSanctions.createdAt));
  return rows.map((r) => ({ ...r, kind: r.kind as SanctionKind }));
}

/**
 * Statut courant, calculé depuis le dernier événement `ban`/`suspend`/`unban` de
 * l'historique — pas de deuxième source de vérité (type `accounts.status`) qui pourrait
 * diverger. `warn`/`force_logout` sont journalisés mais ne changent jamais le statut.
 */
export function computeSanctionStatus(
  history: readonly SanctionEntry[],
  now = Date.now(),
): SanctionStatus {
  const statusEvent = history.find(
    (e) => e.kind === "ban" || e.kind === "suspend" || e.kind === "unban",
  );
  if (!statusEvent || statusEvent.kind === "unban") {
    return { active: false, kind: null, reason: null, expiresAt: null };
  }
  if (statusEvent.kind === "ban") {
    return {
      active: true,
      kind: "ban",
      reason: statusEvent.reason,
      expiresAt: null,
    };
  }
  const active = statusEvent.expiresAt !== null && statusEvent.expiresAt > now;
  return {
    active,
    kind: active ? "suspend" : null,
    reason: active ? statusEvent.reason : null,
    expiresAt: statusEvent.expiresAt,
  };
}

/** Statut courant d'un compte — chemin utilisé par `login()` ci-dessous et par l'admin. */
export async function accountSanctionStatus(
  accountId: string,
  now = Date.now(),
): Promise<SanctionStatus> {
  return computeSanctionStatus(await sanctionHistory(accountId), now);
}
