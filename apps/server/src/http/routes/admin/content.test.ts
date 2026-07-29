import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "../../../db/index.js";
import { GameEngine } from "../../../game.js";
import { buildApp } from "../../app.js";
import { registerTestAccount, setTestRole } from "./test-helpers.js";

beforeEach(async () => {
  await db.delete(schema.adminAuditLog);
  await db.delete(schema.sessions);
  await db.delete(schema.accounts);
  // ensureContentSeeded() n'amorce que si la table est vide (chantier 23.5) : sans ce
  // nettoyage, une édition d'un test précédent survivrait aux suivants dans ce fichier.
  await db.delete(schema.contentWarships);
  await db.delete(schema.contentCombatTuning);
  await db.delete(schema.contentFactions);
});

const VALID_WARSHIP_BODY = {
  nameFr: "Croiseur plasma",
  descriptionFr: "Un nouveau croiseur créé depuis l'admin.",
  hull: 250,
  shield: 70,
  weapons: { long: 30, medium: 18, short: 9 },
  initiative: 14,
  category: "capital",
  cost: { metals: 350, components: 100 },
  buildMs: 140_000,
  requiresTech: "capital_ships",
  fleetDamageBonus: null,
};

describe("/api/admin/content/warships", () => {
  it("un compte joueur ne peut pas lire le contenu (403)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token } = await registerTestAccount(app, "joueur@exemple.fr");
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/content/warships",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("un moderator (gestion joueurs) ne peut pas lire le contenu (403)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "mod@exemple.fr");
    await setTestRole(accountId, "moderator");
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/content/warships",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("un content_editor liste les 7 classes historiques amorcées au boot", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/content/warships",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().warships).toHaveLength(7);
  });

  it("modifie une entrée existante — effective immédiatement (édition en live)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");

    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/content/warships/fighter",
      headers: { authorization: `Bearer ${token}` },
      payload: { ...VALID_WARSHIP_BODY, nameFr: "Chasseur", category: "skirmisher" },
    });
    expect(res.statusCode).toBe(200);
    const updated = res.json().warships.find((w: { id: string }) => w.id === "fighter");
    expect(updated.hull).toBe(250);
    expect(updated.nameFr).toBe("Chasseur");

    // Relit : la modification est bien persistée et rechargée en mémoire (pas seulement
    // renvoyée par la réponse de l'écriture).
    const reread = await app.inject({
      method: "GET",
      url: "/api/admin/content/warships",
      headers: { authorization: `Bearer ${token}` },
    });
    const fighter = reread.json().warships.find((w: { id: string }) => w.id === "fighter");
    expect(fighter.hull).toBe(250);
  });

  it("un id inconnu crée une entrée neuve (id-minting, sans mécanique dédiée)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");

    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/content/warships/plasma_cruiser",
      headers: { authorization: `Bearer ${token}` },
      payload: VALID_WARSHIP_BODY,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().warships).toHaveLength(8);
    const created = res.json().warships.find((w: { id: string }) => w.id === "plasma_cruiser");
    expect(created.nameFr).toBe("Croiseur plasma");
  });

  it("un corps invalide est refusé (400)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");

    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/content/warships/fighter",
      headers: { authorization: `Bearer ${token}` },
      payload: { ...VALID_WARSHIP_BODY, hull: -10 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("chaque écriture est journalisée dans le journal d'audit", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    // "admin" plutôt que "content_editor" : cette action a aussi besoin de "audit.read"
    // pour relire le journal ensuite, que content_editor n'a pas (chantier 23.1/23.5).
    const { token, accountId } = await registerTestAccount(app, "admin@exemple.fr");
    await setTestRole(accountId, "admin");

    await app.inject({
      method: "PUT",
      url: "/api/admin/content/warships/fighter",
      headers: { authorization: `Bearer ${token}` },
      payload: { ...VALID_WARSHIP_BODY, category: "skirmisher" },
    });

    const audit = await app.inject({
      method: "GET",
      url: "/api/admin/audit",
      headers: { authorization: `Bearer ${token}` },
    });
    const entries = audit.json().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: "content.warships.write",
      targetType: "content_warship",
      targetId: "fighter",
      reason: "modification",
    });
  });

  it("expose les réglages de combat (triangle, directives) en lecture", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/content/combat-tuning",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().counterBonus).toBeGreaterThan(1);
  });
});

const VALID_FACTION_BODY = {
  name: "Syndicat Hélion",
  color: "#3388ff",
  descriptionFr: "Une nouvelle faction créée depuis l'admin.",
  produces: { energy: 40 },
  consumes: { metals: 20 },
};

describe("/api/admin/content/factions", () => {
  it("un content_editor liste les 3 factions historiques amorcées au boot", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/content/factions",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().factions).toHaveLength(3);
  });

  it("modifie une faction existante — effective immédiatement", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");

    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/content/factions/ferride",
      headers: { authorization: `Bearer ${token}` },
      payload: { ...VALID_FACTION_BODY, name: "Consortium Ferride" },
    });
    expect(res.statusCode).toBe(200);
    const updated = res.json().factions.find((f: { id: string }) => f.id === "ferride");
    expect(updated.color).toBe("#3388ff");
    expect(updated.produces.energy).toBe(40);
  });

  it("un id inconnu crée une faction neuve (id-minting)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");

    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/content/factions/helion_syndicate",
      headers: { authorization: `Bearer ${token}` },
      payload: VALID_FACTION_BODY,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().factions).toHaveLength(4);
  });

  it("une couleur mal formée est refusée (400)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");

    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/content/factions/ferride",
      headers: { authorization: `Bearer ${token}` },
      payload: { ...VALID_FACTION_BODY, color: "bleu" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("un compte joueur ne peut pas éditer les factions (403)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token } = await registerTestAccount(app, "joueur@exemple.fr");
    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/content/factions/ferride",
      headers: { authorization: `Bearer ${token}` },
      payload: VALID_FACTION_BODY,
    });
    expect(res.statusCode).toBe(403);
  });
});
