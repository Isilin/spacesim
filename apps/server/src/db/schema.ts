import { bigint, doublePrecision, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

/**
 * L'univers est STOCKÉ en DB (tables `universe_*`, chantier 18) et la base fait
 * autorité. La seed n'est conservée qu'en traçabilité et pour matérialiser les
 * galaxies futures — jamais pour reconstruire l'existant.
 */
export const games = pgTable("games", {
  id: text("id").primaryKey(),
  seed: text("seed").notNull(),
  tick: integer("tick").notNull().default(0),
  lastTickAt: bigint("last_tick_at", { mode: "number" }).notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  /**
   * ≡ nombre de galaxies matérialisées dans `universe_galaxies` — aligné par le
   * `WriteSet` (chantier 20.3 : `appendGalaxies` ne touche plus la DB en direct,
   * `TickRunner.saveTick` porte `galaxyCount` à chaque lot de ticks). Croît quand
   * la frontière s'ouvre.
   */
  galaxyCount: integer("galaxy_count").notNull().default(3),
});

// ── Univers matérialisé (chantier 18) ────────────────────────────────────────
// Ces tables sont la SOURCE DE VÉRITÉ de l'univers. Le générateur ne sert qu'à
// matérialiser les galaxies neuves quand la frontière s'ouvre ; une ligne écrite ici
// ne se régénère JAMAIS — corriger l'univers officiel = UPDATE ciblé, pas de reset.
// Les colonnes `*_index` figent l'ordre des tableaux (systems, planets, links) pour
// une reconstruction identique au généré. FKs RÉELLES (chantier 20.3, actives en
// Postgres — SQLite ne les vérifiait pas).

export const universeGalaxies = pgTable("universe_galaxies", {
  /** "gal-7" — l'id d'univers est une clé naturelle éternelle. */
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  index: integer("galaxy_index").notNull(),
  name: text("name").notNull(),
  x: integer("x").notNull(),
  y: integer("y").notNull(),
  depositBonus: doublePrecision("deposit_bonus").notNull(),
  anchorSystemId: text("anchor_system_id").notNull(),
  /**
   * Parent dans l'arbre inter-galactique — FIGÉ ici à la matérialisation : un
   * changement de GALAXY_SPACING/GOLDEN_ANGLE ne recâble plus rien. NULL pour gal-0.
   */
  parentGalaxyIndex: integer("parent_galaxy_index"),
  /** Version du générateur qui a produit la galaxie (traçabilité, jamais rejouée). */
  generatorVersion: integer("generator_version").notNull(),
  materializedAt: bigint("materialized_at", { mode: "number" }).notNull(),
});

export const universeSystems = pgTable("universe_systems", {
  /** "gal-7-sys-3" */
  id: text("id").primaryKey(),
  galaxyId: text("galaxy_id")
    .notNull()
    .references(() => universeGalaxies.id),
  /** Position dans `galaxy.systems` (ordre de génération). */
  systemIndex: integer("system_index").notNull(),
  name: text("name").notNull(),
  x: integer("x").notNull(),
  y: integer("y").notNull(),
});

export const universeLinks = pgTable(
  "universe_links",
  {
    galaxyId: text("galaxy_id")
      .notNull()
      .references(() => universeGalaxies.id),
    /** Paire canonique (a < b), comme produite par le générateur. */
    aSystemId: text("a_system_id")
      .notNull()
      .references(() => universeSystems.id),
    bSystemId: text("b_system_id")
      .notNull()
      .references(() => universeSystems.id),
    /** Position dans `galaxy.links`. */
    linkIndex: integer("link_index").notNull(),
  },
  (t) => [primaryKey({ columns: [t.aSystemId, t.bSystemId] })],
);

/** Planètes ET lunes (comme `system.planets`, entrelacées dans l'ordre de génération). */
export const universeBodies = pgTable("universe_bodies", {
  /** "...-p2" (planète) ou "...-p2-m1" (lune). */
  id: text("id").primaryKey(),
  systemId: text("system_id")
    .notNull()
    .references(() => universeSystems.id),
  /** Position dans `system.planets`. */
  bodyIndex: integer("body_index").notNull(),
  kind: text("kind").notNull(),
  /** NULL pour une planète ; la planète orbitée pour une lune. */
  parentPlanetId: text("parent_planet_id"),
  name: text("name").notNull(),
  type: text("type").notNull(),
  habitability: integer("habitability").notNull(),
  slots: integer("slots").notNull(),
  /** JSON Deposits. */
  deposits: text("deposits").notNull().default("{}"),
  orbitRadius: doublePrecision("orbit_radius").notNull(),
  orbitAngle: doublePrecision("orbit_angle").notNull(),
});

export const universeBelts = pgTable("universe_belts", {
  /** "...-b1" */
  id: text("id").primaryKey(),
  systemId: text("system_id")
    .notNull()
    .references(() => universeSystems.id),
  /** Position dans `system.belts`. */
  beltIndex: integer("belt_index").notNull(),
  name: text("name").notNull(),
  orbitRadius: doublePrecision("orbit_radius").notNull(),
  /** JSON Deposits. */
  deposits: text("deposits").notNull().default("{}"),
});

export const universeStations = pgTable("universe_stations", {
  /** "...-st" */
  id: text("id").primaryKey(),
  /** Au plus une station par système. */
  systemId: text("system_id")
    .notNull()
    .unique()
    .references(() => universeSystems.id),
  factionId: text("faction_id").notNull(),
  name: text("name").notNull(),
});

/**
 * Comptes joueurs (chantier 8). Le mot de passe est stocké en `scrypt$sel$hash`
 * (voir `src/auth.ts`) — jamais en clair, jamais réversible.
 */
export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  /** Normalisé en minuscules, unique. */
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  lastLoginAt: bigint("last_login_at", { mode: "number" }),
  /**
   * "player" (défaut) | "moderator" | "content_editor" | "admin" (chantier 23.1) — vérifié
   * contre `ROLE_PERMISSIONS` (`@spacesim/protocol`) par le garde `/api/admin/*`. Pas d'enum
   * Postgres natif, même convention que `players.kind`/`relations.state`.
   */
  role: text("role").notNull().default("player"),
});

