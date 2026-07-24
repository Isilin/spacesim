export const RESOURCES = [
  "energy",
  "ore",
  "metals",
  "components",
  "food",
  "goods",
  "credits",
  "science",
] as const;

export type ResourceId = (typeof RESOURCES)[number];

export const PLANET_TYPES = [
  "telluric",
  "oceanic",
  "volcanic",
  "frozen",
  "arid",
  "gas",
] as const;

export type PlanetType = (typeof PLANET_TYPES)[number];

/** Modificateurs de rendement par ressource extraite sur place (1 = base). */
export type Deposits = Partial<Record<ResourceId, number>>;

/** Corps colonisable : planète ou lune (les lunes orbitent une planète parente). */
export interface Planet {
  id: string;
  systemId: string;
  name: string;
  kind: "planet" | "moon";
  /** Pour les lunes : la planète orbitée. */
  parentPlanetId?: string;
  type: PlanetType;
  /** 0–100 : plafonne pop max, module croissance et entretien. */
  habitability: number;
  /** Nombre d'emplacements de bâtiments. */
  slots: number;
  deposits: Deposits;
  /** Rayon d'orbite (autour de l'étoile, ou de la planète parente pour une lune). */
  orbitRadius: number;
  /** Position angulaire sur l'orbite, en radians. */
  orbitAngle: number;
}

/** Ceinture d'astéroïdes — décor riche en gisements (exploitation minière : v2). */
export interface AsteroidBelt {
  id: string;
  systemId: string;
  name: string;
  orbitRadius: number;
  deposits: Deposits;
}

/** Station de commerce PNJ, tenue par une faction. */
export interface TradeStation {
  id: string;
  systemId: string;
  factionId: string;
  name: string;
}

export interface StarSystem {
  id: string;
  name: string;
  x: number;
  y: number;
  /** Planètes et lunes (les lunes référencent leur parente via parentPlanetId). */
  planets: Planet[];
  belts: AsteroidBelt[];
  /** Au plus une station de commerce par système. */
  station?: TradeStation;
}

export interface Galaxy {
  id: string;
  name: string;
  /** Position sur la carte de l'univers. */
  x: number;
  y: number;
  systems: StarSystem[];
  /** Liaisons de saut intra-galactiques (graphe non orienté, connexe). */
  links: [string, string][];
  /** Système d'ancrage : seul point d'arrivée/départ des portails inter-galactiques. */
  anchorSystemId: string;
  /** Multiplicateur de richesse des gisements (galaxies lointaines plus riches). */
  depositBonus: number;
}

/** Méga-projet de portail vers une galaxie lointaine (contributions par convois). */
export interface Gateway {
  /** Galaxie cible. */
  galaxyId: string;
  /** Ressources déjà livrées au chantier. */
  progress: Partial<Record<ResourceId, number>>;
  /** Timer final d'activation une fois le coût couvert (timestamp ms), sinon null. */
  activatesAt: number | null;
  active: boolean;
}

export interface Universe {
  seed: string;
  galaxies: Galaxy[];
}

export interface ActiveResearch {
  techId: string;
  startedAt: number;
  finishesAt: number;
}

/**
 * Empire (joueur) partageant l'univers d'une partie (chantier 7 — multi territorial).
 * En solo, un unique Player possède toutes les entités.
 */
export interface Player {
  id: string;
  name: string;
  /** Couleur d'affichage du territoire sur la carte. */
  color: string;
  joinedAt: number;
}

export interface GameState {
  id: string;
  seed: string;
  tick: number;
  /** Timestamp ms du dernier tick appliqué. */
  lastTickAt: number;
  /** Ids des techs acquises (voir content/techs). */
  researched: string[];
  /** Recherche en cours (une seule à la fois), timer réel. */
  research: ActiveResearch | null;
  /** Chaîne de techs planifiée, lancée l'une après l'autre (chantier 11). */
  researchQueue: string[];
  /** Influence de l'empire (générée par la population satisfaite + monuments). */
  influence: number;
  /** Réputation par faction (gagnée en commerçant). */
  factionRep: Record<string, number>;
  /** Systèmes revendiqués (bonus locaux, entretien en influence). */
  claimedSystemIds: string[];
}

