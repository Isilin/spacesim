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
  await db.delete(schema.contentBuildings);
  await db.delete(schema.contentShips);
  await db.delete(schema.contentConstants);
  await db.delete(schema.contentTechs);
  await db.delete(schema.contentChassis);
  await db.delete(schema.contentModules);
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

const VALID_BUILDING_BODY = {
  nameFr: "Mine profonde",
  descriptionFr: "Extraction renforcée.",
  cost: { ore: 999, energy: 25 },
  buildMs: 25_000,
  outputs: { ore: 4 },
  inputs: {},
  depositScaled: "ore",
  jobsPerInstance: 5,
};

describe("/api/admin/content/buildings", () => {
  it("un content_editor liste les 12 bâtiments historiques amorcés au boot", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/content/buildings",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().buildings).toHaveLength(12);
  });

  it("modifie un bâtiment existant — effective immédiatement", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");

    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/content/buildings/mine",
      headers: { authorization: `Bearer ${token}` },
      payload: VALID_BUILDING_BODY,
    });
    expect(res.statusCode).toBe(200);
    const updated = res.json().buildings.find((b: { id: string }) => b.id === "mine");
    expect(updated.cost.ore).toBe(999);
    expect(updated.outputs.ore).toBe(4);
  });

  it("un id inconnu de BUILDING_IDS est refusé (400) — pas d'id-minting pour ce domaine", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");

    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/content/buildings/mega_mine",
      headers: { authorization: `Bearer ${token}` },
      payload: VALID_BUILDING_BODY,
    });
    expect(res.statusCode).toBe(400);
  });

  it("un corps invalide est refusé (400)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");

    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/content/buildings/mine",
      headers: { authorization: `Bearer ${token}` },
      payload: { ...VALID_BUILDING_BODY, buildMs: -1 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("un compte joueur ne peut pas éditer les bâtiments (403)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token } = await registerTestAccount(app, "joueur@exemple.fr");
    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/content/buildings/mine",
      headers: { authorization: `Bearer ${token}` },
      payload: VALID_BUILDING_BODY,
    });
    expect(res.statusCode).toBe(403);
  });
});

const VALID_SHIP_BODY = {
  nameFr: "Cargo blindé",
  descriptionFr: "Un nouveau cargo créé depuis l'admin.",
  capacity: 450,
  cost: { metals: 140, components: 35 },
  buildMs: 90_000,
  requiresTech: "orbital_logistics",
  speedMult: 0.9,
  fuelPerJump: 18,
};

describe("/api/admin/content/ships", () => {
  it("un content_editor liste les 4 classes civiles historiques amorcées au boot", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/content/ships",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ships).toHaveLength(4);
  });

  it("modifie un vaisseau existant — effective immédiatement", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");

    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/content/ships/cargo_small",
      headers: { authorization: `Bearer ${token}` },
      payload: { ...VALID_SHIP_BODY, capacity: 9999, requiresTech: null },
    });
    expect(res.statusCode).toBe(200);
    const updated = res.json().ships.find((s: { id: string }) => s.id === "cargo_small");
    expect(updated.capacity).toBe(9999);
  });

  it("un id inconnu crée un vaisseau neuf (id-minting)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");

    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/content/ships/bulk_freighter",
      headers: { authorization: `Bearer ${token}` },
      payload: VALID_SHIP_BODY,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ships).toHaveLength(5);
  });

  it("un corps invalide est refusé (400)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");

    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/content/ships/cargo_small",
      headers: { authorization: `Bearer ${token}` },
      payload: { ...VALID_SHIP_BODY, speedMult: -1 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("un compte joueur ne peut pas éditer les vaisseaux civils (403)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token } = await registerTestAccount(app, "joueur@exemple.fr");
    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/content/ships/cargo_small",
      headers: { authorization: `Bearer ${token}` },
      payload: VALID_SHIP_BODY,
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("/api/admin/content/constants", () => {
  it("un content_editor liste les 26 scalaires d'équilibrage amorcés au boot", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/content/constants",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().constants).toHaveLength(26);
  });

  it("modifie une constante existante — effective immédiatement", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");

    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/content/constants/raidFraction",
      headers: { authorization: `Bearer ${token}` },
      payload: { value: 0.9, descriptionFr: "Fraction pillée, modifiée pour test." },
    });
    expect(res.statusCode).toBe(200);
    const updated = res.json().constants.find((c: { key: string }) => c.key === "raidFraction");
    expect(updated.value).toBe(0.9);
  });

  it("une clé inconnue de BalanceConstants est refusée (400) — pas d'id-minting pour ce domaine", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");

    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/content/constants/notARealConstant",
      headers: { authorization: `Bearer ${token}` },
      payload: { value: 1, descriptionFr: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("un corps invalide est refusé (400)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");

    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/content/constants/raidFraction",
      headers: { authorization: `Bearer ${token}` },
      payload: { value: "pas un nombre" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("un compte joueur ne peut pas éditer les constantes (403)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token } = await registerTestAccount(app, "joueur@exemple.fr");
    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/content/constants/raidFraction",
      headers: { authorization: `Bearer ${token}` },
      payload: { value: 0.5, descriptionFr: "" },
    });
    expect(res.statusCode).toBe(403);
  });
});

const VALID_TECH_BODY = {
  nameFr: "Extraction profonde",
  descriptionFr: "Une nouvelle tech créée depuis l'admin.",
  branch: "industry",
  cost: 200,
  durationMs: 180_000,
  requires: ["metallurgy"],
  effects: { outputMult: { mine: 1.5 } },
};