/** Sessions ouvertes : jeton opaque → compte. TTL glissant, purge au boot. */
export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  accountId: text("account_id").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
});

/**
 * Journal d'audit des actions admin (chantier 23.1) : chaque mutation via `/api/admin/*` y
 * écrit une ligne (lecture seule non journalisée, pour ne pas noyer le journal). Écrit en
 * direct par `admin/audit-service.ts` — hors `WriteSet`/`Persister`, chemin humain à basse
 * fréquence, pas le chemin chaud tick/commande que le write-behind protège.
 */
/**
 * Événements de sanction sur un compte (chantier 23.4) : `warn|suspend|ban|unban|
 * force_logout`. Journal d'événements plutôt qu'un champ `accounts.status` — le statut
 * courant se calcule à la lecture depuis le dernier événement ban/suspend/unban
 * (`auth.ts` → `computeSanctionStatus`), pas de deuxième source de vérité qui peut diverger.
 */
export const accountSanctions = pgTable("account_sanctions", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  kind: text("kind").notNull(),
  reason: text("reason").notNull(),
  actorAccountId: text("actor_account_id").notNull(),
  actorEmail: text("actor_email").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  /** Échéance d'une suspension temporaire ; null = permanent (ban) ou sans objet. */
  expiresAt: bigint("expires_at", { mode: "number" }),
});