export const BUILDING_IDS = [
  "mine",
  "power_plant",
  "farm",
  "habitat",
  "storage_depot",
  "laboratory",
  "smelter",
  "component_factory",
  "goods_factory",
  "shipyard",
  "monument",
  "orbital_dock",
] as const;

export type BuildingId = (typeof BUILDING_IDS)[number];

export const SHIP_IDS = ["cargo_small", "cargo_large", "hauler", "courier"] as const;

export type ShipId = (typeof SHIP_IDS)[number];

/** Une instance de vaisseau en production au chantier naval. */
export interface ShipQueueItem {
  shipId: ShipId;
  startedAt: number;
  finishesAt: number;
}

/** Vaisseau parti en convoi/mission : indisponible jusqu'à son retour. */
export interface BusyShip {
  shipId: ShipId;
  freeAt: number;
}

/** Une instance de bâtiment en construction (pas de niveaux : on empile les instances). */
export interface BuildQueueItem {
  buildingId: BuildingId;
  /** Timestamps ms absolus — timers réels, résolus par le tick qui les dépasse. */
  startedAt: number;
  finishesAt: number;
}

/**
 * Règle d'ascension d'une ressource (chantier 12) : ce qu'on garde au sol et dans
 * quel sens le surplus circule entre la surface et l'orbite.
 */
export interface LiftRule {
  /** Quantité conservée au sol (sens `up`) ou visée au sol (sens `down`). */
  keepGround: number;
  /** `up` : monter le surplus en orbite. `down` : redescendre l'orbite vers le sol. */
  direction: "up" | "down";
}

export interface Colony {
  id: string;
  /** Empire propriétaire (chantier 7 ; optionnel pendant la transition mono→multi). */
  ownerId?: string;
  planetId: string;
  name: string;
  /** Stock au sol : ce que produisent et consomment les bâtiments. */
  resources: Record<ResourceId, number>;
  /**
   * Stock en orbite (chantier 12) : la seule soute que les vaisseaux savent charger.
   * Alimenté depuis le sol par le dock orbital, selon `liftRules`.
   */
  orbitalResources: Record<ResourceId, number>;
  /** Consignes d'ascension par ressource ; absente = ressource laissée au sol. */
  liftRules: Partial<Record<ResourceId, LiftRule>>;
  /** Nombre d'instances par type de bâtiment (0 = absent). */
  buildings: Partial<Record<BuildingId, number>>;
  queue: BuildQueueItem[];
  /** Nombre de colons (fractionnaire en interne, affiché arrondi). */
  population: number;
  /** 0–100, recalculée à chaque tick — stockée pour l'affichage. */
  satisfaction: number;
  /** Flotte civile possédée (total, occupés compris). */
  ships: Partial<Record<ShipId, number>>;
  /** Vaisseaux en convoi/mission, libérés à `freeAt`. */
  shipsBusy: BusyShip[];
  /** File de production du chantier naval. */
  shipQueue: ShipQueueItem[];
}

export type RouteRule =
  | { type: "maintain"; minAtDestination: number; keepAtSource: number }
  | { type: "fixed"; amount: number }
  | { type: "surplus"; keepAtSource: number };

/** Route logistique automatique : cycles aller-retour tant que la règle le demande. */
export interface Route {
  id: string;
  /** Colonie qui fournit les cargos, paie les frais et encaisse les ventes. */
  ownerColonyId: string;
  /** Source : colonie ou avant-poste minier (ressource forcée au minerai). */
  fromId: string;
  fromKind: "colony" | "outpost";
  /** Destination : colonie ou station de commerce. */
  toId: string;
  toKind: "colony" | "station";
  resource: ResourceId;
  rule: RouteRule;
  /** Vaisseaux réservés à la route (retirés du pool de la colonie propriétaire). */
  ships: Partial<Record<ShipId, number>>;
  /** Cycle en cours, null = au repos à la source. */
  activeCycle: { departedAt: number; arrivesAt: number; backAt: number; carrying: number } | null;
  paused: boolean;
}

/** Avant-poste minier robotisé sur une ceinture d'astéroïdes. */
export interface MiningOutpost {
  id: string;
  beltId: string;
  /** Colonie qui l'a fondé : paie l'entretien. */
  ownerColonyId: string;
  /** Minerai extrait en attente d'évacuation. */
  oreStock: number;
}

