import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * L'univers n'est pas stocké : il est régénéré depuis la seed (déterministe).
 * La DB ne contient que l'état dynamique de la partie.
 */
export const games = sqliteTable("games", {
  id: text("id").primaryKey(),
  seed: text("seed").notNull(),
  tick: integer("tick").notNull().default(0),
  lastTickAt: integer("last_tick_at").notNull(),
  createdAt: integer("created_at").notNull(),
  /**
   * Nombre de galaxies générées (chantier 9). L'univers est la suite infinie de la
   * seed tronquée ici ; ce compteur croît quand le front de peuplement avance.
   */
  galaxyCount: integer("galaxy_count").notNull().default(3),
});

/**
 * Comptes joueurs (chantier 8). Le mot de passe est stocké en `scrypt$sel$hash`
 * (voir `src/auth.ts`) — jamais en clair, jamais réversible.
 */
export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  /** Normalisé en minuscules, unique. */
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at").notNull(),
  lastLoginAt: integer("last_login_at"),
});

/** Sessions ouvertes : jeton opaque → compte. TTL glissant, purge au boot. */
export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  accountId: text("account_id").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

/**
 * Empires (joueurs) partageant l'univers d'une partie.
 * Chantier 7 : socle multi-locataire. En solo, un seul player possède tout.
 * Les champs d'empire (influence, recherche, réputation, exploration) migreront
 * de `games` vers cette table au sous-jalon 7b (moteur multi-empire).
 */
export const players = sqliteTable("players", {
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
  joinedAt: integer("joined_at").notNull(),
  // État d'empire, propre à chaque joueur (migré depuis `games` — chantier 7b).
  /** JSON : ids des techs acquises. */
  researched: text("researched").notNull().default("[]"),
  /** JSON ActiveResearch ou null : recherche en cours. */
  research: text("research"),
  /** JSON : chaîne de techs planifiées, lancées l'une après l'autre (chantier 11). */
  researchQueue: text("research_queue").notNull().default("[]"),
  influence: real("influence").notNull().default(0),
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
export const relations = sqliteTable("relations", {
  gameId: text("game_id").notNull(),
  empireA: text("empire_a").notNull(),
  empireB: text("empire_b").notNull(),
  state: text("state").notNull().default("neutral"),
  since: integer("since").notNull(),
  until: integer("until"),
});

/** Propositions de pacte (NAP/alliance) en attente d'une réponse (chantier 16). */
export const relationProposals = sqliteTable("relation_proposals", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  fromEmpireId: text("from_empire_id").notNull(),
  toEmpireId: text("to_empire_id").notNull(),
  kind: text("kind").notNull(),
  createdAt: integer("created_at").notNull(),
});

/** Objectifs éphémères personnels, un seul actif par empire à la fois (chantier 17). */
export const objectives = sqliteTable("objectives", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  empireId: text("empire_id").notNull(),
  kind: text("kind").notNull(),
  targetCount: real("target_count"),
  targetSystemId: text("target_system_id"),
  reward: real("reward").notNull(),
  createdAt: integer("created_at").notNull(),
  deadline: integer("deadline").notNull(),
  status: text("status").notNull().default("open"),
});

/** Systèmes revendiqués par un joueur (bonus locaux, entretien en influence). */
export const claims = sqliteTable("claims", {
  systemId: text("system_id").primaryKey(),
  gameId: text("game_id").notNull(),
  /** Empire propriétaire du claim (nullable pour la migration, backfill au boot). */
  ownerId: text("owner_id"),
  claimedAt: integer("claimed_at").notNull(),
});

/** Méga-projets de portail vers les galaxies lointaines. */
export const gateways = sqliteTable("gateways", {
  galaxyId: text("galaxy_id").primaryKey(),
  gameId: text("game_id").notNull(),
  /** JSON : ressources déjà livrées. */
  progress: text("progress").notNull().default("{}"),
  activatesAt: integer("activates_at"),
  active: integer("active").notNull().default(0),
});

/** Flottes militaires du joueur (ships/directives/queue/movement en JSON). */
export const fleets = sqliteTable("fleets", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  /** Empire propriétaire (nullable pour la migration, backfill au boot). */
  ownerId: text("owner_id"),
  name: text("name").notNull(),
  systemId: text("system_id").notNull(),
  homeColonyId: text("home_colony_id").notNull(),
  ships: text("ships").notNull().default("{}"),
  directives: text("directives").notNull(),
  queue: text("queue").notNull().default("[]"),
  movement: text("movement"),
});

/** Humeur courante des factions (chantier 15) : partagée, comme les portails. */
export const factionStates = sqliteTable("faction_states", {
  factionId: text("faction_id").primaryKey(),
  gameId: text("game_id").notNull(),
  mood: text("mood").notNull().default("neutral"),
  moodUntil: integer("mood_until"),
});