export const adminAuditLog = pgTable("admin_audit_log", {
  id: text("id").primaryKey(),
  actorAccountId: text("actor_account_id").notNull(),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  /** Type/id de la cible (ex. "account"/"acc-123"), nullable pour une action sans cible unique. */
  targetType: text("target_type"),
  targetId: text("target_id"),
  reason: text("reason"),
  /** JSON libre : détails additionnels propres à l'action. */
  metadata: text("metadata"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

/**
 * Empires (joueurs) partageant l'univers d'une partie.
 * Chantier 7 : socle multi-locataire. En solo, un seul player possède tout.
 * Les champs d'empire (influence, recherche, réputation, exploration) migreront
 * de `games` vers cette table au sous-jalon 7b (moteur multi-empire).
 */
export const players = pgTable("players", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  /** Compte propriétaire (chantier 8). NULL = empire anonyme legacy ou outil de dev. */
  accountId: text("account_id"),
  /**
   * "human" (défaut, y compris l'empire amorcé au boot, adoptable par un compte) ou
   * "npc" (chantier 14 — piloté par l'IA économique, jamais adopté par un compte).
   */
  kind: text("kind").notNull().default("human"),
  name: text("name").notNull(),
  /** Couleur d'affichage du territoire sur la carte. */
  color: text("color").notNull(),
  joinedAt: bigint("joined_at", { mode: "number" }).notNull(),
  // État d'empire, propre à chaque joueur (migré depuis `games` — chantier 7b).
  /** JSON : ids des techs acquises. */
  researched: text("researched").notNull().default("[]"),
  /** JSON ActiveResearch ou null : recherche en cours. */
  research: text("research"),
  /** JSON : chaîne de techs planifiées, lancées l'une après l'autre (chantier 11). */
  researchQueue: text("research_queue").notNull().default("[]"),
  influence: doublePrecision("influence").notNull().default(0),
  /** JSON : réputation par faction. */
  factionRep: text("faction_rep").notNull().default("{}"),
  /** JSON : ids des systèmes explorés (brouillard propre au joueur). */
  explored: text("explored").notNull().default("[]"),
});

/**
 * Relations entre empires (chantier 16 — remplace `wars`, diplomatie 7e minimale).
 * Absence de ligne = neutre. Paire canonique (`empireA` < `empireB`) pour une relation
 * symétrique unique. `until` : échéance de cooldown (ex. guerre interdite peu après une
 * paix) — sans rapport avec la durée d'un pacte, qui n'expire pas de lui-même.
 */
export const relations = pgTable("relations", {
  gameId: text("game_id").notNull(),
  empireA: text("empire_a").notNull(),
  empireB: text("empire_b").notNull(),
  state: text("state").notNull().default("neutral"),
  since: bigint("since", { mode: "number" }).notNull(),
  until: bigint("until", { mode: "number" }),
});

/** Propositions de pacte (NAP/alliance) en attente d'une réponse (chantier 16). */
export const relationProposals = pgTable("relation_proposals", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  fromEmpireId: text("from_empire_id").notNull(),
  toEmpireId: text("to_empire_id").notNull(),
  kind: text("kind").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

/** Objectifs éphémères personnels, un seul actif par empire à la fois (chantier 17). */
export const objectives = pgTable("objectives", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  empireId: text("empire_id").notNull(),
  kind: text("kind").notNull(),
  targetCount: doublePrecision("target_count"),
  targetSystemId: text("target_system_id"),
  reward: doublePrecision("reward").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  deadline: bigint("deadline", { mode: "number" }).notNull(),
  status: text("status").notNull().default("open"),
});

/** Événements de monde actifs, partagés (chantier 17). Supprimés à expiration. */
export const worldEvents = pgTable("world_events", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  kind: text("kind").notNull(),
  galaxyId: text("galaxy_id").references(() => universeGalaxies.id),
  factionId: text("faction_id"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
});

/** Systèmes revendiqués par un joueur (bonus locaux, entretien en influence). */
export const claims = pgTable("claims", {
  systemId: text("system_id")
    .primaryKey()
    .references(() => universeSystems.id),
  gameId: text("game_id").notNull(),
  /** Empire propriétaire du claim (nullable pour la migration, backfill au boot). */
  ownerId: text("owner_id"),
  claimedAt: bigint("claimed_at", { mode: "number" }).notNull(),
});

/** Méga-projets de portail vers les galaxies lointaines. */
export const gateways = pgTable("gateways", {
  galaxyId: text("galaxy_id")
    .primaryKey()
    .references(() => universeGalaxies.id),
  gameId: text("game_id").notNull(),
  /** JSON : ressources déjà livrées. */
  progress: text("progress").notNull().default("{}"),
  activatesAt: bigint("activates_at", { mode: "number" }),
  active: integer("active").notNull().default(0),
});

/**
 * Plans de vaisseaux (chantier 13) : un châssis garni de modules, propre à un empire.
 * `modules` en JSON (tableau d'ids). Les stats sont recalculées à la volée (sim/design),
 * jamais persistées — le contenu d'équilibrage peut évoluer sans migrer la DB.
 */
export const blueprints = pgTable("blueprints", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  chassisId: text("chassis_id").notNull(),
  modules: text("modules").notNull().default("[]"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

/** Flottes militaires du joueur (ships/directives/queue/movement en JSON). */
export const fleets = pgTable("fleets", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  /** Empire propriétaire (nullable pour la migration, backfill au boot). */
  ownerId: text("owner_id"),
  name: text("name").notNull(),
  systemId: text("system_id")
    .notNull()
    .references(() => universeSystems.id),
  homeColonyId: text("home_colony_id").notNull(),
  ships: text("ships").notNull().default("{}"),
  directives: text("directives").notNull(),
  queue: text("queue").notNull().default("[]"),
  movement: text("movement"),
});

/** Humeur courante des factions (chantier 15) : partagée, comme les portails. */
export const factionStates = pgTable("faction_states", {
  factionId: text("faction_id").primaryKey(),
  gameId: text("game_id").notNull(),
  mood: text("mood").notNull().default("neutral"),
  moodUntil: bigint("mood_until", { mode: "number" }),
});

/** Repaires de pirates PNJ. */
export const pirateLairs = pgTable("pirate_lairs", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  systemId: text("system_id")
    .notNull()
    .references(() => universeSystems.id),
  ships: text("ships").notNull(),
  directives: text("directives").notNull(),
  bounty: doublePrecision("bounty").notNull(),
});

/** Rapports de bataille archivés. */
export const battles = pgTable("battles", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  at: bigint("at", { mode: "number" }).notNull(),
  systemId: text("system_id")
    .notNull()
    .references(() => universeSystems.id),
  attackerName: text("attacker_name").notNull(),
  defenderName: text("defender_name").notNull(),
  report: text("report").notNull(),
});

/** resources/buildings/queue en JSON : le schéma de simulation évolue vite, la DB reste stable. */
export const colonies = pgTable("colonies", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  /** Empire propriétaire (nullable pour la migration, backfill au boot). */
  ownerId: text("owner_id"),
  planetId: text("planet_id")
    .notNull()
    .references(() => universeBodies.id),
  name: text("name").notNull(),
  resources: text("resources").notNull(),
  /** JSON : stock en orbite — la seule soute chargeable par un vaisseau (chantier 12). */
  orbitalResources: text("orbital_resources").notNull().default("{}"),
  /** JSON : consignes d'ascension sol↔orbite par ressource. */
  liftRules: text("lift_rules").notNull().default("{}"),
  buildings: text("buildings").notNull(),
  queue: text("queue").notNull(),
  population: doublePrecision("population").notNull().default(0),
  satisfaction: doublePrecision("satisfaction").notNull().default(50),
  /** JSON : flotte civile, vaisseaux occupés, file de production navale. */
  ships: text("ships").notNull().default("{}"),
  shipsBusy: text("ships_busy").notNull().default("[]"),
  shipQueue: text("ship_queue").notNull().default("[]"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

/** Routes logistiques automatiques (rule/ships/activeCycle en JSON). `fromId`/`toId`
 *  restent polymorphes (colonie ou avant-poste) — pas de FK, discriminées par `*Kind`. */
export const routes = pgTable("routes", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  ownerColonyId: text("owner_colony_id").notNull(),
  fromId: text("from_id").notNull(),
  fromKind: text("from_kind").notNull().default("colony"),
  toId: text("to_id").notNull(),
  toKind: text("to_kind").notNull(),
  resource: text("resource").notNull(),
  rule: text("rule").notNull(),
  ships: text("ships").notNull(),
  activeCycle: text("active_cycle"),
  paused: integer("paused").notNull().default(0),
});

/** Avant-postes miniers sur les ceintures d'astéroïdes. */
export const outposts = pgTable("outposts", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  beltId: text("belt_id")
    .notNull()
    .references(() => universeBelts.id),
  ownerColonyId: text("owner_colony_id").notNull(),
  oreStock: doublePrecision("ore_stock").notNull().default(0),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

/** `targetId` reste polymorphe (colonie, station, avant-poste selon `kind`) — pas de FK. */
export const missions = pgTable("missions", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  kind: text("kind").notNull(),
  fromColonyId: text("from_colony_id").notNull(),
  targetId: text("target_id").notNull(),
  departedAt: bigint("departed_at", { mode: "number" }).notNull(),
  arrivesAt: bigint("arrives_at", { mode: "number" }).notNull(),
  /** JSON : cargaison (missions sell / buy_return). */
  cargo: text("cargo"),
  /** Crédits emportés (mission buy) ou reliquat à rembourser (buy_return). */
  budget: doublePrecision("budget"),
  /** Ressource à acheter au spot (mission buy). */
  buyResource: text("buy_resource"),
  /** Soute du cargo réservé (mission buy). */
  capacity: doublePrecision("capacity"),
  /** Contrat honoré (mission deliver_contract, chantier 14). */
  contractId: text("contract_id"),
});

/** Stocks dynamiques des stations PNJ — les prix en dérivent (sim/market). */
export const stationStates = pgTable("station_states", {
  stationId: text("station_id")
    .primaryKey()
    .references(() => universeStations.id),
  gameId: text("game_id").notNull(),
  stocks: text("stocks").notNull(),
});

/**
 * Contrats de demande (chantier 14) : l'émetteur séquestre `pricePerUnit × quantity`
 * crédits à la publication ; n'importe quel autre empire peut livrer depuis son orbite.
 * Tout scalaire — pas de blob JSON, la forme ne bouge pas au gré de l'équilibrage.
 */
export const contracts = pgTable("contracts", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  issuerId: text("issuer_id").notNull(),
  issuerName: text("issuer_name").notNull(),
  issuerColor: text("issuer_color").notNull(),
  /** Colonie émettrice : destination de la livraison. */
  colonyId: text("colony_id").notNull(),
  colonyName: text("colony_name").notNull(),
  systemId: text("system_id")
    .notNull()
    .references(() => universeSystems.id),
  resource: text("resource").notNull(),
  quantity: doublePrecision("quantity").notNull(),
  /** Reste à livrer — décompté à l'acceptation d'un convoi, pas à son arrivée. */
  remaining: doublePrecision("remaining").notNull(),
  pricePerUnit: doublePrecision("price_per_unit").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  deadline: bigint("deadline", { mode: "number" }).notNull(),
  status: text("status").notNull().default("open"),
});

export const transfers = pgTable("transfers", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  fromColonyId: text("from_colony_id").notNull(),
  toColonyId: text("to_colony_id").notNull(),
  resources: text("resources").notNull(),
  departedAt: bigint("departed_at", { mode: "number" }).notNull(),
  arrivesAt: bigint("arrives_at", { mode: "number" }).notNull(),
});