/** Flotte militaire du joueur : vaisseaux (content/warships) stationnés dans un système. */
export interface Fleet {
  id: string;
  /** Empire propriétaire (chantier 7 ; optionnel pendant la transition mono→multi). */
  ownerId?: string;
  name: string;
  /** Système où la flotte est stationnée (ou d'origine pendant un déplacement). */
  systemId: string;
  /** Colonie de rattachement (paie la production). */
  homeColonyId: string;
  ships: Partial<Record<string, number>>;
  /** Directive par phase de combat (long / medium / short). */
  directives: Record<string, string>;
  /** File de production de vaisseaux (au chantier naval du système). */
  queue: { warshipId: string; startedAt: number; finishesAt: number }[];
  /** Déplacement en cours vers un système, sinon null. */
  movement: { toSystemId: string; departedAt: number; arrivesAt: number } | null;
}

/**
 * Présence étrangère visible d'un empire, là où il a de la visibilité (chantier 7d) :
 * vue redactée d'une entité appartenant à un AUTRE empire, suffisante pour l'afficher
 * sur la carte et la cibler en PvP.
 */
export interface ForeignFleet {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerColor: string;
  name: string;
  systemId: string;
  ships: Partial<Record<string, number>>;
}

export interface ForeignColony {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerColor: string;
  name: string;
  systemId: string;
  planetId: string;
}

/** Système revendiqué visible d'un empire, avec la couleur du propriétaire (chantier 7e). */
export interface Territory {
  systemId: string;
  ownerId: string;
  ownerColor: string;
}

/** Ligne de classement d'un empire (données publiques agrégées — chantier 7e). */
export interface LeaderboardEntry {
  id: string;
  name: string;
  color: string;
  colonies: number;
  population: number;
  claimed: number;
  influence: number;
  /** Score composite servant au tri du classement. */
  score: number;
  /** L'empire qui reçoit ce classement est-il en guerre avec celui-ci ? (chantier 7e) */
  atWar: boolean;
}

/** Repaire de pirates PNJ : menace un système, à nettoyer par une flotte. */
export interface PirateLair {
  id: string;
  systemId: string;
  ships: Partial<Record<string, number>>;
  directives: Record<string, string>;
  /** Butin en crédits libéré à la destruction. */
  bounty: number;
}

/** Rapport de bataille archivé (rejouable dans l'UI), le plus récent en tête. */
export interface StoredBattle {
  id: string;
  at: number;
  systemId: string;
  attackerName: string;
  defenderName: string;
  report: unknown;
}

/** Convoi cargo ponctuel entre deux colonies (vaisseau abstrait : coût + timer). */
export interface Transfer {
  id: string;
  fromColonyId: string;
  toColonyId: string;
  resources: Partial<Record<ResourceId, number>>;
  departedAt: number;
  arrivesAt: number;
}

/**
 * Mission de vaisseau abstrait.
 * probe : cible = système. colonize : cible = planète.
 * sell : cargaison vers une station, créditée au prix spot à l'arrivée.
 * buy : budget crédits vers une station ; buy_return : trajet retour chargé.
 */
export interface Mission {
  id: string;
  kind:
    | "probe"
    | "colonize"
    | "sell"
    | "buy"
    | "buy_return"
    | "build_outpost"
    | "contribute_gateway";
  fromColonyId: string;
  /** Id de système (probe), de planète (colonize) ou de station (commerce). */
  targetId: string;
  departedAt: number;
  arrivesAt: number;
  /** sell / buy_return : cargaison transportée. */
  cargo?: Partial<Record<ResourceId, number>>;
  /** buy : crédits emportés pour l'achat. */
  budget?: number;
  /** buy : ressource à acheter au spot. */
  buyResource?: ResourceId;
  /** buy : soute du cargo réservé — borne la quantité achetée. */
  capacity?: number;
}

/** État dynamique d'une station : ses stocks (les prix en dérivent). */
export interface StationMarket {
  stationId: string;
  stocks: Record<ResourceId, number>;
}