/** Repaires de pirates PNJ. */
export const pirateLairs = sqliteTable("pirate_lairs", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  systemId: text("system_id").notNull(),
  ships: text("ships").notNull(),
  directives: text("directives").notNull(),
  bounty: real("bounty").notNull(),
});

/** Rapports de bataille archivés. */
export const battles = sqliteTable("battles", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  at: integer("at").notNull(),
  systemId: text("system_id").notNull(),
  attackerName: text("attacker_name").notNull(),
  defenderName: text("defender_name").notNull(),
  report: text("report").notNull(),
});

/** resources/buildings/queue en JSON : le schéma de simulation évolue vite, la DB reste stable. */
export const colonies = sqliteTable("colonies", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  /** Empire propriétaire (nullable pour la migration, backfill au boot). */
  ownerId: text("owner_id"),
  planetId: text("planet_id").notNull(),
  name: text("name").notNull(),
  resources: text("resources").notNull(),
  /** JSON : stock en orbite — la seule soute chargeable par un vaisseau (chantier 12). */
  orbitalResources: text("orbital_resources").notNull().default("{}"),
  /** JSON : consignes d'ascension sol↔orbite par ressource. */
  liftRules: text("lift_rules").notNull().default("{}"),
  buildings: text("buildings").notNull(),
  queue: text("queue").notNull(),
  population: real("population").notNull().default(0),
  satisfaction: real("satisfaction").notNull().default(50),
  /** JSON : flotte civile, vaisseaux occupés, file de production navale. */
  ships: text("ships").notNull().default("{}"),
  shipsBusy: text("ships_busy").notNull().default("[]"),
  shipQueue: text("ship_queue").notNull().default("[]"),
  createdAt: integer("created_at").notNull(),
});

/** Routes logistiques automatiques (rule/ships/activeCycle en JSON). */
export const routes = sqliteTable("routes", {
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
export const outposts = sqliteTable("outposts", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  beltId: text("belt_id").notNull(),
  ownerColonyId: text("owner_colony_id").notNull(),
  oreStock: real("ore_stock").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

export const missions = sqliteTable("missions", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  kind: text("kind").notNull(),
  fromColonyId: text("from_colony_id").notNull(),
  targetId: text("target_id").notNull(),
  departedAt: integer("departed_at").notNull(),
  arrivesAt: integer("arrives_at").notNull(),
  /** JSON : cargaison (missions sell / buy_return). */
  cargo: text("cargo"),
  /** Crédits emportés (mission buy) ou reliquat à rembourser (buy_return). */
  budget: real("budget"),
  /** Ressource à acheter au spot (mission buy). */
  buyResource: text("buy_resource"),
  /** Soute du cargo réservé (mission buy). */
  capacity: real("capacity"),
  /** Contrat honoré (mission deliver_contract, chantier 14). */
  contractId: text("contract_id"),
});

/** Stocks dynamiques des stations PNJ — les prix en dérivent (sim/market). */
export const stationStates = sqliteTable("station_states", {
  stationId: text("station_id").primaryKey(),
  gameId: text("game_id").notNull(),
  stocks: text("stocks").notNull(),
});

/**
 * Contrats de demande (chantier 14) : l'émetteur séquestre `pricePerUnit × quantity`
 * crédits à la publication ; n'importe quel autre empire peut livrer depuis son orbite.
 * Tout scalaire — pas de blob JSON, la forme ne bouge pas au gré de l'équilibrage.
 */
export const contracts = sqliteTable("contracts", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  issuerId: text("issuer_id").notNull(),
  issuerName: text("issuer_name").notNull(),
  issuerColor: text("issuer_color").notNull(),
  /** Colonie émettrice : destination de la livraison. */
  colonyId: text("colony_id").notNull(),
  colonyName: text("colony_name").notNull(),
  systemId: text("system_id").notNull(),
  resource: text("resource").notNull(),
  quantity: real("quantity").notNull(),
  /** Reste à livrer — décompté à l'acceptation d'un convoi, pas à son arrivée. */
  remaining: real("remaining").notNull(),
  pricePerUnit: real("price_per_unit").notNull(),
  createdAt: integer("created_at").notNull(),
  deadline: integer("deadline").notNull(),
  status: text("status").notNull().default("open"),
});

export const transfers = sqliteTable("transfers", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  fromColonyId: text("from_colony_id").notNull(),
  toColonyId: text("to_colony_id").notNull(),
  resources: text("resources").notNull(),
  departedAt: integer("departed_at").notNull(),
  arrivesAt: integer("arrives_at").notNull(),
});