// ── Contenu de jeu édité en admin (chantier 23.5+) ──────────────────────────
// La DB fait autorité, comme l'univers (chantier 18) : le serveur charge ce contenu au
// boot (`runtime/content/`) et l'injecte dans la simulation ; `packages/shared/src/
// content/*.ts` devient le jeu de données par défaut (seed + fixtures de test), plus la
// source de vérité en prod. `id` en `text` libre (pas de contrainte d'enum) : un nouvel
// id peut être créé depuis l'admin, la simulation le résout au même titre que les
// classes historiques (Record<string, …> était déjà la forme de `WARSHIP_COMBAT_DEFS`).

/** Vaisseaux de guerre — domaine pilote de la bascule contenu (déjà injectable côté
 *  `sim/military/combat.ts` avant ce chantier, contrairement aux autres domaines). */
export const contentWarships = pgTable("content_warships", {
  id: text("id").primaryKey(),
  nameFr: text("name_fr").notNull(),
  descriptionFr: text("description_fr").notNull().default(""),
  hull: doublePrecision("hull").notNull(),
  shield: doublePrecision("shield").notNull(),
  /** JSON `{long,medium,short}`. */
  weapons: text("weapons").notNull(),
  initiative: doublePrecision("initiative").notNull(),
  /** "skirmisher"|"line"|"capital"|"support" — triangle de forces, voir content_combat_tuning. */
  category: text("category").notNull(),
  /** JSON `Partial<Record<ResourceId, number>>`. */
  cost: text("cost").notNull().default("{}"),
  buildMs: integer("build_ms").notNull(),
  requiresTech: text("requires_tech"),
  fleetDamageBonus: doublePrecision("fleet_damage_bonus"),
});