describe("/api/admin/content/techs", () => {
  it("un content_editor liste les 40 techs historiques amorcées au boot", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/content/techs",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().techs).toHaveLength(40);
  });

  it("modifie une tech existante — effective immédiatement", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");

    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/content/techs/metallurgy",
      headers: { authorization: `Bearer ${token}` },
      payload: { ...VALID_TECH_BODY, requires: [] },
    });
    expect(res.statusCode).toBe(200);
    const updated = res.json().techs.find((t: { id: string }) => t.id === "metallurgy");
    expect(updated.cost).toBe(200);
  });

  it("un id inconnu crée une tech neuve (id-minting)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");

    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/content/techs/deep_mining",
      headers: { authorization: `Bearer ${token}` },
      payload: VALID_TECH_BODY,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().techs).toHaveLength(41);
  });

  it("un prérequis inconnu est refusé (400) — validateTree rejoué côté serveur", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");

    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/content/techs/deep_mining",
      headers: { authorization: `Bearer ${token}` },
      payload: { ...VALID_TECH_BODY, requires: ["not_a_real_tech"] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("un cycle de prérequis est refusé (400)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");

    // metallurgy exige déjà industrial_chains : cycle direct.
    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/content/techs/metallurgy",
      headers: { authorization: `Bearer ${token}` },
      payload: { ...VALID_TECH_BODY, requires: ["industrial_chains"] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("un corps invalide est refusé (400)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");

    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/content/techs/metallurgy",
      headers: { authorization: `Bearer ${token}` },
      payload: { ...VALID_TECH_BODY, cost: -10 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("un compte joueur ne peut pas éditer l'arbre de recherche (403)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token } = await registerTestAccount(app, "joueur@exemple.fr");
    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/content/techs/metallurgy",
      headers: { authorization: `Bearer ${token}` },
      payload: VALID_TECH_BODY,
    });
    expect(res.statusCode).toBe(403);
  });
});

const VALID_CHASSIS_BODY = {
  nameFr: "Cadre d'assaut",
  descriptionFr: "Un nouveau châssis créé depuis l'admin.",
  kind: "military",
  domain: "fleet",
  hull: 150,
  baseInitiative: 16,
  power: 70,
  tonnage: 90,
  calc: 60,
  slots: { weapon: 2, defense: 2, propulsion: 1, utility: 1 },
  baseSpeedMult: 1,
  baseFuelPerJump: 14,
  roleBonus: { weapon: 1.1 },
  cost: { metals: 200 },
  buildMs: 100_000,
  requiresTech: "military_doctrine",
};

describe("/api/admin/content/chassis", () => {
  it("un content_editor liste les 9 châssis historiques amorcés au boot", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/content/chassis",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().chassis).toHaveLength(9);
  });

  it("modifie un châssis existant — effective immédiatement", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");

    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/content/chassis/scout_frame",
      headers: { authorization: `Bearer ${token}` },
      payload: { ...VALID_CHASSIS_BODY, hull: 9999, requiresTech: null },
    });
    expect(res.statusCode).toBe(200);
    const updated = res.json().chassis.find((c: { id: string }) => c.id === "scout_frame");
    expect(updated.hull).toBe(9999);
  });

  it("un id inconnu crée un châssis neuf (id-minting)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");

    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/content/chassis/assault_frame",
      headers: { authorization: `Bearer ${token}` },
      payload: VALID_CHASSIS_BODY,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().chassis).toHaveLength(10);
  });

  it("un corps invalide est refusé (400)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");

    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/content/chassis/scout_frame",
      headers: { authorization: `Bearer ${token}` },
      payload: { ...VALID_CHASSIS_BODY, hull: -10 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("un compte joueur ne peut pas éditer les châssis (403)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token } = await registerTestAccount(app, "joueur@exemple.fr");
    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/content/chassis/scout_frame",
      headers: { authorization: `Bearer ${token}` },
      payload: VALID_CHASSIS_BODY,
    });
    expect(res.statusCode).toBe(403);
  });
});

const VALID_MODULE_BODY = {
  nameFr: "Scanner quantique",
  descriptionFr: "Un nouveau module créé depuis l'admin.",
  slot: "utility",
  role: "sensor",
  power: 6,
  tonnage: 4,
  calc: 8,
  cost: { metals: 30, components: 10 },
  buildMs: 9_000,
  requiresTech: "astro_cartography",
  effects: { initiative: 6 },
};

describe("/api/admin/content/modules", () => {
  it("un content_editor liste les 20 modules historiques amorcés au boot", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/content/modules",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().modules).toHaveLength(20);
  });

  it("modifie un module existant — effective immédiatement", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");

    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/content/modules/laser_pulse",
      headers: { authorization: `Bearer ${token}` },
      payload: { ...VALID_MODULE_BODY, power: 999, requiresTech: null },
    });
    expect(res.statusCode).toBe(200);
    const updated = res.json().modules.find((m: { id: string }) => m.id === "laser_pulse");
    expect(updated.power).toBe(999);
  });

  it("un id inconnu crée un module neuf (id-minting)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");

    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/content/modules/quantum_scanner",
      headers: { authorization: `Bearer ${token}` },
      payload: VALID_MODULE_BODY,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().modules).toHaveLength(21);
  });

  it("un corps invalide est refusé (400)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token, accountId } = await registerTestAccount(app, "editeur@exemple.fr");
    await setTestRole(accountId, "content_editor");

    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/content/modules/laser_pulse",
      headers: { authorization: `Bearer ${token}` },
      payload: { ...VALID_MODULE_BODY, power: -1 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("un compte joueur ne peut pas éditer les modules (403)", async () => {
    const app = await buildApp(await GameEngine.loadOrBootstrap());
    const { token } = await registerTestAccount(app, "joueur@exemple.fr");
    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/content/modules/laser_pulse",
      headers: { authorization: `Bearer ${token}` },
      payload: VALID_MODULE_BODY,
    });
    expect(res.statusCode).toBe(403);
  });
});