/** Messages WebSocket serveur → client. L'univers envoyé est expurgé du non-exploré. */
export type ServerMessage =
  | {
      type: "hello";
      /** Identité de l'empire piloté par cette connexion (jeton à persister côté client). */
      playerId: string;
      universe: Universe;
      game: GameState;
      colonies: Colony[];
      transfers: Transfer[];
      missions: Mission[];
      exploredSystemIds: string[];
      /** Marchés des stations situées dans des systèmes explorés. */
      markets: StationMarket[];
      routes: Route[];
      outposts: MiningOutpost[];
      gateways: Gateway[];
      fleets: Fleet[];
      pirateLairs: PirateLair[];
      battles: StoredBattle[];
      /** Entités étrangères visibles dans le brouillard de l'empire (chantier 7d). */
      foreignFleets: ForeignFleet[];
      foreignColonies: ForeignColony[];
      /** Classement de tous les empires de la partie (chantier 7e). */
      leaderboard: LeaderboardEntry[];
      /** Systèmes revendiqués visibles, colorés par empire propriétaire (chantier 7e). */
      territories: Territory[];
    }
  | {
      type: "tick";
      game: GameState;
      colonies: Colony[];
      transfers: Transfer[];
      missions: Mission[];
      exploredSystemIds: string[];
      markets: StationMarket[];
      routes: Route[];
      outposts: MiningOutpost[];
      gateways: Gateway[];
      fleets: Fleet[];
      pirateLairs: PirateLair[];
      battles: StoredBattle[];
      /** Entités étrangères visibles dans le brouillard de l'empire (chantier 7d). */
      foreignFleets: ForeignFleet[];
      foreignColonies: ForeignColony[];
      /** Classement de tous les empires de la partie (chantier 7e). */
      leaderboard: LeaderboardEntry[];
      /** Systèmes revendiqués visibles, colorés par empire propriétaire (chantier 7e). */
      territories: Territory[];
      /** Présent quand l'exploration a changé depuis le dernier message. */
      universe?: Universe;
    }
  | { type: "actionError"; message: string };

/** Messages WebSocket client → serveur. */
export type ClientMessage =
  | { type: "build"; colonyId: string; buildingId: BuildingId }
  | {
      type: "transfer";
      fromColonyId: string;
      toColonyId: string;
      resources: Partial<Record<ResourceId, number>>;
      /** Convoi choisi (chantier 12) ; omis = le plus gros cargo disponible. */
      ships?: Partial<Record<ShipId, number>>;
    }
  | { type: "probe"; colonyId: string; systemId: string }
  | { type: "colonize"; colonyId: string; planetId: string }
  | { type: "research"; techId: string }
  | { type: "queueResearch"; techId: string }
  | { type: "clearResearchQueue" }
  /** Consigne d'ascension sol↔orbite ; `rule: null` retire la consigne (chantier 12). */
  | { type: "setLiftRule"; colonyId: string; resource: ResourceId; rule: LiftRule | null }
  | { type: "sell"; colonyId: string; stationId: string; resources: Partial<Record<ResourceId, number>> }
  | { type: "buy"; colonyId: string; stationId: string; resource: ResourceId; budget: number }
  | { type: "buildShip"; colonyId: string; shipId: ShipId }
  | { type: "buildOutpost"; colonyId: string; beltId: string }
  | {
      type: "createRoute";
      ownerColonyId: string;
      fromId: string;
      fromKind: "colony" | "outpost";
      toId: string;
      toKind: "colony" | "station";
      resource: ResourceId;
      rule: RouteRule;
      ships: Partial<Record<ShipId, number>>;
    }
  | { type: "setRoutePaused"; routeId: string; paused: boolean }
  | { type: "deleteRoute"; routeId: string }
  | { type: "claimSystem"; systemId: string }
  | { type: "unclaimSystem"; systemId: string }
  | {
      type: "contributeGateway";
      colonyId: string;
      galaxyId: string;
      resources: Partial<Record<ResourceId, number>>;
    }
  | { type: "createFleet"; colonyId: string; name: string }
  | { type: "buildWarship"; fleetId: string; warshipId: string }
  | { type: "setFleetDirectives"; fleetId: string; directives: Record<string, string> }
  | { type: "moveFleet"; fleetId: string; toSystemId: string }
  | { type: "attackLair"; fleetId: string; lairId: string }
  | { type: "attackFleet"; fleetId: string; targetFleetId: string }
  | { type: "attackColony"; fleetId: string; targetColonyId: string }
  | { type: "declareWar"; targetEmpireId: string }
  | { type: "makePeace"; targetEmpireId: string }
  | { type: "disbandFleet"; fleetId: string };