/**
 * Réglages de combat au-delà des stats par vaisseau (triangle de catégories, directives,
 * contre-triangle) — ligne UNIQUE (id fixe `"default"`), pas des entités : c'est une
 * matrice de tuning, pas une liste éditable ligne par ligne.
 */
export const contentCombatTuning = pgTable("content_combat_tuning", {
  id: text("id").primaryKey(),
  /** JSON `Record<CombatCategory, Partial<Record<CombatCategory, number>>>`. */
  categoryAdvantage: text("category_advantage").notNull(),
  /** JSON `Record<CombatDirective, DirectiveDef>`. */
  directives: text("directives").notNull(),
  /** JSON `Record<CombatDirective, CombatDirective | null>`. */
  directiveCounter: text("directive_counter").notNull(),
  counterBonus: doublePrecision("counter_bonus").notNull(),
});

/** Factions marchandes PNJ (chantier 23.6) — première extension du patron d'injection à
 *  un domaine qui n'en avait aucune trace avant ce chantier. */
export const contentFactions = pgTable("content_factions", {
  id: text("id").primaryKey(),
  /** Nom canonique — déjà partagé côté serveur avant ce chantier (émetteur de contrat). */
  name: text("name").notNull(),
  color: text("color").notNull(),
  descriptionFr: text("description_fr").notNull().default(""),
  /** JSON `Partial<Record<ResourceId, number>>`. */
  produces: text("produces").notNull().default("{}"),
  /** JSON `Partial<Record<ResourceId, number>>`. */
  consumes: text("consumes").notNull().default("{}"),
});

/**
 * Bâtiments de colonie (chantier 23.7). `id` reste néanmoins un des 12 ids historiques
 * pour cette passe — contrairement aux vaisseaux/factions, `BuildingId` est tissé dans
 * `Colony.buildings`/`BuildQueueItem`/`EmpireEffects` et le schéma protocole
 * (`z.enum(BUILDING_IDS)`) : desserrer le tuple ici serait un chantier à part, pas
 * inclus dans cette passe. Seules les VALEURS sont éditables depuis l'admin.
 */
export const contentBuildings = pgTable("content_buildings", {
  id: text("id").primaryKey(),
  nameFr: text("name_fr").notNull(),
  descriptionFr: text("description_fr").notNull().default(""),
  /** JSON `Partial<Record<ResourceId, number>>`. */
  cost: text("cost").notNull().default("{}"),
  buildMs: integer("build_ms").notNull(),
  /** JSON `Partial<Record<ResourceId, number>>`, null = pas de production. */
  outputs: text("outputs"),
  /** JSON `Partial<Record<ResourceId, number>>`, null = pas de consommation. */
  inputs: text("inputs"),
  /** Ressource dont la production est multipliée par le gisement de la planète. */
  depositScaled: text("deposit_scaled"),
  jobsPerInstance: integer("jobs_per_instance"),
});

/**
 * Vaisseaux civils historiques (chantier 23.8) — même recette que les vaisseaux de
 * guerre : `id` libre (id-minting), `ShipId` est déjà `string` partout (aucun tuple
 * fermé à desserrer, contrairement aux bâtiments).
 */
export const contentShips = pgTable("content_ships", {
  id: text("id").primaryKey(),
  nameFr: text("name_fr").notNull(),
  descriptionFr: text("description_fr").notNull().default(""),
  capacity: doublePrecision("capacity").notNull(),
  /** JSON `Partial<Record<ResourceId, number>>`. */
  cost: text("cost").notNull().default("{}"),
  buildMs: integer("build_ms").notNull(),
  requiresTech: text("requires_tech"),
  speedMult: doublePrecision("speed_mult").notNull(),
  fuelPerJump: doublePrecision("fuel_per_jump").notNull(),
});
