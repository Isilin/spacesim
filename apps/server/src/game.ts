import {
  allBelts,
  allPlanets,
  allStations,
  allSystems,
  applyColonyTick,
  applyLift,
  beltRichness,
  breakRelationReason,
  canResearch,
  CLAIM_COST,
  CLAIM_PRODUCTION_BONUS,
  clampContractDuration,
  COLONY_SHIP_COST,
  colonizeInfluenceCost,
  colonyShipDurationMs,
  computeEffects,
  contiguousClaims,
  contractAcceptable,
  contractEscrow,
  contractPayout,
  convoyCapacity,
  convoyDurationMs,
  convoyFees,
  convoyFuel,
  CONTIGUOUS_CLAIM_BONUS,
  createRng,
  DECLARE_WAR_INFLUENCE_COST,
  declareWarReason,
  decideColonyEconomy,
  ECONOMY_TICK_TICKS,
  deliverToOrbit,
  emptyOrbital,
  emptyResources,
  embargoBlocks,
  enqueueBuilding,
  enqueueShip,
  FACTION_CONTRACT_DURATION_MS,
  FACTION_CONTRACT_PRICE_MULT,
  FACTION_CONTRACT_QUANTITY_MAX,
  FACTION_CONTRACT_QUANTITY_MIN,
  FACTION_IDS,
  FACTION_MOOD_DURATION_MS,
  FACTIONS,
  factionTick,
  fleetCapacity,
  fleetIsEmpty,
  fleetPower,
  GATEWAY_BUILD_MS,
  GATEWAY_COST,
  gatewayCost,
  gatewayCovered,
  gatewayLinks,
  gatewayRemaining,
  galaxiesToAdd,
  galaxyParentIndex,
  researchPath,
  generateGalaxyAt,
  generateUniverse,
  idleShips,
  INITIAL_GALAXIES,
  isContractExpired,
  pickStarterGalaxy,
  influencePerTick,
  jumpDistanceInUniverse,
  makePeaceReason,
  MARKET_RESOURCES,
  marketTick,
  initialStocks,
  MAX_CATCHUP_TICKS,
  MAX_OPEN_CONTRACTS_PER_EMPIRE,
  moodRebateBonus,
  NEW_COLONY_ORBITAL,
  NEW_COLONY_POPULATION,
  NEW_COLONY_RESOURCES,
  npcAcceptsProposal,
  NPC_CONTRACT_DURATION_MS,
  NPC_CONTRACT_PRICE_MULT,
  OUTPOST_COST,
  OUTPOST_UPKEEP_CREDITS,
  outpostTick,
  PIRATE_SPAWN_CHANCE,
  PIRATE_TAX_PER_TICK,
  RAID_FRACTION,
  pirateBounty,
  pirateComposition,
  pirateDirectives,
  pickShip,
  randInt,
  PROBE_COST_CREDITS,
  probeDurationMs,
  proposeRelationReason,
  redactUniverse,
  relationKey,
  REP_PER_CREDIT,
  repBonus,
  resolveBattle,
  resolvePurchase,
  resolveQueue,
  resolveSale,
  resolveShips,
  RESOURCES,
  routeCargoQuantity,
  SHIPS,
  stationPrice,
  storageCap,
  takeFromOrbit,
  TARGET_STOCK,
  WAR_COOLDOWN_MS,
  WARSHIPS,
  TICK_MS,
  transferCostCredits,
  transferDurationMs,
  TECHS,
  type AsteroidBelt,
  type BuildingId,
  type Colony,
  type Contract,
  type EmpireEffects,
  type CombatPhase,
  type FactionId,
  type FactionState,
  type Fleet,
  type FleetComposition,
  type ForeignColony,
  type ForeignFleet,
  type GalaxyOccupancy,
  type LeaderboardEntry,
  type LiftRule,
  type Territory,
  type GameState,
  type Gateway,
  type PirateLair,
  type PriceContext,
  type StoredBattle,
  type WarshipId,
  type MarketResource,
  type MiningOutpost,
  type Mission,
  type Planet,
  type ProposalKind,
  type ResourceId,
  type Relation,
  type RelationProposal,
  type RelationState,
  type Rng,
  type Route,
  type RouteRule,
  type ShipId,
  type StationMarket,
  type Stocks,
  type TechId,
  type TradeStation,
  type Transfer,
  type Universe,
} from "@spacesim/shared";
import { and, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, schema } from "./db/index.js";
import { Empire, type Clock } from "./empire.js";

export interface EngineSnapshot {
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
  /** Classement de tous les empires (chantier 7e). */
  leaderboard: LeaderboardEntry[];
  /** Systèmes revendiqués visibles, colorés par empire (chantier 7e). */
  territories: Territory[];
  /** Contrats de fourniture actifs de toute la partie (chantier 14, non brouillardés). */
  contracts: Contract[];
  /** Humeur courante de chaque faction (chantier 15, non brouillardée). */
  factionStates: FactionState[];
  /** Relations impliquant l'empire (chantier 16) — redactées, pas de fuite vers un tiers. */
  relations: Relation[];
  /** Propositions de pacte en attente le concernant (chantier 16), émises ou reçues. */
  proposals: RelationProposal[];
  /** Présent si l'exploration a changé depuis la dernière notification. */
  universe?: Universe;
}

/** Directives par défaut d'une flotte neuve. */
const DEFAULT_DIRECTIVES: Record<CombatPhase, string> = {
  long: "focus_fire",
  medium: "focus_fire",
  short: "focus_fire",
};

/** Batailles archivées conservées. */
const MAX_BATTLES = 20;

/** Empire par défaut d'une partie solo (chantier 7 — socle multi-locataire). */
const DEFAULT_PLAYER_NAME = "Empire";
const DEFAULT_PLAYER_COLOR = "#4fd1ff";

/** Couleurs de territoire attribuées aux empires supplémentaires (outil de dev). */
const DEV_EMPIRE_COLORS = ["#4fd1ff", "#ff6b6b", "#ffd93d", "#6bcB77", "#c77dff", "#ff922b"];

/**
 * Empires PNJ amorcés sur une partie neuve (chantier 14) : peu nombreux, pilotés par
 * l'IA économique — un monde vivant dès le premier tick, pas encore une population.
 */
const NPC_EMPIRE_COUNT = 3;
const NPC_EMPIRE_NAMES = [
  "Confédération de Kess",
  "Dominion Vashtar",
  "République Solenne",
  "Directoire Zhorn",
  "Ligue Cindra",
  "Hégémonie Aurel",
];

/** Signal « l'état a changé » : chaque connexion recompose alors le snapshot de son empire. */
export type StateListener = () => void;

/**
 * Détient l'état de la partie et fait avancer la simulation.
 * Serveur autoritaire : le client ne fait qu'afficher.
 */
export class GameEngine {
  /** Non figé : `growUniverse` le remplace quand de nouvelles galaxies s'ouvrent (chantier 9). */
  universe: Universe;
  /** Horloge et identité de l'univers partagé. */
  private clock: Clock;
  private planetsById: Map<string, Planet>;
  private stationsById: Map<string, TradeStation>;
  /** Index de galaxie par système — sert aux règles d'expansion (chantier 9). */
  private galaxyIndexOfSystem = new Map<string, number>();
  private marketMap = new Map<string, Stocks>();
  // Portails inter-galactiques : mégastructures d'univers PARTAGÉES (game-scoped, décision
  // Phase D). N'importe quel empire y contribue via `contributeGateway` ; une fois actif, le
  // portail bénéficie à tous. Pas de portail par-empire — cohérent avec les marchés/pirates PNJ.
  private gatewayMap = new Map<string, Gateway>();
  /** Contrats de fourniture (chantier 14) : partagés comme les portails, pas de fog. */
  private contractMap = new Map<string, Contract>();
  /** Humeur des factions (chantier 15) : partagée, pas de fog. */
  private factionStateMap = new Map<string, FactionState>();
  private lairMap = new Map<string, PirateLair>();
  private battleLog: StoredBattle[] = [];
  /** Relations entre empires (paires canoniques `a|b`, a<b) ; absence = neutre (chantier 16). */
  private relationMap = new Map<string, Relation>();
  /** Propositions de pacte en attente (chantier 16). */
  private proposalMap = new Map<string, RelationProposal>();
  private beltsById: Map<string, AsteroidBelt>;
  private listeners = new Set<StateListener>();
  private interval: NodeJS.Timeout | null = null;
  /** Empires partageant cet univers (chantier 7b). Un seul instancié à ce stade. */
  private empires = new Map<string, Empire>();
  /** Empire propriétaire par défaut (solo). Posé par `ensureDefaultPlayer`. */
  private defaultEmpire!: Empire;

  // Données par-empire portées par l'empire par défaut (délégation le temps du mono-empire).
  private get colonyMap(): Map<string, Colony> {
    return this.defaultEmpire.colonyMap;
  }
  private get transferMap(): Map<string, Transfer> {
    return this.defaultEmpire.transferMap;
  }
  private get missionMap(): Map<string, Mission> {
    return this.defaultEmpire.missionMap;
  }
  private get routeMap(): Map<string, Route> {
    return this.defaultEmpire.routeMap;
  }
  private get outpostMap(): Map<string, MiningOutpost> {
    return this.defaultEmpire.outpostMap;
  }
  private get fleetMap(): Map<string, Fleet> {
    return this.defaultEmpire.fleetMap;
  }
  private get effects(): EmpireEffects {
    return this.defaultEmpire.effects;
  }
  private set effects(value: EmpireEffects) {
    this.defaultEmpire.effects = value;
  }
  private get explored(): Set<string> {
    return this.defaultEmpire.explored;
  }
  private get explorationDirty(): boolean {
    return this.defaultEmpire.explorationDirty;
  }
  private set explorationDirty(value: boolean) {
    this.defaultEmpire.explorationDirty = value;
  }

  private constructor(clock: Clock) {
    this.clock = { ...clock };
    this.universe = generateUniverse(clock.seed, clock.galaxyCount);
    this.planetsById = new Map();
    this.stationsById = new Map();
    this.beltsById = new Map();
    this.reindexUniverse();
  }

  /** (Ré)indexe les entités d'univers — appelé à la construction et après chaque extension. */
  private reindexUniverse(): void {
    this.planetsById = new Map(allPlanets(this.universe).map((p) => [p.id, p]));
    this.stationsById = new Map(allStations(this.universe).map((s) => [s.id, s]));
    this.beltsById = new Map(allBelts(this.universe).map((b) => [b.id, b]));
    this.galaxyIndexOfSystem = new Map(
      this.universe.galaxies.flatMap((g, index) => g.systems.map((s) => [s.id, index] as const)),
    );
  }

  /** Charge la partie existante ou en crée une, puis rattrape le temps hors-ligne (borné). */
  static load(): GameEngine {
    let row = db.select().from(schema.games).limit(1).get();
    const isNew = !row;
    if (!row) {
      row = {
        id: randomUUID(),
        seed: randomUUID().slice(0, 8),
        tick: 0,
        lastTickAt: Date.now(),
        createdAt: Date.now(),
        galaxyCount: INITIAL_GALAXIES,
      };
      db.insert(schema.games).values(row).run();
    }
    const engine = new GameEngine({
      id: row.id,
      seed: row.seed,
      tick: row.tick,
      lastTickAt: row.lastTickAt,
      galaxyCount: row.galaxyCount,
    });
    engine.ensureDefaultPlayer();
    engine.loadPlayers();
    engine.loadRelations();
    engine.loadProposals();
    if (isNew) {
      engine.createHomeColony();
    } else {
      engine.loadColonies();
      engine.loadTransfers();
      engine.loadMissions();
      engine.loadMarkets();
      engine.loadRoutes();
      engine.loadOutposts();
      engine.loadGateways();
      engine.loadContracts();
      engine.loadFactionStates();
      engine.loadFleets();
      engine.loadPirates();
      engine.loadBattles();
    }
    // Équipement des galaxies (idempotent) : couvre aussi bien la partie neuve que les
    // galaxies apparues par extension, dont le compteur seul a survécu au redémarrage.
    engine.initMarkets();
    engine.initGateways();
    engine.initFactionStates();
    // L'univers doit toujours offrir de la place devant les joueurs (chantier 9).
    engine.ensureFrontier();
    engine.catchUp();
    return engine;
  }

  // Accesseurs publics (message `hello` d'index.ts) : vue de l'empire par défaut.
  // Chaque collection est celle du defaultEmpire ; les PNJ/l'univers sont redactés
  // à son brouillard. En 7c, ce sera la vue de l'empire de la connexion.
  get game(): GameState {
    return this.defaultEmpire.toGameState(this.clock);
  }

  get colonies(): Colony[] {
    return [...this.defaultEmpire.colonyMap.values()];
  }

  get transfers(): Transfer[] {
    return [...this.defaultEmpire.transferMap.values()];
  }

  get missions(): Mission[] {
    return [...this.defaultEmpire.missionMap.values()];
  }

  get exploredSystemIds(): string[] {
    return [...this.defaultEmpire.explored];
  }

  /** Univers vu par le client : planètes masquées hors systèmes explorés. */
  get clientUniverse(): Universe {
    return this.clientUniverseFor(this.defaultEmpire);
  }

  get routes(): Route[] {
    return [...this.defaultEmpire.routeMap.values()];
  }

  get outposts(): MiningOutpost[] {
    return [...this.defaultEmpire.outpostMap.values()];
  }

  get gateways(): Gateway[] {
    return [...this.gatewayMap.values()];
  }

  get contracts(): Contract[] {
    return [...this.contractMap.values()];
  }

  get factionStates(): FactionState[] {
    return [...this.factionStateMap.values()];
  }

  get fleets(): Fleet[] {
    return [...this.defaultEmpire.fleetMap.values()];
  }

  /** Repaires dans les systèmes explorés uniquement (fog). */
  get pirateLairs(): PirateLair[] {
    return this.pirateLairsFor(this.defaultEmpire);
  }

  get battles(): StoredBattle[] {
    return this.battleLog;
  }

  /** Liaisons inter-galactiques des portails actifs. */
  private get portalLinks(): [string, string][] {
    return gatewayLinks(this.universe, this.gateways);
  }

  /**
   * Nombre de portails empruntés entre deux systèmes (chantier 12). Tous les portails
   * partent de l'ancrage de la galaxie d'origine : rejoindre une galaxie lointaine en
   * traverse un, passer d'une lointaine à une autre en traverse deux.
   */
  private portalsCrossed(fromSystemId: string, toSystemId: string): number {
    const from = this.galaxyIndexOfSystem.get(fromSystemId);
    const to = this.galaxyIndexOfSystem.get(toSystemId);
    if (from === undefined || to === undefined || from === to) return 0;
    return from === 0 || to === 0 ? 1 : 2;
  }

  /** Marchés des seules stations situées dans des systèmes explorés. */
  get markets(): StationMarket[] {
    return this.marketsFor(this.defaultEmpire);
  }

  /** Univers redacté au brouillard de l'empire (planètes masquées hors systèmes explorés). */
  private clientUniverseFor(empire: Empire): Universe {
    return redactUniverse(this.universe, empire.explored);
  }

  /** Marchés des stations situées dans les systèmes explorés par l'empire. */
  private marketsFor(empire: Empire): StationMarket[] {
    const markets: StationMarket[] = [];
    for (const [stationId, stocks] of this.marketMap) {
      const station = this.stationsById.get(stationId);
      if (station && empire.explored.has(station.systemId)) {
        markets.push({ stationId, stocks });
      }
    }
    return markets;
  }

  /** Repaires PNJ visibles dans le brouillard de l'empire. */
  private pirateLairsFor(empire: Empire): PirateLair[] {
    return [...this.lairMap.values()].filter((l) => empire.explored.has(l.systemId));
  }

  /**
   * Compose le snapshot (forme externe WS) d'un empire : ses entités + l'horloge et
   * les PNJ partagés, redactés à son brouillard. En 7c, un snapshot distinct sera
   * diffusé par connexion ; ici un seul empire est instancié.
   */
  private snapshotFor(empire: Empire): EngineSnapshot {
    const { foreignFleets, foreignColonies } = this.foreignPresenceFor(empire);
    return {
      game: empire.toGameState(this.clock),
      colonies: [...empire.colonyMap.values()],
      transfers: [...empire.transferMap.values()],
      missions: [...empire.missionMap.values()],
      exploredSystemIds: [...empire.explored],
      markets: this.marketsFor(empire),
      routes: [...empire.routeMap.values()],
      outposts: [...empire.outpostMap.values()],
      gateways: [...this.gatewayMap.values()],
      fleets: [...empire.fleetMap.values()],
      pirateLairs: this.pirateLairsFor(empire),
      battles: this.battleLog,
      foreignFleets,
      foreignColonies,
      leaderboard: this.leaderboard(empire),
      territories: this.territoriesFor(empire),
      contracts: this.contracts,
      factionStates: this.factionStates,
      relations: this.relationsFor(empire),
      proposals: this.proposalsFor(empire),
      // L'univers n'est réémis qu'en cas de changement : nouvelle exploration (brouillard
      // levé) ou extension de l'univers (galaxies apparues).
      ...(empire.explorationDirty || empire.universeDirty
        ? { universe: this.clientUniverseFor(empire) }
        : {}),
    };
  }

  /** Relations impliquant l'empire (chantier 16) — jamais celles entre deux tiers. */
  private relationsFor(empire: Empire): Relation[] {
    return [...this.relationMap.values()].filter(
      (r) => r.empireA === empire.id || r.empireB === empire.id,
    );
  }

  /** Propositions en attente où l'empire est émetteur ou destinataire (chantier 16). */
  private proposalsFor(empire: Empire): RelationProposal[] {
    return [...this.proposalMap.values()].filter(
      (p) => p.fromEmpireId === empire.id || p.toEmpireId === empire.id,
    );
  }

  /**
   * Systèmes revendiqués visibles d'un empire (chantier 7e) : ses propres claims + ceux
   * des autres empires situés dans son brouillard, colorés par propriétaire.
   */
  private territoriesFor(empire: Empire): Territory[] {
    const out: Territory[] = [];
    for (const other of this.empires.values()) {
      const own = other.id === empire.id;
      for (const systemId of other.claimedSystemIds) {
        if (!own && !empire.explored.has(systemId)) continue;
        out.push({ systemId, ownerId: other.id, ownerColor: other.color });
      }
    }
    return out;
  }

  /** Classement public de tous les empires, trié par score composite décroissant. */
  private leaderboard(viewer: Empire): LeaderboardEntry[] {
    const rows: LeaderboardEntry[] = [];
    for (const empire of this.empires.values()) {
      const colonies = [...empire.colonyMap.values()];
      const population = colonies.reduce((s, c) => s + c.population, 0);
      const claimed = empire.claimedSystemIds.length;
      const score =
        colonies.length * 100 + claimed * 40 + Math.floor(population) + empire.influence / 10;
      rows.push({
        id: empire.id,
        name: empire.name,
        color: empire.color,
        colonies: colonies.length,
        population: Math.floor(population),
        claimed,
        influence: Math.floor(empire.influence),
        score: Math.round(score),
        relation: empire.id === viewer.id ? "neutral" : this.relationEntry(viewer.id, empire.id).state,
      });
    }
    return rows.sort((a, b) => b.score - a.score);
  }

  /**
   * Présence étrangère visible d'un empire : flottes et colonies des AUTRES empires
   * situées dans un système de son brouillard (chantier 7d — cible PvP potentielle).
   */
  private foreignPresenceFor(empire: Empire): {
    foreignFleets: ForeignFleet[];
    foreignColonies: ForeignColony[];
  } {
    const foreignFleets: ForeignFleet[] = [];
    const foreignColonies: ForeignColony[] = [];
    for (const other of this.empires.values()) {
      if (other.id === empire.id) continue;
      for (const fleet of other.fleetMap.values()) {
        if (!empire.explored.has(fleet.systemId)) continue;
        foreignFleets.push({
          id: fleet.id,
          ownerId: other.id,
          ownerName: other.name,
          ownerColor: other.color,
          name: fleet.name,
          systemId: fleet.systemId,
          ships: fleet.ships,
        });
      }
      for (const colony of other.colonyMap.values()) {
        const systemId = this.planetsById.get(colony.planetId)?.systemId;
        if (!systemId || !empire.explored.has(systemId)) continue;
        foreignColonies.push({
          id: colony.id,
          ownerId: other.id,
          ownerName: other.name,
          ownerColor: other.color,
          name: colony.name,
          systemId,
          planetId: colony.planetId,
        });
      }
    }
    return { foreignFleets, foreignColonies };
  }

  /** Localise une flotte parmi tous les empires (cible PvP). */
  private findFleet(fleetId: string): { empire: Empire; fleet: Fleet } | null {
    for (const empire of this.empires.values()) {
      const fleet = empire.fleetMap.get(fleetId);
      if (fleet) return { empire, fleet };
    }
    return null;
  }

  /** Localise une colonie parmi tous les empires (cible PvP). */
  private findColony(colonyId: string): { empire: Empire; colony: Colony } | null {
    for (const empire of this.empires.values()) {
      const colony = empire.colonyMap.get(colonyId);
      if (colony) return { empire, colony };
    }
    return null;
  }

  planet(planetId: string): Planet | undefined {
    return this.planetsById.get(planetId);
  }

  onChange(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => {
      const missed = Math.floor((Date.now() - this.clock.lastTickAt) / TICK_MS);
      if (missed > 0) this.advance(missed);
    }, TICK_MS);
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  /** Action joueur : lancer une construction. Retourne un message d'erreur ou null. */
  build(empire: Empire, colonyId: string, buildingId: BuildingId): string | null {
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    const planet = this.planetsById.get(colony.planetId);
    if (!planet) return "Planète inconnue";
    const result = enqueueBuilding(colony, planet, buildingId, Date.now(), empire.effects);
    if (!result.ok) return result.reason;
    empire.colonyMap.set(colonyId, result.colony);
    this.persistColony(result.colony);
    this.notify();
    return null;
  }

  /**
   * Réserve le plus gros cargo disponible de la colonie jusqu'à `busyUntil`.
   * Retourne null si aucun vaisseau libre.
   */
  private reserveShip(
    empire: Empire,
    colony: Colony,
    busyUntil: number,
  ): { colony: Colony; shipId: ShipId; capacity: number } | null {
    const idle = idleShips(colony, [...empire.routeMap.values()]);
    const shipId = pickShip(idle);
    if (!shipId) return null;
    return {
      colony: { ...colony, shipsBusy: [...colony.shipsBusy, { shipId, freeAt: busyUntil }] },
      shipId,
      capacity: SHIPS[shipId].capacity,
    };
  }

  /**
   * Réserve un convoi précis (chantier 12). Retourne null si la colonie ne dispose pas
   * de tous les vaisseaux demandés — on ne part jamais avec un convoi incomplet.
   */
  private reserveConvoy(
    empire: Empire,
    colony: Colony,
    ships: Partial<Record<ShipId, number>>,
    busyUntil: number,
  ): { colony: Colony; ships: Partial<Record<ShipId, number>>; capacity: number } | null {
    const idle = idleShips(colony, [...empire.routeMap.values()]);
    const wanted: Partial<Record<ShipId, number>> = {};
    for (const [shipId, raw] of Object.entries(ships) as [ShipId, number][]) {
      const count = Math.floor(Number(raw));
      if (!Number.isFinite(count) || count <= 0) continue;
      if (!SHIPS[shipId]) return null;
      if ((idle[shipId] ?? 0) < count) return null;
      wanted[shipId] = count;
    }
    if (Object.keys(wanted).length === 0) return null;

    const busy = [...colony.shipsBusy];
    for (const [shipId, count] of Object.entries(wanted) as [ShipId, number][]) {
      for (let i = 0; i < count; i++) busy.push({ shipId, freeAt: busyUntil });
    }
    return {
      colony: { ...colony, shipsBusy: busy },
      ships: wanted,
      capacity: convoyCapacity(wanted),
    };
  }

  /** Action joueur : régler (ou retirer) la consigne d'ascension d'une ressource. */
  setLiftRule(
    empire: Empire,
    colonyId: string,
    resource: ResourceId,
    rule: LiftRule | null,
  ): string | null {
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    if (!(RESOURCES as readonly string[]).includes(resource)) return `Ressource inconnue : ${resource}`;
    const liftRules = { ...colony.liftRules };
    if (rule === null) {
      delete liftRules[resource];
    } else {
      if (rule.direction !== "up" && rule.direction !== "down") return "Consigne invalide";
      const keepGround = Math.max(0, Math.floor(Number(rule.keepGround)));
      if (!Number.isFinite(keepGround)) return "Seuil invalide";
      liftRules[resource] = { keepGround, direction: rule.direction };
    }
    const updated = { ...colony, liftRules };
    empire.colonyMap.set(colonyId, updated);
    this.persistColony(updated);
    this.notify();
    return null;
  }

  /** Action joueur : envoyer un convoi cargo. Retourne un message d'erreur ou null. */
  sendTransfer(
    empire: Empire,
    fromColonyId: string,
    toColonyId: string,
    wanted: Partial<Record<ResourceId, number>>,
    convoy?: Partial<Record<ShipId, number>>,
  ): string | null {
    const from = empire.colonyMap.get(fromColonyId);
    const to = empire.colonyMap.get(toColonyId);
    if (!from || !to) return "Colonie inconnue";
    if (from.id === to.id) return "Origine et destination identiques";

    const cargo: Partial<Record<ResourceId, number>> = {};
    for (const [res, raw] of Object.entries(wanted) as [ResourceId, number][]) {
      const amount = Math.floor(Number(raw));
      if (!Number.isFinite(amount) || amount <= 0) continue;
      if (!(RESOURCES as readonly string[]).includes(res)) return `Ressource inconnue : ${res}`;
      cargo[res] = amount;
    }
    if (Object.keys(cargo).length === 0) return "Cargaison vide";

    const fromPlanet = this.planetsById.get(from.planetId);
    const toPlanet = this.planetsById.get(to.planetId);
    if (!fromPlanet || !toPlanet) return "Planète inconnue";
    const jumps = jumpDistanceInUniverse(this.universe, fromPlanet.systemId, toPlanet.systemId, this.portalLinks);
    if (jumps < 0) return "Destination inaccessible";
    const portals = this.portalsCrossed(fromPlanet.systemId, toPlanet.systemId);

    // La cargaison se prend en ORBITE : le stock au sol ne peut pas se substituer
    // (chantier 12). Sans dock ni ascenseur, la colonie ne peut rien exporter.
    const loaded = takeFromOrbit(from, cargo);
    if (!loaded) {
      const missing = (Object.entries(cargo) as [ResourceId, number][]).find(
        ([res, amount]) => (from.orbitalResources[res] ?? 0) < amount,
      );
      return `Stock orbital insuffisant : ${missing?.[0] ?? "cargaison"}`;
    }

    const now = Date.now();
    const total = Object.values(cargo).reduce((s, n) => s + n, 0);
    // Convoi explicite (chantier 12) ou repli sur le plus gros cargo disponible.
    const speed = empire.effects.transferSpeedMult;
    const reserved = convoy
      ? this.reserveConvoy(
          empire,
          loaded,
          convoy,
          now + 2 * convoyDurationMs(jumps, convoy) * speed,
        )
      : (() => {
          const one = this.reserveShip(empire, loaded, now + 2 * transferDurationMs(jumps) * speed);
          return one ? { colony: one.colony, ships: { [one.shipId]: 1 }, capacity: one.capacity } : null;
        })();
    if (!reserved) return "Convoi indisponible : vaisseaux manquants";
    if (total > reserved.capacity) {
      return `Cargaison trop lourde pour ce convoi (soute : ${reserved.capacity})`;
    }

    const duration = convoyDurationMs(jumps, reserved.ships) * speed;
    const cost = convoyFees(jumps, portals);
    const fuel = Math.ceil(convoyFuel(jumps, reserved.ships, total) * empire.effects.fuelMult);
    const resources = { ...reserved.colony.resources };
    if (resources.credits < cost) return `Crédits insuffisants (frais : ${cost})`;
    // Le carburant se soutire en orbite : un convoi ne fait pas le plein au sol.
    const fueled = takeFromOrbit(reserved.colony, { energy: fuel });
    if (!fueled) return `Carburant insuffisant en orbite (${fuel} énergie)`;

    resources.credits -= cost;

    const transfer: Transfer = {
      id: randomUUID(),
      fromColonyId,
      toColonyId,
      resources: cargo,
      departedAt: now,
      arrivesAt: now + duration,
    };
    empire.colonyMap.set(from.id, { ...fueled, resources });
    empire.transferMap.set(transfer.id, transfer);
    this.persistColony(empire.colonyMap.get(from.id)!);
    db.insert(schema.transfers)
      .values({
        id: transfer.id,
        gameId: this.clock.id,
        fromColonyId,
        toColonyId,
        resources: JSON.stringify(cargo),
        departedAt: transfer.departedAt,
        arrivesAt: transfer.arrivesAt,
      })
      .run();
    this.notify();
    return null;
  }

  /** Action joueur : vendre une cargaison à une station (créditée au spot d'arrivée). */
  sellToStation(
    empire: Empire,
    colonyId: string,
    stationId: string,
    wanted: Partial<Record<ResourceId, number>>,
  ): string | null {
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    const station = this.stationsById.get(stationId);
    if (!station) return "Station inconnue";
    if (!empire.explored.has(station.systemId)) return "Station non découverte";
    if (this.stationEmbargoed(empire, stationId)) return "Embargo de faction — commerce refusé";

    const cargo: Partial<Record<ResourceId, number>> = {};
    for (const [res, raw] of Object.entries(wanted) as [ResourceId, number][]) {
      const amount = Math.floor(Number(raw));
      if (!Number.isFinite(amount) || amount <= 0) continue;
      if (!(MARKET_RESOURCES as readonly string[]).includes(res)) {
        return `Ressource non échangeable : ${res}`;
      }
      cargo[res] = amount;
    }
    if (Object.keys(cargo).length === 0) return "Cargaison vide";

    const fromPlanet = this.planetsById.get(colony.planetId);
    if (!fromPlanet) return "Planète inconnue";
    const jumps = jumpDistanceInUniverse(this.universe, fromPlanet.systemId, station.systemId, this.portalLinks);
    if (jumps < 0) return "Station inaccessible";
    const fee = transferCostCredits(jumps);

    // Comme un convoi : la marchandise vendue part de l'orbite, pas du sol.
    const loaded = takeFromOrbit(colony, cargo);
    if (!loaded) {
      const missing = (Object.entries(cargo) as [ResourceId, number][]).find(
        ([res, amount]) => (colony.orbitalResources[res] ?? 0) < amount,
      );
      return `Stock orbital insuffisant : ${missing?.[0] ?? "cargaison"}`;
    }
    const resources = { ...loaded.resources };
    if (resources.credits < fee) return `Crédits insuffisants (frais : ${fee})`;

    const duration = transferDurationMs(jumps) * empire.effects.transferSpeedMult;
    const reserved = this.reserveShip(empire, loaded, Date.now() + 2 * duration);
    if (!reserved) return "Aucun cargo disponible";
    const total = Object.values(cargo).reduce((s, n) => s + n, 0);
    if (total > reserved.capacity) {
      return `Cargaison trop lourde (soute : ${reserved.capacity})`;
    }

    resources.credits -= fee;
    empire.colonyMap.set(colony.id, { ...reserved.colony, resources });
    this.persistColony(empire.colonyMap.get(colony.id)!);
    this.insertMission(empire, "sell", colonyId, stationId, duration, { cargo });
    this.notify();
    return null;
  }

  /** Action joueur : acheter au spot (le convoi part avec un budget, revient chargé). */
  buyFromStation(
    empire: Empire,
    colonyId: string,
    stationId: string,
    resource: ResourceId,
    budgetRaw: number,
  ): string | null {
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    const station = this.stationsById.get(stationId);
    if (!station) return "Station inconnue";
    if (!empire.explored.has(station.systemId)) return "Station non découverte";
    if (this.stationEmbargoed(empire, stationId)) return "Embargo de faction — commerce refusé";
    if (!(MARKET_RESOURCES as readonly string[]).includes(resource)) {
      return `Ressource non échangeable : ${resource}`;
    }
    const budget = Math.floor(Number(budgetRaw));
    if (!Number.isFinite(budget) || budget <= 0) return "Budget invalide";

    const fromPlanet = this.planetsById.get(colony.planetId);
    if (!fromPlanet) return "Planète inconnue";
    const jumps = jumpDistanceInUniverse(this.universe, fromPlanet.systemId, station.systemId, this.portalLinks);
    if (jumps < 0) return "Station inaccessible";
    const fee = transferCostCredits(jumps);

    if (colony.resources.credits < budget + fee) {
      return `Crédits insuffisants (budget ${budget} + frais ${fee})`;
    }

    const duration = transferDurationMs(jumps) * empire.effects.transferSpeedMult;
    const reserved = this.reserveShip(empire, colony, Date.now() + 2 * duration);
    if (!reserved) return "Aucun cargo disponible";

    const resources = { ...colony.resources, credits: colony.resources.credits - budget - fee };
    empire.colonyMap.set(colony.id, { ...reserved.colony, resources });
    this.persistColony(empire.colonyMap.get(colony.id)!);
    // La capacité du cargo réservé borne l'achat à l'arrivée.
    this.insertMission(empire, "buy", colonyId, stationId, duration, {
      budget,
      buyResource: resource,
      capacity: reserved.capacity,
    });
    this.notify();
    return null;
  }

  /** Action joueur : produire un vaisseau au chantier naval. */
  buildShip(empire: Empire, colonyId: string, shipId: ShipId): string | null {
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    const result = enqueueShip(colony, shipId, Date.now(), empire.researched as TechId[], empire.effects);
    if (!result.ok) return result.reason;
    empire.colonyMap.set(colonyId, result.colony);
    this.persistColony(result.colony);
    this.notify();
    return null;
  }

  /** Action joueur : fonder un avant-poste minier sur une ceinture. */
  buildOutpost(empire: Empire, colonyId: string, beltId: string): string | null {
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    const belt = this.beltsById.get(beltId);
    if (!belt) return "Ceinture inconnue";
    if (!empire.explored.has(belt.systemId)) return "Système non exploré";
    if ([...empire.outpostMap.values()].some((o) => o.beltId === beltId)) {
      return "Ceinture déjà exploitée";
    }
    if (
      [...empire.missionMap.values()].some((m) => m.kind === "build_outpost" && m.targetId === beltId)
    ) {
      return "Un chantier est déjà en route";
    }
    const fromPlanet = this.planetsById.get(colony.planetId);
    if (!fromPlanet) return "Planète inconnue";
    const jumps = jumpDistanceInUniverse(this.universe, fromPlanet.systemId, belt.systemId, this.portalLinks);
    if (jumps < 0) return "Ceinture inaccessible";

    const resources = { ...colony.resources };
    for (const [res, amount] of Object.entries(OUTPOST_COST) as [ResourceId, number][]) {
      if (resources[res] < amount) return `Ressources insuffisantes (${amount} ${res})`;
    }
    for (const [res, amount] of Object.entries(OUTPOST_COST) as [ResourceId, number][]) {
      resources[res] -= amount;
    }
    empire.colonyMap.set(colony.id, { ...colony, resources });
    this.persistColony(empire.colonyMap.get(colony.id)!);
    this.insertMission(
      empire,
      "build_outpost",
      colonyId,
      beltId,
      transferDurationMs(jumps) * empire.effects.transferSpeedMult,
    );
    this.notify();
    return null;
  }

  /** Production des avant-postes + entretien payé par la colonie propriétaire. */
  private outpostsTick(empire: Empire): void {
    for (const [id, outpost] of empire.outpostMap) {
      const belt = this.beltsById.get(outpost.beltId);
      if (!belt) continue;
      const owner = empire.colonyMap.get(outpost.ownerColonyId);
      const upkeepPaid = !!owner && owner.resources.credits >= OUTPOST_UPKEEP_CREDITS;
      if (upkeepPaid && owner) {
        empire.colonyMap.set(owner.id, {
          ...owner,
          resources: {
            ...owner.resources,
            credits: owner.resources.credits - OUTPOST_UPKEEP_CREDITS,
          },
        });
      }
      const oreStock = outpostTick(outpost.oreStock, beltRichness(belt), upkeepPaid, empire.effects.outpostYieldMult);
      if (oreStock !== outpost.oreStock) {
        empire.outpostMap.set(id, { ...outpost, oreStock });
      }
    }
  }

  /** Action joueur : créer une route logistique automatique. */
  createRoute(
    empire: Empire,
    ownerColonyId: string,
    fromId: string,
    fromKind: "colony" | "outpost",
    toId: string,
    toKind: "colony" | "station",
    resource: ResourceId,
    rule: RouteRule,
    ships: Partial<Record<ShipId, number>>,
  ): string | null {
    const owner = empire.colonyMap.get(ownerColonyId);
    if (!owner) return "Colonie propriétaire inconnue";

    let fromSystemId: string;
    if (fromKind === "colony") {
      const from = empire.colonyMap.get(fromId);
      if (!from) return "Colonie source inconnue";
      fromSystemId = this.planetsById.get(from.planetId)?.systemId ?? "";
    } else {
      const outpost = empire.outpostMap.get(fromId);
      if (!outpost) return "Avant-poste inconnu";
      if (resource !== "ore") return "Un avant-poste n'exporte que du minerai";
      fromSystemId = this.beltsById.get(outpost.beltId)?.systemId ?? "";
    }

    let toSystemId: string;
    if (toKind === "colony") {
      const to = empire.colonyMap.get(toId);
      if (!to) return "Colonie destination inconnue";
      if (fromKind === "colony" && to.id === fromId) return "Origine et destination identiques";
      if (!(RESOURCES as readonly string[]).includes(resource)) return "Ressource inconnue";
      toSystemId = this.planetsById.get(to.planetId)?.systemId ?? "";
    } else {
      const station = this.stationsById.get(toId);
      if (!station) return "Station inconnue";
      if (!empire.explored.has(station.systemId)) return "Station non découverte";
      if (!(MARKET_RESOURCES as readonly string[]).includes(resource)) {
        return "Ressource non échangeable en station";
      }
      toSystemId = station.systemId;
    }

    if (jumpDistanceInUniverse(this.universe, fromSystemId, toSystemId, this.portalLinks) < 0) {
      return "Destination inaccessible";
    }

    // Validation de la règle.
    if (rule.type === "maintain") {
      if (toKind === "station") return "Règle « maintenir » impossible vers une station";
      if (!(rule.minAtDestination > 0) || rule.keepAtSource < 0) return "Règle invalide";
    } else if (rule.type === "fixed") {
      if (!(rule.amount > 0)) return "Règle invalide";
    } else if (rule.type === "surplus") {
      if (rule.keepAtSource < 0) return "Règle invalide";
    } else {
      return "Règle inconnue";
    }

    // Vaisseaux demandés disponibles chez la colonie propriétaire ?
    const requested: Partial<Record<ShipId, number>> = {};
    let anyShip = false;
    const idle = idleShips(owner, [...empire.routeMap.values()]);
    for (const [shipId, raw] of Object.entries(ships) as [ShipId, number][]) {
      const count = Math.floor(Number(raw));
      if (!Number.isFinite(count) || count <= 0) continue;
      if (!SHIPS[shipId]) return `Vaisseau inconnu : ${shipId}`;
      if (idle[shipId] < count) return `Vaisseaux indisponibles : ${shipId}`;
      requested[shipId] = count;
      anyShip = true;
    }
    if (!anyShip) return "Aucun vaisseau assigné";

    const route: Route = {
      id: randomUUID(),
      ownerColonyId,
      fromId,
      fromKind,
      toId,
      toKind,
      resource,
      rule,
      ships: requested,
      activeCycle: null,
      paused: false,
    };
    empire.routeMap.set(route.id, route);
    db.insert(schema.routes)
      .values({
        id: route.id,
        gameId: this.clock.id,
        ownerColonyId,
        fromId,
        fromKind,
        toId,
        toKind,
        resource,
        rule: JSON.stringify(rule),
        ships: JSON.stringify(requested),
        activeCycle: null,
        paused: 0,
      })
      .run();
    this.notify();
    return null;
  }

  /** Action joueur : suspendre/reprendre une route (le cycle en cours se termine). */
  setRoutePaused(empire: Empire, routeId: string, paused: boolean): string | null {
    const route = empire.routeMap.get(routeId);
    if (!route) return "Route inconnue";
    empire.routeMap.set(routeId, { ...route, paused });
    this.persistRoute(empire.routeMap.get(routeId)!);
    this.notify();
    return null;
  }

  /** Action joueur : supprimer une route au repos (les vaisseaux redeviennent libres). */
  deleteRoute(empire: Empire, routeId: string): string | null {
    const route = empire.routeMap.get(routeId);
    if (!route) return "Route inconnue";
    if (route.activeCycle) return "Cycle en cours : suspendez la route et attendez le retour";
    empire.routeMap.delete(routeId);
    db.delete(schema.routes).where(eq(schema.routes.id, routeId)).run();
    this.notify();
    return null;
  }

  /** Ordonnanceur : départs et résolutions de cycles à l'instant `t`. */
  private processRoutes(empire: Empire, t: number): void {
    for (const [id, route] of empire.routeMap) {
      let current = route;

      // Livraison à l'arrivée (cargaison > 0), puis fin de cycle au retour.
      if (current.activeCycle) {
        const cycle = current.activeCycle;
        if (cycle.carrying > 0 && cycle.arrivesAt <= t) {
          this.deliverRouteCargo(empire, current, cycle.carrying);
          current = { ...current, activeCycle: { ...cycle, carrying: 0 } };
        }
        if (current.activeCycle && current.activeCycle.backAt <= t) {
          current = { ...current, activeCycle: null };
        }
        if (current !== route) {
          empire.routeMap.set(id, current);
          this.persistRoute(current);
        }
      }

      // Départ d'un nouveau cycle.
      if (current.activeCycle || current.paused) continue;
      const owner = empire.colonyMap.get(current.ownerColonyId);
      if (!owner) continue;

      // Source : stock + système d'origine.
      let sourceStock: number;
      let fromSystemId: string | undefined;
      if (current.fromKind === "colony") {
        const from = empire.colonyMap.get(current.fromId);
        if (!from) continue;
        // Une route charge ce qui est en orbite, comme un convoi manuel (chantier 12).
        sourceStock = from.orbitalResources[current.resource] ?? 0;
        fromSystemId = this.planetsById.get(from.planetId)?.systemId;
      } else {
        const outpost = empire.outpostMap.get(current.fromId);
        if (!outpost) continue;
        sourceStock = outpost.oreStock;
        fromSystemId = this.beltsById.get(outpost.beltId)?.systemId;
      }
      if (!fromSystemId) continue;

      const toSystemId =
        current.toKind === "colony"
          ? this.planetsById.get(empire.colonyMap.get(current.toId)?.planetId ?? "")?.systemId
          : this.stationsById.get(current.toId)?.systemId;
      if (!toSystemId) continue;
      const jumps = jumpDistanceInUniverse(this.universe, fromSystemId, toSystemId, this.portalLinks);
      if (jumps < 0) continue;

      // La règle « maintain » vise le stock utile à destination : sol + orbite.
      const destColony = current.toKind === "colony" ? empire.colonyMap.get(current.toId) : undefined;
      const destStock = destColony
        ? (destColony.resources[current.resource] ?? 0) +
          (destColony.orbitalResources[current.resource] ?? 0)
        : 0;
      const qty = routeCargoQuantity(current.rule, sourceStock, destStock, fleetCapacity(current.ships));
      if (qty <= 0) continue;
      const fee = transferCostCredits(jumps);
      if (owner.resources.credits < fee) continue;

      // Frais payés par le propriétaire, cargaison retirée à la source.
      empire.colonyMap.set(owner.id, {
        ...owner,
        resources: { ...owner.resources, credits: owner.resources.credits - fee },
      });
      if (current.fromKind === "colony") {
        const from = empire.colonyMap.get(current.fromId)!;
        const loaded = takeFromOrbit(from, { [current.resource]: qty });
        if (!loaded) continue;
        empire.colonyMap.set(from.id, loaded);
        this.persistColony(loaded);
      } else {
        const outpost = empire.outpostMap.get(current.fromId)!;
        empire.outpostMap.set(outpost.id, { ...outpost, oreStock: outpost.oreStock - qty });
      }
      this.persistColony(empire.colonyMap.get(owner.id)!);

      const duration = transferDurationMs(jumps) * empire.effects.transferSpeedMult;
      const next: Route = {
        ...current,
        activeCycle: { departedAt: t, arrivesAt: t + duration, backAt: t + 2 * duration, carrying: qty },
      };
      empire.routeMap.set(id, next);
      this.persistRoute(next);
    }
  }

  /** Livre la cargaison d'un cycle : stock colonie ou vente au spot en station. */
  private deliverRouteCargo(empire: Empire, route: Route, carrying: number): void {
    if (route.toKind === "colony") {
      const to = empire.colonyMap.get(route.toId);
      if (!to) return;
      // Livraison en orbite : l'ascenseur de la destination fera descendre au sol.
      empire.colonyMap.set(to.id, deliverToOrbit(to, { [route.resource]: carrying }, empire.effects));
      this.persistColony(empire.colonyMap.get(to.id)!);
    } else {
      const stocks = this.marketMap.get(route.toId);
      const owner = empire.colonyMap.get(route.ownerColonyId);
      if (!stocks || !owner) return;
      const result = resolveSale(stocks, { [route.resource]: carrying }, this.priceContextOf(route.toId));
      this.marketMap.set(route.toId, result.stocks);
      this.persistMarket(route.toId);
      const revenue = Math.floor(result.revenue * (1 + this.stationRepBonus(empire, route.toId)));
      this.addFactionRep(empire, route.toId, result.revenue);
      const resources = { ...owner.resources, credits: owner.resources.credits + revenue };
      empire.colonyMap.set(owner.id, { ...owner, resources });
      this.persistColony(empire.colonyMap.get(owner.id)!);
    }
  }

  /**
   * Contexte de prix d'une station (chantier 12) : son biais propre et l'éloignement de
   * sa galaxie. C'est ce qui fait diverger les prix d'un comptoir à l'autre.
   */
  priceContextOf(stationId: string): PriceContext | undefined {
    const station = this.stationsById.get(stationId);
    if (!station) return undefined;
    return {
      stationId,
      galaxyIndex: this.galaxyIndexOfSystem.get(station.systemId) ?? 0,
      factionId: station.factionId,
    };
  }

  /** Réputation gagnée auprès de la faction de la station, au volume de crédits échangé. */
  private addFactionRep(empire: Empire, stationId: string, creditsExchanged: number): void {
    const station = this.stationsById.get(stationId);
    if (!station || creditsExchanged <= 0) return;
    const factionRep = { ...empire.factionRep };
    factionRep[station.factionId] =
      Math.round(((factionRep[station.factionId] ?? 0) + creditsExchanged * REP_PER_CREDIT) * 10) /
      10;
    empire.factionRep = factionRep;
  }

  // ─────────────────────────── Économie PNJ (chantier 14) ───────────────────────────

  /** Comptoir le plus proche dans la MÊME galaxie (un PNJ ne commerce pas à l'échelle de l'univers). */
  private nearestStation(systemId: string): TradeStation | null {
    const galaxyIndex = this.galaxyIndexOfSystem.get(systemId);
    let best: TradeStation | null = null;
    let bestJumps = Infinity;
    for (const station of this.stationsById.values()) {
      if (this.galaxyIndexOfSystem.get(station.systemId) !== galaxyIndex) continue;
      const jumps = jumpDistanceInUniverse(this.universe, systemId, station.systemId, this.portalLinks);
      if (jumps < 0 || jumps >= bestJumps) continue;
      bestJumps = jumps;
      best = station;
    }
    return best;
  }

  /**
   * Vend directement l'excédent orbital d'un PNJ au comptoir le plus proche — sans convoi
   * ni trajet : un PNJ n'est pas un joueur affrétant des vaisseaux, seul son résultat
   * économique (stocks de marché, crédits) compte pour le reste de l'univers.
   */
  private npcSellSurplus(empire: Empire, colony: Colony, resource: MarketResource, quantity: number): void {
    if (quantity <= 0) return;
    const planet = this.planetsById.get(colony.planetId);
    const station = planet ? this.nearestStation(planet.systemId) : null;
    if (!station) return;
    const stocks = this.marketMap.get(station.id);
    if (!stocks) return;
    const loaded = takeFromOrbit(colony, { [resource]: quantity });
    if (!loaded) return;
    const result = resolveSale(stocks, { [resource]: quantity }, this.priceContextOf(station.id));
    this.marketMap.set(station.id, result.stocks);
    this.persistMarket(station.id);
    const updated: Colony = {
      ...loaded,
      resources: { ...loaded.resources, credits: loaded.resources.credits + result.revenue },
    };
    empire.colonyMap.set(colony.id, updated);
    this.persistColony(updated);
  }

  /** Publie un contrat pour un besoin PNJ — un joueur peut le servir contre rémunération. */
  private npcPostContract(empire: Empire, colony: Colony, resource: MarketResource, quantity: number): void {
    if (quantity <= 0) return;
    // Pas d'empilement : un contrat déjà ouvert pour cette ressource suffit à couvrir le besoin.
    const alreadyOpen = [...this.contractMap.values()].some(
      (c) =>
        c.issuerId === empire.id &&
        c.colonyId === colony.id &&
        c.resource === resource &&
        c.status === "open",
    );
    if (alreadyOpen) return;
    const planet = this.planetsById.get(colony.planetId);
    const station = planet ? this.nearestStation(planet.systemId) : null;
    const stocks = station ? this.marketMap.get(station.id) : undefined;
    const price =
      Math.round(
        stationPrice(resource, stocks?.[resource] ?? TARGET_STOCK, station ? this.priceContextOf(station.id) : undefined) *
          NPC_CONTRACT_PRICE_MULT *
          100,
      ) / 100;
    this.postContract(empire, colony.id, resource, quantity, price, NPC_CONTRACT_DURATION_MS);
  }

  /** Fait évoluer l'humeur de chaque faction à un tick économique (chantier 15). */
  private factionMoodTick(now: number, tickNumber: number): void {
    for (const [factionId, state] of this.factionStateMap) {
      const rng = createRng(`faction-${this.clock.seed}-${factionId}-${tickNumber}`);
      const next = factionTick(state, rng, now);
      if (next === state) continue;
      this.factionStateMap.set(factionId, next);
      this.persistFactionState(next);
      console.log(`[game] humeur de ${FACTIONS[factionId as FactionId].name} : ${next.mood}`);
      // La pénurie se traduit en demande concrète : un contrat qu'un joueur peut honorer.
      if (next.mood === "shortage") this.factionPostShortageContract(factionId, rng);
    }
  }

  /**
   * Publie un contrat pour un intrant manquant d'une faction en pénurie (chantier 15).
   * Sans séquestre : une faction n'a pas de colonie ni de solde de crédits propre, à la
   * différence d'un empire — c'est le marché lui-même qui l'honore, standing à la clé.
   */
  private factionPostShortageContract(factionId: string, rng: Rng): void {
    const def = FACTIONS[factionId as FactionId];
    const consumed = Object.keys(def.consumes) as MarketResource[];
    if (consumed.length === 0) return;
    const alreadyOpen = [...this.contractMap.values()].some(
      (c) => c.issuerId === factionId && c.status === "open",
    );
    if (alreadyOpen) return;
    const station = [...this.stationsById.values()].find((s) => s.factionId === factionId);
    if (!station) return;

    const resource = consumed[Math.floor(rng() * consumed.length)]!;
    const stocks = this.marketMap.get(station.id);
    const price =
      Math.round(
        stationPrice(resource, stocks?.[resource] ?? TARGET_STOCK, this.priceContextOf(station.id)) *
          FACTION_CONTRACT_PRICE_MULT *
          100,
      ) / 100;
    const quantity = randInt(rng, FACTION_CONTRACT_QUANTITY_MIN, FACTION_CONTRACT_QUANTITY_MAX);

    const now = Date.now();
    const contract: Contract = {
      id: randomUUID(),
      issuerId: factionId,
      issuerName: def.name,
      issuerColor: def.color,
      colonyId: station.id,
      colonyName: station.name,
      systemId: station.systemId,
      resource,
      quantity,
      remaining: quantity,
      pricePerUnit: price,
      createdAt: now,
      deadline: now + FACTION_CONTRACT_DURATION_MS,
      status: "open",
    };
    this.contractMap.set(contract.id, contract);
    this.insertContract(contract);
    console.log(`[game] ${def.name} publie un contrat de pénurie : ${quantity} ${resource}`);
    this.notify();
  }

  /** Fait tourner l'économie d'un empire PNJ : vend le surplus, contractualise les besoins. */
  private npcTick(empire: Empire): void {
    if (empire.kind !== "npc") return;
    for (const colony of empire.colonyMap.values()) {
      for (const intent of decideColonyEconomy(colony)) {
        if (intent.kind === "sell") {
          this.npcSellSurplus(empire, colony, intent.resource, intent.quantity);
        } else {
          this.npcPostContract(empire, colony, intent.resource, intent.quantity);
        }
      }
    }
  }

  /**
   * Bonus commercial appliqué en station : remise de réputation + marge des chartes
   * commerciales (chantier 12) + bonus d'humeur de faction (chantier 15, boom). Majore
   * les ventes, réduit les achats.
   */
  private stationRepBonus(empire: Empire, stationId: string): number {
    const station = this.stationsById.get(stationId);
    const rep = station ? repBonus(empire.factionRep[station.factionId] ?? 0) : 0;
    const mood = station ? this.factionStateMap.get(station.factionId)?.mood ?? "neutral" : "neutral";
    return rep + empire.effects.tradeMargin + moodRebateBonus(mood);
  }

  /** Un embargo de faction ferme la station aux empires qui n'ont pas encore fait leurs preuves. */
  private stationEmbargoed(empire: Empire, stationId: string): boolean {
    const station = this.stationsById.get(stationId);
    if (!station) return false;
    const mood = this.factionStateMap.get(station.factionId)?.mood ?? "neutral";
    return embargoBlocks(mood, empire.factionRep[station.factionId] ?? 0);
  }

  private loadRoutes(): void {
    for (const row of db.select().from(schema.routes).all()) {
      this.empireOfColony(row.ownerColonyId).routeMap.set(row.id, {
        id: row.id,
        ownerColonyId: row.ownerColonyId,
        fromId: row.fromId,
        fromKind: row.fromKind as Route["fromKind"],
        toId: row.toId,
        toKind: row.toKind as Route["toKind"],
        resource: row.resource as ResourceId,
        rule: JSON.parse(row.rule),
        ships: JSON.parse(row.ships),
        activeCycle: row.activeCycle ? JSON.parse(row.activeCycle) : null,
        paused: row.paused === 1,
      });
    }
  }

  private loadOutposts(): void {
    for (const row of db.select().from(schema.outposts).all()) {
      this.empireOfColony(row.ownerColonyId).outpostMap.set(row.id, {
        id: row.id,
        beltId: row.beltId,
        ownerColonyId: row.ownerColonyId,
        oreStock: row.oreStock,
      });
    }
  }

  private persistOutposts(empire: Empire): void {
    for (const outpost of empire.outpostMap.values()) {
      db.update(schema.outposts)
        .set({ oreStock: outpost.oreStock })
        .where(eq(schema.outposts.id, outpost.id))
        .run();
    }
  }

  private persistRoute(route: Route): void {
    db.update(schema.routes)
      .set({
        rule: JSON.stringify(route.rule),
        ships: JSON.stringify(route.ships),
        activeCycle: route.activeCycle ? JSON.stringify(route.activeCycle) : null,
        paused: route.paused ? 1 : 0,
      })
      .where(eq(schema.routes.id, route.id))
      .run();
  }

  /** Action joueur : lancer une recherche (une seule à la fois, payée en science). */
  startResearch(empire: Empire, techId: string): string | null {
    if (empire.research) return "Une recherche est déjà en cours";
    const tech = TECHS[techId as TechId];
    if (!tech) return "Technologie inconnue";
    if (!canResearch(tech.id, empire.researched as TechId[])) {
      return "Prérequis non satisfaits";
    }
    if (!this.beginResearch(empire, tech.id)) {
      const totalScience = [...empire.colonyMap.values()].reduce(
        (s, c) => s + c.resources.science,
        0,
      );
      return `Science insuffisante (${Math.floor(totalScience)}/${tech.cost})`;
    }
    this.notify();
    return null;
  }

  /**
   * Débite la science et démarre une recherche. Retourne false si la science manque —
   * la file (11.4) réessaiera au tick suivant plutôt que d'être vidée.
   */
  private beginResearch(empire: Empire, techId: TechId, now = Date.now()): boolean {
    const tech = TECHS[techId];
    const colonies = [...empire.colonyMap.values()];
    const totalScience = colonies.reduce((s, c) => s + c.resources.science, 0);
    if (totalScience < tech.cost) return false;

    // Paiement réparti : on ponctionne les colonies dans l'ordre jusqu'à couvrir le coût.
    let remaining = tech.cost;
    for (const colony of colonies) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, colony.resources.science);
      if (take <= 0) continue;
      remaining -= take;
      const updated = {
        ...colony,
        resources: { ...colony.resources, science: colony.resources.science - take },
      };
      empire.colonyMap.set(colony.id, updated);
      this.persistColony(updated);
    }

    empire.research = { techId: tech.id, startedAt: now, finishesAt: now + tech.durationMs };
    this.persistResearch(empire);
    return true;
  }

  /**
   * Action joueur : planifier la chaîne menant à une tech (chantier 11.4).
   * La file remplace la précédente ; sa tête démarre dès que la science suffit.
   */
  queueResearch(empire: Empire, techId: string): string | null {
    const tech = TECHS[techId as TechId];
    if (!tech) return "Technologie inconnue";
    const path = researchPath(tech.id, empire.researched as TechId[]);
    if (path.length === 0) return "Technologie déjà acquise";
    // La recherche en cours n'est pas interrompue : elle sort simplement de la file.
    empire.researchQueue = path.filter((id) => id !== empire.research?.techId);
    this.advanceResearchQueue(empire);
    this.persistResearch(empire);
    this.notify();
    return null;
  }

  /** Action joueur : vider la file planifiée (la recherche en cours continue). */
  clearResearchQueue(empire: Empire): string | null {
    empire.researchQueue = [];
    this.persistResearch(empire);
    this.notify();
    return null;
  }

  /**
   * Lance la première tech de la file dont les prérequis sont satisfaits. Appelée à la
   * planification et après chaque recherche terminée : la chaîne s'enchaîne seule.
   */
  private advanceResearchQueue(empire: Empire, now = Date.now()): void {
    if (empire.research || empire.researchQueue.length === 0) return;
    // Les techs déjà acquises entre-temps (autre chemin) sont retirées silencieusement.
    empire.researchQueue = empire.researchQueue.filter((id) => !empire.researched.includes(id));
    const next = empire.researchQueue[0] as TechId | undefined;
    if (!next) return;
    if (!canResearch(next, empire.researched as TechId[])) return;
    if (this.beginResearch(empire, next, now)) {
      empire.researchQueue = empire.researchQueue.slice(1);
    }
  }

  private resolveResearch(empire: Empire, t: number): void {
    const finished = empire.research && empire.research.finishesAt <= t ? empire.research : null;
    if (finished) {
      empire.researched = [...empire.researched, finished.techId];
      empire.research = null;
      empire.effects = computeEffects(empire.researched as TechId[]);
      console.log(`[game] recherche terminée : ${finished.techId}`);
    }
    // Enchaînement de la file, y compris quand la science manquait au tick précédent.
    const beforeQueue = empire.research;
    this.advanceResearchQueue(empire, t);
    if (finished || beforeQueue !== empire.research) this.persistResearch(empire);
  }

  private persistResearch(empire: Empire): void {
    db.update(schema.players)
      .set({
        researched: JSON.stringify(empire.researched),
        research: empire.research ? JSON.stringify(empire.research) : null,
        researchQueue: JSON.stringify(empire.researchQueue),
      })
      .where(eq(schema.players.id, empire.id))
      .run();
  }

  /** Action joueur : envoyer une sonde révéler un système. */
  probe(empire: Empire, colonyId: string, systemId: string): string | null {
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    if (empire.explored.has(systemId)) return "Système déjà exploré";
    const system = allSystems(this.universe).find((s) => s.id === systemId);
    if (!system) return "Système inconnu";
    if ([...empire.missionMap.values()].some((m) => m.kind === "probe" && m.targetId === systemId)) {
      return "Une sonde est déjà en route";
    }
    const fromPlanet = this.planetsById.get(colony.planetId);
    if (!fromPlanet) return "Planète inconnue";
    const cost = Math.round(PROBE_COST_CREDITS * empire.effects.probeCostMult);
    if (colony.resources.credits < cost) {
      return `Crédits insuffisants (coût : ${cost})`;
    }
    const jumps = jumpDistanceInUniverse(this.universe, fromPlanet.systemId, systemId, this.portalLinks);
    if (jumps < 0) return "Système inaccessible";

    const resources = { ...colony.resources, credits: colony.resources.credits - cost };
    empire.colonyMap.set(colony.id, { ...colony, resources });
    this.persistColony(empire.colonyMap.get(colony.id)!);
    this.insertMission(
      empire,
      "probe",
      colonyId,
      systemId,
      probeDurationMs(jumps) * empire.effects.probeSpeedMult,
    );
    this.notify();
    return null;
  }

  /** Action joueur : envoyer un vaisseau colonial fonder une colonie. */
  colonize(empire: Empire, colonyId: string, planetId: string): string | null {
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    const target = this.planetsById.get(planetId);
    if (!target) return "Planète inconnue";
    if (!empire.explored.has(target.systemId)) return "Système non exploré";
    if (target.type === "gas") return "Impossible de coloniser une géante gazeuse";
    if ([...empire.colonyMap.values()].some((c) => c.planetId === planetId)) {
      return "Planète déjà colonisée";
    }
    if (
      [...empire.missionMap.values()].some((m) => m.kind === "colonize" && m.targetId === planetId)
    ) {
      return "Un vaisseau colonial est déjà en route";
    }
    const fromPlanet = this.planetsById.get(colony.planetId);
    if (!fromPlanet) return "Planète inconnue";
    const jumps = jumpDistanceInUniverse(this.universe, fromPlanet.systemId, target.systemId, this.portalLinks);
    if (jumps < 0) return "Système inaccessible";

    const resources = { ...colony.resources };
    for (const [res, amount] of Object.entries(COLONY_SHIP_COST) as [ResourceId, number][]) {
      if (resources[res] < amount) {
        return `Ressources insuffisantes pour le vaisseau colonial (${amount} ${res})`;
      }
    }
    // Frein politique : chaque colonie supplémentaire coûte de l'influence.
    const pendingColonies = [...empire.missionMap.values()].filter(
      (m) => m.kind === "colonize",
    ).length;
    const influenceCost = colonizeInfluenceCost(empire.colonyMap.size + pendingColonies);
    if (empire.influence < influenceCost) {
      return `Influence insuffisante (${Math.floor(empire.influence)}/${influenceCost})`;
    }
    for (const [res, amount] of Object.entries(COLONY_SHIP_COST) as [ResourceId, number][]) {
      resources[res] -= amount;
    }
    empire.influence -= influenceCost;
    empire.colonyMap.set(colony.id, { ...colony, resources });
    this.persistColony(empire.colonyMap.get(colony.id)!);
    this.insertMission(
      empire,
      "colonize",
      colonyId,
      planetId,
      colonyShipDurationMs(jumps) * empire.effects.colonyShipSpeedMult,
    );
    this.notify();
    return null;
  }

  /** Action joueur : livrer des ressources au chantier de portail (tech requise). */
  contributeGateway(
    empire: Empire,
    colonyId: string,
    galaxyId: string,
    wanted: Partial<Record<ResourceId, number>>,
  ): string | null {
    if (!empire.researched.includes("gateway_engineering")) {
      return "Technologie « Ingénierie des portails » requise";
    }
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    const gateway = this.gatewayMap.get(galaxyId);
    if (!gateway) return "Aucun chantier de portail vers cette galaxie";
    if (gateway.active) return "Portail déjà actif";
    if (gateway.activatesAt) return "Chantier final en cours";

    const remaining = gatewayRemaining(gateway);
    const cargo: Partial<Record<ResourceId, number>> = {};
    for (const [res, raw] of Object.entries(wanted) as [ResourceId, number][]) {
      const amount = Math.floor(Number(raw));
      if (!Number.isFinite(amount) || amount <= 0) continue;
      if (!(res in GATEWAY_COST)) return `Le chantier ne demande pas de ${res}`;
      cargo[res] = Math.min(amount, remaining[res] ?? 0);
    }
    if (Object.values(cargo).every((n) => !n)) return "Cargaison vide (ou déjà couverte)";

    const fromPlanet = this.planetsById.get(colony.planetId);
    if (!fromPlanet) return "Planète inconnue";
    // Le chantier se mène depuis l'ancrage de la galaxie PARENTE (le versant proche du
    // trou de ver) : on ne peut donc financer un portail que si l'on atteint déjà sa
    // voisine — l'expansion se fait de proche en proche.
    const childIndex = this.universe.galaxies.findIndex((g) => g.id === galaxyId);
    const parentIndex = galaxyParentIndex(this.universe, childIndex);
    const anchorId =
      parentIndex === null
        ? this.universe.galaxies[0]!.anchorSystemId
        : this.universe.galaxies[parentIndex]!.anchorSystemId;
    const jumps = jumpDistanceInUniverse(this.universe, fromPlanet.systemId, anchorId, this.portalLinks);
    if (jumps < 0) return "Galaxie voisine encore inaccessible";
    const fee = transferCostCredits(jumps);

    const resources = { ...colony.resources };
    if (resources.credits < fee + (cargo.credits ?? 0)) {
      return `Crédits insuffisants (cargaison + frais ${fee})`;
    }
    for (const [res, amount] of Object.entries(cargo) as [ResourceId, number][]) {
      if (resources[res] < amount) return `Stock insuffisant : ${res}`;
    }

    const duration = transferDurationMs(jumps) * empire.effects.transferSpeedMult;
    const reserved = this.reserveShip(empire, colony, Date.now() + 2 * duration);
    if (!reserved) return "Aucun cargo disponible";
    const physical = Object.entries(cargo)
      .filter(([res]) => res !== "credits")
      .reduce((s, [, n]) => s + (n ?? 0), 0);
    if (physical > reserved.capacity) {
      return `Cargaison trop lourde (soute : ${reserved.capacity})`;
    }

    resources.credits -= fee;
    for (const [res, amount] of Object.entries(cargo) as [ResourceId, number][]) {
      resources[res] -= amount;
    }
    empire.colonyMap.set(colony.id, { ...reserved.colony, resources });
    this.persistColony(empire.colonyMap.get(colony.id)!);
    this.insertMission(empire, "contribute_gateway", colonyId, galaxyId, duration, { cargo });
    this.notify();
    return null;
  }

  // ─────────────────────────── Contrats de fourniture (chantier 14) ───────────────────────────

  /** Action joueur : publier un contrat — crédits mis sous séquestre jusqu'à expiration/annulation. */
  postContract(
    empire: Empire,
    colonyId: string,
    resource: ResourceId,
    quantity: number,
    pricePerUnit: number,
    durationMs: number,
  ): string | null {
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    if (!(MARKET_RESOURCES as readonly string[]).includes(resource)) {
      return `Ressource non contractualisable : ${resource}`;
    }
    const qty = Math.floor(Number(quantity));
    if (!Number.isFinite(qty) || qty <= 0) return "Quantité invalide";
    const price = Number(pricePerUnit);
    if (!Number.isFinite(price) || price <= 0) return "Prix invalide";

    const openCount = [...this.contractMap.values()].filter(
      (c) => c.issuerId === empire.id && c.status === "open",
    ).length;
    if (openCount >= MAX_OPEN_CONTRACTS_PER_EMPIRE) return "Trop de contrats ouverts (dix au plus)";

    const escrow = contractEscrow(qty, price);
    if (colony.resources.credits < escrow) return `Crédits insuffisants (séquestre : ${escrow})`;

    const planet = this.planetsById.get(colony.planetId);
    if (!planet) return "Planète inconnue";

    const now = Date.now();
    const contract: Contract = {
      id: randomUUID(),
      issuerId: empire.id,
      issuerName: empire.name,
      issuerColor: empire.color,
      colonyId: colony.id,
      colonyName: colony.name,
      systemId: planet.systemId,
      resource,
      quantity: qty,
      remaining: qty,
      pricePerUnit: price,
      createdAt: now,
      deadline: now + clampContractDuration(Number(durationMs)),
      status: "open",
    };
    const resources = { ...colony.resources, credits: colony.resources.credits - escrow };
    empire.colonyMap.set(colony.id, { ...colony, resources });
    this.persistColony(empire.colonyMap.get(colony.id)!);
    this.contractMap.set(contract.id, contract);
    this.insertContract(contract);
    this.notify();
    return null;
  }

  /** Action joueur : accepter (tout ou partie d')un contrat étranger et affréter le convoi. */
  acceptContract(
    empire: Empire,
    colonyId: string,
    contractId: string,
    quantity: number,
  ): string | null {
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    const contract = this.contractMap.get(contractId);
    if (!contract) return "Contrat inconnu";
    if (contract.issuerId === empire.id) return "Impossible d'accepter son propre contrat";

    const now = Date.now();
    const qty = Math.floor(Number(quantity));
    if (!contractAcceptable(contract, qty, now)) return "Contrat indisponible pour cette quantité";

    const fromPlanet = this.planetsById.get(colony.planetId);
    if (!fromPlanet) return "Planète inconnue";
    const jumps = jumpDistanceInUniverse(this.universe, fromPlanet.systemId, contract.systemId, this.portalLinks);
    if (jumps < 0) return "Colonie destinataire inaccessible";
    const portals = this.portalsCrossed(fromPlanet.systemId, contract.systemId);

    const cargo: Partial<Record<ResourceId, number>> = { [contract.resource]: qty };
    const loaded = takeFromOrbit(colony, cargo);
    if (!loaded) return `Stock orbital insuffisant : ${contract.resource}`;

    const speed = empire.effects.transferSpeedMult;
    const one = this.reserveShip(empire, loaded, now + 2 * transferDurationMs(jumps) * speed);
    if (!one) return "Convoi indisponible : vaisseaux manquants";
    const reserved = { colony: one.colony, ships: { [one.shipId]: 1 }, capacity: one.capacity };
    if (qty > reserved.capacity) return `Cargaison trop lourde pour ce convoi (soute : ${reserved.capacity})`;

    const duration = convoyDurationMs(jumps, reserved.ships) * speed;
    const fee = convoyFees(jumps, portals);
    const fuel = Math.ceil(convoyFuel(jumps, reserved.ships, qty) * empire.effects.fuelMult);
    const resources = { ...reserved.colony.resources };
    if (resources.credits < fee) return `Crédits insuffisants (frais : ${fee})`;
    const fueled = takeFromOrbit(reserved.colony, { energy: fuel });
    if (!fueled) return `Carburant insuffisant en orbite (${fuel} énergie)`;
    resources.credits -= fee;

    empire.colonyMap.set(colony.id, { ...fueled, resources });
    this.persistColony(empire.colonyMap.get(colony.id)!);

    // Décompté à l'acceptation (pas à la livraison) : bloque toute survente pendant le trajet.
    const remaining = contract.remaining - qty;
    const nextContract: Contract = {
      ...contract,
      remaining,
      status: remaining <= 0 ? "fulfilled" : "open",
    };
    this.contractMap.set(contract.id, nextContract);
    this.persistContract(nextContract);

    this.insertMission(
      empire,
      "deliver_contract",
      colonyId,
      contract.colonyId,
      duration,
      { cargo, contractId: contract.id },
      now,
    );
    this.notify();
    return null;
  }

  /** Action joueur : annuler son propre contrat — rembourse le séquestre du reliquat non honoré. */
  cancelContract(empire: Empire, contractId: string): string | null {
    const contract = this.contractMap.get(contractId);
    if (!contract) return "Contrat inconnu";
    if (contract.issuerId !== empire.id) return "Seul l'émetteur peut annuler ce contrat";
    if (contract.status !== "open") return "Contrat déjà clos";

    const colony = empire.colonyMap.get(contract.colonyId);
    if (colony) {
      const refund = contractEscrow(contract.remaining, contract.pricePerUnit);
      const resources = { ...colony.resources, credits: colony.resources.credits + refund };
      empire.colonyMap.set(colony.id, { ...colony, resources });
      this.persistColony(empire.colonyMap.get(colony.id)!);
    }
    const next: Contract = { ...contract, status: "cancelled" };
    this.contractMap.set(contract.id, next);
    this.persistContract(next);
    this.notify();
    return null;
  }

  // ─────────────────────────── Flottes & combat ───────────────────────────

  /** Action joueur : créer une flotte vide rattachée à une colonie. */
  createFleet(empire: Empire, colonyId: string, name: string): string | null {
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    const systemId = this.planetsById.get(colony.planetId)?.systemId;
    if (!systemId) return "Système inconnu";
    const fleet: Fleet = {
      id: randomUUID(),
      ownerId: empire.id,
      name: name.trim().slice(0, 40) || "Flotte",
      systemId,
      homeColonyId: colonyId,
      ships: {},
      directives: { ...DEFAULT_DIRECTIVES },
      queue: [],
      movement: null,
    };
    empire.fleetMap.set(fleet.id, fleet);
    this.persistFleet(fleet, true);
    this.notify();
    return null;
  }

  /** Action joueur : produire un vaisseau de guerre (file de la flotte, tech requise). */
  buildWarship(empire: Empire, fleetId: string, warshipId: string): string | null {
    const fleet = empire.fleetMap.get(fleetId);
    if (!fleet) return "Flotte inconnue";
    if (fleet.movement) return "Flotte en déplacement";
    const def = WARSHIPS[warshipId as WarshipId];
    if (!def) return "Vaisseau inconnu";
    const home = empire.colonyMap.get(fleet.homeColonyId);
    if (!home) return "Colonie de rattachement inconnue";
    if ((home.buildings.shipyard ?? 0) < 1) return "Chantier naval requis";
    if (!empire.researched.includes(def.requiresTech)) {
      return "Technologie militaire requise";
    }
    if (fleet.queue.length >= 5) return "File de production pleine";
    const resources = { ...home.resources };
    for (const [res, amount] of Object.entries(def.cost) as [ResourceId, number][]) {
      if (resources[res] < amount) return `Ressources insuffisantes (${amount} ${res})`;
    }
    for (const [res, amount] of Object.entries(def.cost) as [ResourceId, number][]) {
      resources[res] -= amount;
    }
    empire.colonyMap.set(home.id, { ...home, resources });
    this.persistColony(empire.colonyMap.get(home.id)!);
    const now = Date.now();
    const lastFinish = fleet.queue.at(-1)?.finishesAt ?? now;
    const startedAt = Math.max(now, lastFinish);
    const next: Fleet = {
      ...fleet,
      queue: [...fleet.queue, { warshipId, startedAt, finishesAt: startedAt + def.buildMs }],
    };
    empire.fleetMap.set(fleetId, next);
    this.persistFleet(next);
    this.notify();
    return null;
  }

  setFleetDirectives(
    empire: Empire,
    fleetId: string,
    directives: Record<string, string>,
  ): string | null {
    const fleet = empire.fleetMap.get(fleetId);
    if (!fleet) return "Flotte inconnue";
    const next: Fleet = {
      ...fleet,
      directives: {
        long: directives.long ?? fleet.directives.long ?? "focus_fire",
        medium: directives.medium ?? fleet.directives.medium ?? "focus_fire",
        short: directives.short ?? fleet.directives.short ?? "focus_fire",
      },
    };
    empire.fleetMap.set(fleetId, next);
    this.persistFleet(next);
    this.notify();
    return null;
  }

  /** Action joueur : déplacer une flotte vers un système accessible. */
  moveFleet(empire: Empire, fleetId: string, toSystemId: string): string | null {
    const fleet = empire.fleetMap.get(fleetId);
    if (!fleet) return "Flotte inconnue";
    if (fleet.movement) return "Flotte déjà en déplacement";
    if (fleet.queue.length > 0) return "Production en cours au chantier";
    if (toSystemId === fleet.systemId) return "Déjà sur place";
    const jumps = jumpDistanceInUniverse(this.universe, fleet.systemId, toSystemId, this.portalLinks);
    if (jumps < 0) return "Système inaccessible";
    const now = Date.now();
    const next: Fleet = {
      ...fleet,
      movement: {
        toSystemId,
        departedAt: now,
        arrivesAt: now + transferDurationMs(jumps) * empire.effects.transferSpeedMult,
      },
    };
    empire.fleetMap.set(fleetId, next);
    this.persistFleet(next);
    this.notify();
    return null;
  }

  /** Action joueur : attaquer un repaire pirate présent dans le système de la flotte. */
  attackLair(empire: Empire, fleetId: string, lairId: string): string | null {
    const fleet = empire.fleetMap.get(fleetId);
    if (!fleet) return "Flotte inconnue";
    if (fleet.movement) return "Flotte en déplacement";
    const lair = this.lairMap.get(lairId);
    if (!lair) return "Repaire inconnu";
    if (lair.systemId !== fleet.systemId) return "Flotte pas sur zone";
    if (fleetIsEmpty(fleet.ships)) return "Flotte sans vaisseau";

    const report = resolveBattle(
      fleet.ships as FleetComposition,
      lair.ships as FleetComposition,
      fleet.directives as never,
      lair.directives as never,
    );
    this.archiveBattle(fleet.systemId, fleet.name, "Repaire pirate", report);

    // Mise à jour de la flotte (survivants).
    const updatedFleet: Fleet = { ...fleet, ships: report.attackerSurvivors };
    empire.fleetMap.set(fleetId, updatedFleet);
    this.persistFleet(updatedFleet);

    if (report.winner === "attacker") {
      // Butin crédité à la colonie de rattachement, repaire détruit.
      const home = empire.colonyMap.get(fleet.homeColonyId);
      if (home) {
        empire.colonyMap.set(home.id, {
          ...home,
          resources: { ...home.resources, credits: home.resources.credits + lair.bounty },
        });
        this.persistColony(empire.colonyMap.get(home.id)!);
      }
      this.lairMap.delete(lairId);
      db.delete(schema.pirateLairs).where(eq(schema.pirateLairs.id, lairId)).run();
      console.log(`[game] repaire nettoyé (butin ${lair.bounty})`);
    } else {
      // Le repaire survivant est réduit à ses rescapés.
      const survivingLair: PirateLair = { ...lair, ships: report.defenderSurvivors };
      if (fleetIsEmpty(survivingLair.ships)) {
        this.lairMap.delete(lairId);
        db.delete(schema.pirateLairs).where(eq(schema.pirateLairs.id, lairId)).run();
      } else {
        this.lairMap.set(lairId, survivingLair);
        this.persistLair(survivingLair);
      }
    }
    this.notify();
    return null;
  }

  disbandFleet(empire: Empire, fleetId: string): string | null {
    const fleet = empire.fleetMap.get(fleetId);
    if (!fleet) return "Flotte inconnue";
    if (fleet.movement) return "Flotte en déplacement";
    empire.fleetMap.delete(fleetId);
    db.delete(schema.fleets).where(eq(schema.fleets.id, fleetId)).run();
    this.notify();
    return null;
  }

  // ─────────────────────────── Diplomatie (chantier 16) ───────────────────────────

  /** Relation entre deux empires, "neutre" par défaut en l'absence de ligne. */
  private relationEntry(a: string, b: string): Relation {
    return (
      this.relationMap.get(relationKey(a, b)) ?? {
        empireA: a < b ? a : b,
        empireB: a < b ? b : a,
        state: "neutral",
        since: 0,
        until: null,
      }
    );
  }

  /** Deux empires sont-ils en guerre ? */
  private atWar(a: string, b: string): boolean {
    return this.relationEntry(a, b).state === "war";
  }

  /** Écrit une relation (créée ou mise à jour), symétrique et persistée. */
  private setRelation(a: string, b: string, state: RelationState, until: number | null): void {
    const key = relationKey(a, b);
    const existed = this.relationMap.has(key);
    const [empireA, empireB] = a < b ? [a, b] : [b, a];
    const relation: Relation = { empireA, empireB, state, since: Date.now(), until };
    this.relationMap.set(key, relation);
    if (existed) this.persistRelation(relation);
    else this.insertRelation(relation);
  }

  private loadRelations(): void {
    for (const row of db.select().from(schema.relations).all()) {
      this.relationMap.set(relationKey(row.empireA, row.empireB), {
        empireA: row.empireA,
        empireB: row.empireB,
        state: row.state as RelationState,
        since: row.since,
        until: row.until,
      });
    }
  }

  private insertRelation(relation: Relation): void {
    db.insert(schema.relations)
      .values({
        gameId: this.clock.id,
        empireA: relation.empireA,
        empireB: relation.empireB,
        state: relation.state,
        since: relation.since,
        until: relation.until,
      })
      .run();
  }

  private persistRelation(relation: Relation): void {
    db.update(schema.relations)
      .set({ state: relation.state, since: relation.since, until: relation.until })
      .where(
        and(eq(schema.relations.empireA, relation.empireA), eq(schema.relations.empireB, relation.empireB)),
      )
      .run();
  }

  /** Action joueur : déclarer la guerre à un empire — unilatérale, mais coûteuse en influence. */
  declareWar(empire: Empire, targetEmpireId: string): string | null {
    if (targetEmpireId === empire.id) return "Cible invalide";
    const target = this.empires.get(targetEmpireId);
    if (!target) return "Empire inconnu";
    const current = this.relationEntry(empire.id, targetEmpireId);
    const reason = declareWarReason(current.state, Date.now(), current.until);
    if (reason) return reason;
    if (empire.influence < DECLARE_WAR_INFLUENCE_COST) {
      return `Influence insuffisante (${Math.floor(empire.influence)}/${DECLARE_WAR_INFLUENCE_COST})`;
    }
    empire.influence -= DECLARE_WAR_INFLUENCE_COST;
    this.setRelation(empire.id, targetEmpireId, "war", null);
    console.log(`[game] « ${empire.name} » déclare la guerre à « ${target.name} »`);
    this.notify();
    return null;
  }

  /** Action joueur : faire la paix avec un empire — rouvre un cooldown avant re-déclaration. */
  makePeace(empire: Empire, targetEmpireId: string): string | null {
    if (targetEmpireId === empire.id) return "Cible invalide";
    const current = this.relationEntry(empire.id, targetEmpireId);
    const reason = makePeaceReason(current.state);
    if (reason) return reason;
    this.setRelation(empire.id, targetEmpireId, "neutral", Date.now() + WAR_COOLDOWN_MS);
    this.notify();
    return null;
  }

  /** Puissance de flotte totale d'un empire (somme de toutes ses flottes). */
  private empireFleetPower(empire: Empire): number {
    let power = 0;
    for (const fleet of empire.fleetMap.values()) power += fleetPower(fleet.ships as FleetComposition);
    return power;
  }

  /** Action joueur : proposer un pacte (NAP ou alliance) — exige le consentement de la cible. */
  proposeRelation(empire: Empire, targetEmpireId: string, kind: ProposalKind): string | null {
    if (targetEmpireId === empire.id) return "Cible invalide";
    const target = this.empires.get(targetEmpireId);
    if (!target) return "Empire inconnu";
    const current = this.relationEntry(empire.id, targetEmpireId).state;
    const reason = proposeRelationReason(current, kind);
    if (reason) return reason;
    const key = relationKey(empire.id, targetEmpireId);
    const alreadyPending = [...this.proposalMap.values()].some(
      (p) => relationKey(p.fromEmpireId, p.toEmpireId) === key,
    );
    if (alreadyPending) return "Une proposition est déjà en attente entre ces deux empires";

    const proposal: RelationProposal = {
      id: randomUUID(),
      fromEmpireId: empire.id,
      toEmpireId: targetEmpireId,
      kind,
      createdAt: Date.now(),
    };
    this.proposalMap.set(proposal.id, proposal);
    this.insertProposal(proposal);
    // Un PNJ ne « joue » jamais : il répond tout de suite, pas d'attente indéfinie.
    if (target.kind === "npc") {
      this.resolveProposal(
        proposal,
        npcAcceptsProposal(kind, this.empireFleetPower(target), this.empireFleetPower(empire)),
      );
    }
    this.notify();
    return null;
  }

  /** Action joueur : répondre (accepter/refuser) une proposition qui lui est adressée. */
  respondRelation(empire: Empire, proposalId: string, accept: boolean): string | null {
    const proposal = this.proposalMap.get(proposalId);
    if (!proposal || proposal.toEmpireId !== empire.id) return "Proposition inconnue";
    this.resolveProposal(proposal, accept);
    this.notify();
    return null;
  }

  /** Action joueur : retirer sa propre proposition avant qu'elle ne reçoive de réponse. */
  cancelProposal(empire: Empire, proposalId: string): string | null {
    const proposal = this.proposalMap.get(proposalId);
    if (!proposal || proposal.fromEmpireId !== empire.id) return "Proposition inconnue";
    this.proposalMap.delete(proposalId);
    this.deleteProposal(proposalId);
    this.notify();
    return null;
  }

  /** Action joueur : rompre un pacte (NAP ou alliance) en vigueur — retour à neutre. */
  breakRelation(empire: Empire, targetEmpireId: string): string | null {
    if (targetEmpireId === empire.id) return "Cible invalide";
    const current = this.relationEntry(empire.id, targetEmpireId).state;
    const reason = breakRelationReason(current);
    if (reason) return reason;
    this.setRelation(empire.id, targetEmpireId, "neutral", null);
    this.notify();
    return null;
  }

  /** Accepte ou refuse une proposition en attente, et la retire dans tous les cas. */
  private resolveProposal(proposal: RelationProposal, accept: boolean): void {
    this.proposalMap.delete(proposal.id);
    this.deleteProposal(proposal.id);
    if (accept) this.setRelation(proposal.fromEmpireId, proposal.toEmpireId, proposal.kind, null);
  }

  private loadProposals(): void {
    for (const row of db.select().from(schema.relationProposals).all()) {
      this.proposalMap.set(row.id, {
        id: row.id,
        fromEmpireId: row.fromEmpireId,
        toEmpireId: row.toEmpireId,
        kind: row.kind as ProposalKind,
        createdAt: row.createdAt,
      });
    }
  }

  private insertProposal(proposal: RelationProposal): void {
    db.insert(schema.relationProposals)
      .values({
        id: proposal.id,
        gameId: this.clock.id,
        fromEmpireId: proposal.fromEmpireId,
        toEmpireId: proposal.toEmpireId,
        kind: proposal.kind,
        createdAt: proposal.createdAt,
      })
      .run();
  }

  private deleteProposal(id: string): void {
    db.delete(schema.relationProposals).where(eq(schema.relationProposals.id, id)).run();
  }

  /** Retire une flotte (survivants nuls) ou la met à jour (chantier 7d — PvP). */
  private applyFleetSurvivors(empire: Empire, fleet: Fleet, ships: FleetComposition): void {
    if (fleetIsEmpty(ships)) {
      empire.fleetMap.delete(fleet.id);
      db.delete(schema.fleets).where(eq(schema.fleets.id, fleet.id)).run();
    } else {
      const next: Fleet = { ...fleet, ships };
      empire.fleetMap.set(fleet.id, next);
      this.persistFleet(next);
    }
  }

  /** Action joueur : attaquer une flotte ennemie stationnée dans le même système (PvP). */
  attackFleet(empire: Empire, fleetId: string, targetFleetId: string): string | null {
    const fleet = empire.fleetMap.get(fleetId);
    if (!fleet) return "Flotte inconnue";
    if (fleet.movement) return "Flotte en déplacement";
    if (fleetIsEmpty(fleet.ships)) return "Flotte sans vaisseau";
    const target = this.findFleet(targetFleetId);
    if (!target || target.empire.id === empire.id) return "Cible inconnue";
    if (!this.atWar(empire.id, target.empire.id)) return "En paix — déclarez la guerre d'abord";
    if (target.fleet.movement) return "Cible en déplacement";
    if (target.fleet.systemId !== fleet.systemId) return "Cible hors de portée";
    if (fleetIsEmpty(target.fleet.ships)) return "Cible sans vaisseau";

    const report = resolveBattle(
      fleet.ships as FleetComposition,
      target.fleet.ships as FleetComposition,
      fleet.directives as never,
      target.fleet.directives as never,
    );
    this.archiveBattle(fleet.systemId, fleet.name, `${target.empire.name} — ${target.fleet.name}`, report);
    this.applyFleetSurvivors(empire, fleet, report.attackerSurvivors as FleetComposition);
    this.applyFleetSurvivors(target.empire, target.fleet, report.defenderSurvivors as FleetComposition);
    this.notify();
    return null;
  }

  /**
   * Action joueur : attaquer une colonie ennemie (PvP — raid). La flotte ennemie la
   * plus puissante stationnée sur zone défend d'abord ; si l'attaquant l'emporte (ou
   * qu'il n'y a pas de défenseur), il pille une fraction des ressources et rompt le
   * claim ennemi sur le système. Pas de capture de colonie à ce stade.
   */
  attackColony(empire: Empire, fleetId: string, targetColonyId: string): string | null {
    const fleet = empire.fleetMap.get(fleetId);
    if (!fleet) return "Flotte inconnue";
    if (fleet.movement) return "Flotte en déplacement";
    if (fleetIsEmpty(fleet.ships)) return "Flotte sans vaisseau";
    const target = this.findColony(targetColonyId);
    if (!target || target.empire.id === empire.id) return "Colonie cible inconnue";
    if (!this.atWar(empire.id, target.empire.id)) return "En paix — déclarez la guerre d'abord";
    const systemId = this.planetsById.get(target.colony.planetId)?.systemId;
    if (!systemId) return "Système inconnu";
    if (systemId !== fleet.systemId) return "Cible hors de portée";

    // Défense : la flotte ennemie la plus fournie stationnée dans le système.
    const shipCount = (ships: Fleet["ships"]): number => {
      let total = 0;
      for (const n of Object.values(ships)) total += n ?? 0;
      return total;
    };
    const defender = [...target.empire.fleetMap.values()]
      .filter((f) => f.systemId === systemId && !f.movement && !fleetIsEmpty(f.ships))
      .sort((a, b) => shipCount(b.ships) - shipCount(a.ships))[0];

    if (defender) {
      const report = resolveBattle(
        fleet.ships as FleetComposition,
        defender.ships as FleetComposition,
        fleet.directives as never,
        defender.directives as never,
      );
      this.archiveBattle(systemId, fleet.name, `${target.empire.name} — ${defender.name}`, report);
      this.applyFleetSurvivors(target.empire, defender, report.defenderSurvivors as FleetComposition);
      this.applyFleetSurvivors(empire, fleet, report.attackerSurvivors as FleetComposition);
      // Attaquant anéanti ou défense victorieuse → pas de raid.
      if (fleetIsEmpty(report.attackerSurvivors) || report.winner !== "attacker") {
        this.notify();
        return null;
      }
    }

    // Raid : pillage d'une fraction des ressources, crédité à la colonie de rattachement.
    const home = empire.colonyMap.get(fleet.homeColonyId);
    const victim = target.empire.colonyMap.get(targetColonyId)!;
    const stolen: Partial<Record<ResourceId, number>> = {};
    const victimResources = { ...victim.resources };
    for (const res of RESOURCES) {
      const take = Math.floor(victimResources[res] * RAID_FRACTION);
      if (take <= 0) continue;
      stolen[res] = take;
      victimResources[res] -= take;
    }
    target.empire.colonyMap.set(victim.id, { ...victim, resources: victimResources });
    this.persistColony(target.empire.colonyMap.get(victim.id)!);
    if (home) {
      const homeResources = { ...home.resources };
      for (const [res, amount] of Object.entries(stolen) as [ResourceId, number][]) {
        homeResources[res] = Math.min(homeResources[res] + amount, storageCap(home, res, empire.effects));
      }
      empire.colonyMap.set(home.id, { ...home, resources: homeResources });
      this.persistColony(empire.colonyMap.get(home.id)!);
    }
    // Rupture du claim ennemi sur le système pillé.
    if (target.empire.claimedSystemIds.includes(systemId)) this.dropClaim(target.empire, systemId);
    this.archiveBattle(systemId, fleet.name, `${target.empire.name} — ${victim.name} (raid)`, {
      raid: true,
      stolen,
    });
    console.log(`[game] raid sur ${victim.name} par « ${empire.name} »`);
    this.notify();
    return null;
  }

  private archiveBattle(
    systemId: string,
    attackerName: string,
    defenderName: string,
    report: unknown,
  ): void {
    const battle: StoredBattle = {
      id: randomUUID(),
      at: Date.now(),
      systemId,
      attackerName,
      defenderName,
      report,
    };
    this.battleLog = [battle, ...this.battleLog].slice(0, MAX_BATTLES);
    db.insert(schema.battles)
      .values({
        id: battle.id,
        gameId: this.clock.id,
        at: battle.at,
        systemId,
        attackerName,
        defenderName,
        report: JSON.stringify(report),
      })
      .run();
    // Purge des batailles au-delà de la limite.
    const keep = new Set(this.battleLog.map((b) => b.id));
    for (const row of db.select().from(schema.battles).all()) {
      if (!keep.has(row.id)) db.delete(schema.battles).where(eq(schema.battles.id, row.id)).run();
    }
  }

  /**
   * Résout production et déplacements des flottes de l'empire, puis la ponction
   * pirate sur ses colonies. Repaires pirates = PNJ partagés (l'apparition est
   * résolue une fois par tick au niveau univers, cf. `advance`).
   */
  private fleetsTick(empire: Empire, t: number): void {
    for (const [id, fleet] of empire.fleetMap) {
      let current = fleet;
      // Livraison des vaisseaux produits.
      const done = current.queue.filter((q) => q.finishesAt <= t);
      if (done.length > 0) {
        const ships = { ...current.ships };
        for (const item of done) ships[item.warshipId] = (ships[item.warshipId] ?? 0) + 1;
        current = { ...current, ships, queue: current.queue.filter((q) => q.finishesAt > t) };
      }
      // Arrivée d'un déplacement : la flotte révèle son système de destination.
      if (current.movement && current.movement.arrivesAt <= t) {
        const arrivedAt = current.movement.toSystemId;
        current = { ...current, systemId: arrivedAt, movement: null };
        this.markExplored(empire, arrivedAt);
      }
      if (current !== fleet) {
        empire.fleetMap.set(id, current);
        this.persistFleet(current);
      }
    }

    // Piraterie : ponction de crédits aux colonies partageant un système avec un repaire.
    for (const lair of this.lairMap.values()) {
      for (const colony of empire.colonyMap.values()) {
        if (this.planetsById.get(colony.planetId)?.systemId !== lair.systemId) continue;
        const credits = Math.max(0, colony.resources.credits - PIRATE_TAX_PER_TICK);
        empire.colonyMap.set(colony.id, {
          ...colony,
          resources: { ...colony.resources, credits },
        });
      }
    }
  }

  /** Empire propriétaire du claim d'un système, ou null (claims exclusifs — Phase E). */
  private claimOwner(systemId: string): Empire | null {
    for (const empire of this.empires.values()) {
      if (empire.claimedSystemIds.includes(systemId)) return empire;
    }
    return null;
  }

  /** Union des systèmes explorés par tous les empires (brouillard univers — Phase E). */
  private universeExplored(): Set<string> {
    const explored = new Set<string>();
    for (const empire of this.empires.values()) {
      for (const systemId of empire.explored) explored.add(systemId);
    }
    return explored;
  }

  /**
   * Apparition de repaires pirates PNJ (univers partagé, une fois par tick éco).
   * Brouillard univers (union des empires) ; jamais dans un système revendiqué.
   */
  private spawnPirates(tickNumber: number): void {
    for (const systemId of this.universeExplored()) {
      if (this.claimOwner(systemId)) continue;
      if ([...this.lairMap.values()].some((l) => l.systemId === systemId)) continue;
      const rng = createRng(`pirate-${this.clock.seed}-${systemId}-${tickNumber}`);
      if (rng() > PIRATE_SPAWN_CHANCE) continue;
      // Menace croissante selon l'éloignement de la galaxie d'origine.
      const galaxy = this.universe.galaxies.find((g) => g.systems.some((s) => s.id === systemId));
      const threat = galaxy && galaxy.id !== "gal-0" ? 3 : randInt(rng, 1, 2);
      const ships = pirateComposition(rng, threat);
      const lair: PirateLair = {
        id: randomUUID(),
        systemId,
        ships,
        directives: pirateDirectives(rng),
        bounty: pirateBounty(ships),
      };
      this.lairMap.set(lair.id, lair);
      this.persistLair(lair, true);
    }
  }

  private persistFleet(fleet: Fleet, insert = false): void {
    const values = {
      name: fleet.name,
      systemId: fleet.systemId,
      homeColonyId: fleet.homeColonyId,
      ships: JSON.stringify(fleet.ships),
      directives: JSON.stringify(fleet.directives),
      queue: JSON.stringify(fleet.queue),
      movement: fleet.movement ? JSON.stringify(fleet.movement) : null,
    };
    if (insert) {
      db.insert(schema.fleets)
        .values({ id: fleet.id, gameId: this.clock.id, ownerId: fleet.ownerId ?? this.defaultEmpire.id, ...values })
        .run();
    } else {
      db.update(schema.fleets).set(values).where(eq(schema.fleets.id, fleet.id)).run();
    }
  }

  private persistLair(lair: PirateLair, insert = false): void {
    const values = {
      systemId: lair.systemId,
      ships: JSON.stringify(lair.ships),
      directives: JSON.stringify(lair.directives),
      bounty: lair.bounty,
    };
    if (insert) {
      db.insert(schema.pirateLairs).values({ id: lair.id, gameId: this.clock.id, ...values }).run();
    } else {
      db.update(schema.pirateLairs).set(values).where(eq(schema.pirateLairs.id, lair.id)).run();
    }
  }

  private loadFleets(): void {
    for (const row of db.select().from(schema.fleets).all()) {
      const ownerId = row.ownerId ?? this.defaultEmpire.id;
      const empire = this.empires.get(ownerId) ?? this.defaultEmpire;
      empire.fleetMap.set(row.id, {
        id: row.id,
        ownerId,
        name: row.name,
        systemId: row.systemId,
        homeColonyId: row.homeColonyId,
        ships: JSON.parse(row.ships),
        directives: JSON.parse(row.directives),
        queue: JSON.parse(row.queue),
        movement: row.movement ? JSON.parse(row.movement) : null,
      });
    }
  }

  private loadPirates(): void {
    for (const row of db.select().from(schema.pirateLairs).all()) {
      this.lairMap.set(row.id, {
        id: row.id,
        systemId: row.systemId,
        ships: JSON.parse(row.ships),
        directives: JSON.parse(row.directives),
        bounty: row.bounty,
      });
    }
  }

  private loadBattles(): void {
    this.battleLog = db
      .select()
      .from(schema.battles)
      .all()
      .map((row) => ({
        id: row.id,
        at: row.at,
        systemId: row.systemId,
        attackerName: row.attackerName,
        defenderName: row.defenderName,
        report: JSON.parse(row.report),
      }))
      .sort((a, b) => b.at - a.at)
      .slice(0, MAX_BATTLES);
  }

  /**
   * Ouvre un chantier de portail pour chaque galaxie lointaine qui n'en a pas encore.
   * Idempotent : rejoué après chaque extension de l'univers (chantier 9).
   */
  private initGateways(): void {
    for (const galaxy of this.universe.galaxies.slice(1)) {
      if (this.gatewayMap.has(galaxy.id)) continue;
      const gateway: Gateway = { galaxyId: galaxy.id, progress: {}, activatesAt: null, active: false };
      this.gatewayMap.set(galaxy.id, gateway);
      db.insert(schema.gateways)
        .values({ galaxyId: galaxy.id, gameId: this.clock.id, progress: "{}", activatesAt: null, active: 0 })
        .run();
    }
  }

  /** Dote chaque faction d'un état (chantier 15). Idempotent : rejoué sans jamais dédoubler. */
  private initFactionStates(): void {
    for (const factionId of FACTION_IDS) {
      if (this.factionStateMap.has(factionId)) continue;
      const state: FactionState = { factionId, mood: "neutral", moodUntil: null };
      this.factionStateMap.set(factionId, state);
      this.insertFactionState(state);
    }
  }

  private loadFactionStates(): void {
    for (const row of db.select().from(schema.factionStates).all()) {
      this.factionStateMap.set(row.factionId, {
        factionId: row.factionId,
        mood: row.mood as FactionState["mood"],
        moodUntil: row.moodUntil,
      });
    }
  }

  private insertFactionState(state: FactionState): void {
    db.insert(schema.factionStates)
      .values({
        factionId: state.factionId,
        gameId: this.clock.id,
        mood: state.mood,
        moodUntil: state.moodUntil,
      })
      .run();
  }

  private persistFactionState(state: FactionState): void {
    db.update(schema.factionStates)
      .set({ mood: state.mood, moodUntil: state.moodUntil })
      .where(eq(schema.factionStates.factionId, state.factionId))
      .run();
  }

  // ── Extension de l'univers (chantier 9) ────────────────────────────────

  /** Occupation par galaxie, matière première des règles d'expansion (`sim/expansion`). */
  private galaxyOccupancy(): GalaxyOccupancy[] {
    const occupiedPlanets = new Set<string>();
    /** Empires ayant au moins une colonie, par index de galaxie. */
    const empiresByGalaxy = new Map<number, Set<string>>();
    for (const empire of this.empires.values()) {
      for (const colony of empire.colonyMap.values()) {
        occupiedPlanets.add(colony.planetId);
        const systemId = this.planetsById.get(colony.planetId)?.systemId;
        const index = systemId === undefined ? undefined : this.galaxyIndexOfSystem.get(systemId);
        if (index === undefined) continue;
        const set = empiresByGalaxy.get(index) ?? new Set<string>();
        set.add(empire.id);
        empiresByGalaxy.set(index, set);
      }
    }
    return this.universe.galaxies.map((galaxy, index) => {
      let colonies = 0;
      let freeHabitable = 0;
      for (const system of galaxy.systems) {
        for (const planet of system.planets) {
          if (occupiedPlanets.has(planet.id)) colonies++;
          else if (planet.type !== "gas") freeHabitable++;
        }
      }
      return { index, colonies, empires: empiresByGalaxy.get(index)?.size ?? 0, freeHabitable };
    });
  }

  /**
   * Déroule `count` galaxies de plus depuis la seed. Les galaxies déjà générées sont
   * intactes (RNG dérivé par index — chantier 9.1) : on ajoute, on ne régénère pas.
   */
  private growUniverse(count: number): void {
    if (count <= 0) return;
    const from = this.universe.galaxies.length;
    const added = Array.from({ length: count }, (_, i) =>
      generateGalaxyAt(this.clock.seed, from + i),
    );
    this.universe = { ...this.universe, galaxies: [...this.universe.galaxies, ...added] };
    this.clock.galaxyCount = this.universe.galaxies.length;
    this.reindexUniverse();
    // Les galaxies neuves arrivent avec leurs comptoirs et leur chantier de portail.
    this.initMarkets();
    this.initGateways();
    db.update(schema.games)
      .set({ galaxyCount: this.clock.galaxyCount })
      .where(eq(schema.games.id, this.clock.id))
      .run();
    // Tous les clients doivent recevoir la nouvelle carte, y compris ceux qui n'ont
    // rien exploré depuis leur dernier message.
    for (const empire of this.empires.values()) empire.universeDirty = true;
    console.log(
      `[game] univers étendu : +${count} galaxie(s) (${added.map((g) => g.name).join(", ")}) — ${this.clock.galaxyCount} au total`,
    );
    this.notify();
  }

  /** Maintient la frontière glissante : toujours des galaxies vierges devant les joueurs. */
  private ensureFrontier(): void {
    this.growUniverse(galaxiesToAdd(this.galaxyOccupancy()));
  }

  private loadGateways(): void {
    for (const row of db.select().from(schema.gateways).all()) {
      this.gatewayMap.set(row.galaxyId, {
        galaxyId: row.galaxyId,
        progress: JSON.parse(row.progress),
        activatesAt: row.activatesAt,
        active: row.active === 1,
      });
    }
  }

  private persistGateway(gateway: Gateway): void {
    db.update(schema.gateways)
      .set({
        progress: JSON.stringify(gateway.progress),
        activatesAt: gateway.activatesAt,
        active: gateway.active ? 1 : 0,
      })
      .where(eq(schema.gateways.galaxyId, gateway.galaxyId))
      .run();
  }

  /** Active les portails dont le chantier final est terminé. */
  private resolveGateways(t: number): void {
    for (const [id, gateway] of this.gatewayMap) {
      if (gateway.active || !gateway.activatesAt || gateway.activatesAt > t) continue;
      this.gatewayMap.set(id, { ...gateway, active: true });
      this.persistGateway(this.gatewayMap.get(id)!);
      console.log(`[game] portail actif vers ${id}`);
    }
  }

  private loadContracts(): void {
    for (const row of db.select().from(schema.contracts).all()) {
      this.contractMap.set(row.id, {
        id: row.id,
        issuerId: row.issuerId,
        issuerName: row.issuerName,
        issuerColor: row.issuerColor,
        colonyId: row.colonyId,
        colonyName: row.colonyName,
        systemId: row.systemId,
        resource: row.resource as ResourceId,
        quantity: row.quantity,
        remaining: row.remaining,
        pricePerUnit: row.pricePerUnit,
        createdAt: row.createdAt,
        deadline: row.deadline,
        status: row.status as Contract["status"],
      });
    }
  }

  private insertContract(contract: Contract): void {
    db.insert(schema.contracts)
      .values({
        id: contract.id,
        gameId: this.clock.id,
        issuerId: contract.issuerId,
        issuerName: contract.issuerName,
        issuerColor: contract.issuerColor,
        colonyId: contract.colonyId,
        colonyName: contract.colonyName,
        systemId: contract.systemId,
        resource: contract.resource,
        quantity: contract.quantity,
        remaining: contract.remaining,
        pricePerUnit: contract.pricePerUnit,
        createdAt: contract.createdAt,
        deadline: contract.deadline,
        status: contract.status,
      })
      .run();
  }

  /** Ne met à jour que ce qui bouge après publication : reliquat, statut, échéance. */
  private persistContract(contract: Contract): void {
    db.update(schema.contracts)
      .set({ remaining: contract.remaining, status: contract.status, deadline: contract.deadline })
      .where(eq(schema.contracts.id, contract.id))
      .run();
  }

  /** Expire les contrats dépassés et rembourse le séquestre du reliquat non honoré. */
  private resolveContracts(t: number): void {
    for (const [id, contract] of this.contractMap) {
      if (contract.status !== "open" || !isContractExpired(contract, t)) continue;
      const issuer = this.empires.get(contract.issuerId);
      const colony = issuer?.colonyMap.get(contract.colonyId);
      if (issuer && colony) {
        const refund = contractEscrow(contract.remaining, contract.pricePerUnit);
        const resources = { ...colony.resources, credits: colony.resources.credits + refund };
        issuer.colonyMap.set(colony.id, { ...colony, resources });
        this.persistColony(issuer.colonyMap.get(colony.id)!);
      }
      const next: Contract = { ...contract, status: "expired" };
      this.contractMap.set(id, next);
      this.persistContract(next);
    }
  }

  /** Action joueur : revendiquer un système (colonie sur place requise). */
  claimSystem(empire: Empire, systemId: string): string | null {
    const system = allSystems(this.universe).find((s) => s.id === systemId);
    if (!system) return "Système inconnu";
    if (!empire.explored.has(systemId)) return "Système non exploré";
    if (empire.claimedSystemIds.includes(systemId)) return "Système déjà revendiqué";
    // Claims exclusifs (Phase E) : un système n'appartient qu'à un empire à la fois.
    if (this.claimOwner(systemId)) return "Système revendiqué par un autre empire";
    const hasColony = [...empire.colonyMap.values()].some(
      (c) => this.planetsById.get(c.planetId)?.systemId === systemId,
    );
    if (!hasColony) return "Une colonie sur place est requise pour revendiquer";
    if (empire.influence < CLAIM_COST) {
      return `Influence insuffisante (${Math.floor(empire.influence)}/${CLAIM_COST})`;
    }
    empire.influence -= CLAIM_COST;
    empire.claimedSystemIds = [...empire.claimedSystemIds, systemId];
    db.insert(schema.claims)
      .values({ systemId, gameId: this.clock.id, ownerId: empire.id, claimedAt: Date.now() })
      .run();
    this.notify();
    return null;
  }

  /** Action joueur : abandonner une revendication (sans remboursement). */
  unclaimSystem(empire: Empire, systemId: string): string | null {
    if (!empire.claimedSystemIds.includes(systemId)) return "Système non revendiqué";
    this.dropClaim(empire, systemId);
    this.notify();
    return null;
  }

  private dropClaim(empire: Empire, systemId: string): void {
    empire.claimedSystemIds = empire.claimedSystemIds.filter((id) => id !== systemId);
    db.delete(schema.claims).where(eq(schema.claims.systemId, systemId)).run();
  }

  /**
   * Outil de dev uniquement : avance le temps simulé de N secondes.
   * Décale tous les timestamps absolus (timers réels) vers le passé puis rejoue les ticks.
   */
  devFastForward(seconds: number): void {
    const delta = Math.max(0, Math.floor(seconds)) * 1000;
    if (delta <= 0) return;

    this.clock.lastTickAt -= delta;
    if (this.defaultEmpire.research) {
      this.defaultEmpire.research = {
        ...this.defaultEmpire.research,
        startedAt: this.defaultEmpire.research.startedAt - delta,
        finishesAt: this.defaultEmpire.research.finishesAt - delta,
      };
    }
    for (const [id, colony] of this.colonyMap) {
      if (
        colony.queue.length === 0 &&
        colony.shipQueue.length === 0 &&
        colony.shipsBusy.length === 0
      ) {
        continue;
      }
      this.colonyMap.set(id, {
        ...colony,
        queue: colony.queue.map((q) => ({
          ...q,
          startedAt: q.startedAt - delta,
          finishesAt: q.finishesAt - delta,
        })),
        shipQueue: colony.shipQueue.map((q) => ({
          ...q,
          startedAt: q.startedAt - delta,
          finishesAt: q.finishesAt - delta,
        })),
        shipsBusy: colony.shipsBusy.map((b) => ({ ...b, freeAt: b.freeAt - delta })),
      });
    }
    for (const [id, transfer] of this.transferMap) {
      this.transferMap.set(id, {
        ...transfer,
        departedAt: transfer.departedAt - delta,
        arrivesAt: transfer.arrivesAt - delta,
      });
    }
    for (const [id, mission] of this.missionMap) {
      this.missionMap.set(id, {
        ...mission,
        departedAt: mission.departedAt - delta,
        arrivesAt: mission.arrivesAt - delta,
      });
    }
    for (const [id, route] of this.routeMap) {
      if (!route.activeCycle) continue;
      this.routeMap.set(id, {
        ...route,
        activeCycle: {
          ...route.activeCycle,
          departedAt: route.activeCycle.departedAt - delta,
          arrivesAt: route.activeCycle.arrivesAt - delta,
          backAt: route.activeCycle.backAt - delta,
        },
      });
      this.persistRoute(this.routeMap.get(id)!);
    }
    for (const [id, gateway] of this.gatewayMap) {
      if (gateway.activatesAt === null) continue;
      this.gatewayMap.set(id, { ...gateway, activatesAt: gateway.activatesAt - delta });
      this.persistGateway(this.gatewayMap.get(id)!);
    }
    // Contrats : partagés comme les portails — l'échéance suit le même décalage.
    for (const [id, contract] of this.contractMap) {
      if (contract.status !== "open") continue;
      const next: Contract = { ...contract, deadline: contract.deadline - delta };
      this.contractMap.set(id, next);
      this.persistContract(next);
    }
    // Humeurs de faction : même décalage, pour qu'un fast-forward de dev/test les résolve.
    for (const [id, state] of this.factionStateMap) {
      if (state.moodUntil === null) continue;
      const next: FactionState = { ...state, moodUntil: state.moodUntil - delta };
      this.factionStateMap.set(id, next);
      this.persistFactionState(next);
    }
    // Cooldown de guerre : même décalage, pour qu'un fast-forward de dev/test le résolve.
    for (const [id, relation] of this.relationMap) {
      if (relation.until === null) continue;
      const next: Relation = { ...relation, until: relation.until - delta };
      this.relationMap.set(id, next);
      this.persistRelation(next);
    }
    for (const [id, fleet] of this.fleetMap) {
      if (fleet.queue.length === 0 && !fleet.movement) continue;
      const next: Fleet = {
        ...fleet,
        queue: fleet.queue.map((q) => ({
          ...q,
          startedAt: q.startedAt - delta,
          finishesAt: q.finishesAt - delta,
        })),
        movement: fleet.movement
          ? {
              ...fleet.movement,
              departedAt: fleet.movement.departedAt - delta,
              arrivesAt: fleet.movement.arrivesAt - delta,
            }
          : null,
      };
      this.fleetMap.set(id, next);
      this.persistFleet(next);
    }
    this.persistResearch(this.defaultEmpire);
    for (const transfer of this.transferMap.values()) {
      db.update(schema.transfers)
        .set({ departedAt: transfer.departedAt, arrivesAt: transfer.arrivesAt })
        .where(eq(schema.transfers.id, transfer.id))
        .run();
    }
    for (const mission of this.missionMap.values()) {
      db.update(schema.missions)
        .set({ departedAt: mission.departedAt, arrivesAt: mission.arrivesAt })
        .where(eq(schema.missions.id, mission.id))
        .run();
    }

    const missed = Math.floor((Date.now() - this.clock.lastTickAt) / TICK_MS);
    if (missed > 0) this.advance(Math.min(missed, MAX_CATCHUP_TICKS));
    console.log(`[game] fast-forward de ${seconds}s (${missed} ticks)`);
  }

  /**
   * Outil de dev uniquement : finance presque tout un portail (il reste `leave`
   * métaux à livrer) pour tester la dernière contribution et l'activation.
   */
  devFundGateway(galaxyId: string, leave = 50): void {
    const gateway = this.gatewayMap.get(galaxyId);
    if (!gateway || gateway.active) return;
    const progress: Partial<Record<ResourceId, number>> = { ...gatewayCost(galaxyId) };
    progress.metals = Math.max(0, (progress.metals ?? 0) - leave);
    let next: Gateway = { ...gateway, progress };
    // Coût entièrement couvert (`leave` = 0) : on lance le chantier final tout de suite,
    // pour qu'un `/dev/fastforward` suffise à ouvrir le portail bout en bout.
    if (gatewayCovered(next) && !next.activatesAt) {
      next = { ...next, activatesAt: Date.now() + GATEWAY_BUILD_MS };
    }
    this.gatewayMap.set(galaxyId, next);
    this.persistGateway(next);
    this.notify();
  }

  /** Outil de dev uniquement : force l'humeur d'une faction (chantier 15). */
  devSetFactionMood(factionId: string, mood: FactionState["mood"], durationMs = FACTION_MOOD_DURATION_MS): boolean {
    if (!this.factionStateMap.has(factionId)) return false;
    const state: FactionState = {
      factionId,
      mood,
      moodUntil: mood === "neutral" ? null : Date.now() + durationMs,
    };
    this.factionStateMap.set(factionId, state);
    this.persistFactionState(state);
    // Même effet de bord qu'une bascule naturelle : sinon l'outil de dev mentirait sur
    // ce qu'une pénurie déclenche réellement.
    if (mood === "shortage") {
      this.factionPostShortageContract(factionId, createRng(`dev-shortage-${factionId}-${Date.now()}`));
    }
    this.notify();
    return true;
  }

  /** Outil de dev uniquement : fait apparaître un repaire pirate dans un système. */
  devSpawnPirate(systemId: string, threat = 2): void {
    // Sans système précisé : celui de la première colonie (pratique pour tester).
    if (!systemId) {
      const home = this.colonies[0];
      const sys = home ? this.planetsById.get(home.planetId)?.systemId : undefined;
      if (!sys) return;
      systemId = sys;
    }
    const rng = createRng(`dev-pirate-${systemId}-${Date.now()}`);
    const ships = pirateComposition(rng, threat);
    const lair: PirateLair = {
      id: randomUUID(),
      systemId,
      ships,
      directives: pirateDirectives(rng),
      bounty: pirateBounty(ships),
    };
    this.lairMap.set(lair.id, lair);
    this.persistLair(lair, true);
    this.notify();
  }

  /**
   * Choisit la planète mère d'un empire à naître (chantier 9.4).
   *
   * Le nouvel arrivant est posé dans une **galaxie de départ** — la plus proche du
   * centre ayant encore de la place, en préférant celles déjà peuplées : les joueurs
   * se retrouvent voisins, avec commerce, frontières et PvP dès les premières heures.
   * Dans cette galaxie, on prend la planète la plus habitable d'un système vierge
   * (brouillards disjoints). L'univers s'étend si plus aucune galaxie n'a de place.
   */
  private pickHomePlanet(): Planet | null {
    const starter = pickStarterGalaxy(this.galaxyOccupancy());
    if (starter === null) {
      // Plus une seule place : ouvrir la frontière, puis viser la première galaxie neuve.
      const before = this.universe.galaxies.length;
      this.growUniverse(1);
      if (this.universe.galaxies.length === before) return null; // plafond atteint
      return this.pickHomePlanet();
    }

    const occupiedPlanets = new Set<string>();
    const occupiedSystems = new Set<string>();
    for (const e of this.empires.values()) {
      for (const c of e.colonyMap.values()) {
        occupiedPlanets.add(c.planetId);
        const sys = this.planetsById.get(c.planetId)?.systemId;
        if (sys) occupiedSystems.add(sys);
      }
    }
    const candidates = this.universe.galaxies[starter]!.systems.flatMap((s) => s.planets)
      .filter((p) => p.type !== "gas" && !occupiedPlanets.has(p.id))
      .sort((a, b) => b.habitability - a.habitability);
    const freeSystem = candidates.filter((p) => !occupiedSystems.has(p.systemId));
    return (freeSystem[0] ?? candidates[0]) ?? null;
  }

  /**
   * Instancie un nouvel empire : ligne `players` + colonie mère dans sa galaxie de
   * départ (brouillard isolé). Retourne l'`Empire`, ou `null` si l'univers ne peut
   * plus accueillir personne (plafond de galaxies atteint).
   */
  private createEmpire(
    id: string,
    name?: string,
    accountId: string | null = null,
    kind: "human" | "npc" = "human",
  ): Empire | null {
    const home = this.pickHomePlanet();
    if (!home) return null;

    const index = this.empires.size;
    const empireName = (name?.trim() || `Empire ${index + 1}`).slice(0, 40);
    const color = DEV_EMPIRE_COLORS[index % DEV_EMPIRE_COLORS.length]!;
    db.insert(schema.players)
      .values({
        id,
        gameId: this.clock.id,
        accountId,
        kind,
        name: empireName,
        color,
        joinedAt: Date.now(),
        researched: "[]",
        research: null,
        researchQueue: "[]",
        influence: 0,
        factionRep: "{}",
        explored: "[]",
      })
      .run();
    const empire = new Empire(id, empireName, color, accountId, kind);
    this.empires.set(id, empire);
    this.foundHomeColony(empire, home);
    // L'arrivant peut avoir entamé la dernière galaxie vierge : on repousse le bord.
    this.ensureFrontier();
    this.notify();
    console.log(`[game] empire « ${empireName} » instancié (${this.empires.size} au total)`);
    return empire;
  }

  /**
   * Amorce quelques empires PNJ si le monde n'en a encore aucun (chantier 14) : le
   * monde n'est plus vide au premier tick, l'IA économique (`npcTick`) les fait vivre
   * ensuite. Public et idempotent (compte les PNJ déjà présents plutôt que de dépendre
   * d'un flag « partie neuve ») : le serveur peut l'appeler à chaque boot sans jamais
   * doubler la population, y compris pour une partie créée avant ce chantier. Distinct
   * de `load()` à dessein — les tests qui n'en ont pas besoin restent à un seul empire.
   */
  ensureNpcPopulation(count = NPC_EMPIRE_COUNT): void {
    const existing = [...this.empires.values()].filter((e) => e.kind === "npc").length;
    for (let i = existing; i < count; i++) {
      const name = NPC_EMPIRE_NAMES[i % NPC_EMPIRE_NAMES.length]!;
      this.createEmpire(randomUUID(), name, null, "npc");
    }
  }

  /**
   * Empire piloté par un compte (chantier 8). null si le compte n'a pas encore d'empire
   * dans cette partie — l'inscription en crée un via `createEmpireForAccount`.
   */
  empireForAccount(accountId: string): Empire | null {
    for (const empire of this.empires.values()) {
      if (empire.accountId === accountId) return empire;
    }
    return null;
  }

  /**
   * Rattache un empire à un compte fraîchement inscrit. Le premier compte **adopte**
   * l'empire amorcé au boot (sa colonie mère et son brouillard) plutôt que d'en créer un
   * second, qui laisserait un empire fantôme sur la meilleure planète. Les suivants
   * obtiennent un empire neuf. null si l'univers n'a plus de planète d'accueil.
   */
  createEmpireForAccount(accountId: string, name?: string): Empire | null {
    const existing = this.empireForAccount(accountId);
    if (existing) return existing;

    // "human" exclut les PNJ (chantier 14) : sans ce filtre, la deuxième inscription
    // pourrait adopter un empire piloté par l'IA au lieu de l'empire amorcé au boot.
    const orphan = [...this.empires.values()].find(
      (e) => e.accountId === null && e.kind === "human",
    );
    if (orphan) {
      orphan.accountId = accountId;
      const empireName = name?.trim().slice(0, 40);
      if (empireName) orphan.name = empireName;
      db.update(schema.players)
        .set({ accountId, name: orphan.name })
        .where(eq(schema.players.id, orphan.id))
        .run();
      console.log(`[game] empire « ${orphan.name} » adopté par un compte`);
      this.notify();
      return orphan;
    }
    return this.createEmpire(randomUUID(), name, accountId);
  }

  /** Empire par son id (outils de dev). */
  empireById(id: string): Empire | null {
    return this.empires.get(id) ?? null;
  }

  /** Empire par défaut (outils de dev uniquement : `/dev/armfleet` sans `empireId`). */
  get defaultEmpireForDev(): Empire {
    return this.defaultEmpire;
  }

  /** Outil de dev uniquement : instancie un empire supplémentaire. Retourne son id. */
  devSpawnEmpire(name?: string): string | null {
    return this.createEmpire(randomUUID(), name)?.id ?? null;
  }

  /** Outil de dev uniquement : instancie un empire PNJ (chantier 14). Retourne son id. */
  devSpawnNpcEmpire(name?: string): string | null {
    return this.createEmpire(randomUUID(), name, null, "npc")?.id ?? null;
  }

  /** Outil de dev uniquement : arme une flotte d'un empire dans un système (tests PvP). */
  devArmFleet(empire: Empire, systemId: string, ships: Partial<Record<string, number>>): string {
    const home = [...empire.colonyMap.values()][0];
    const fleet: Fleet = {
      id: randomUUID(),
      ownerId: empire.id,
      name: "Escadre",
      systemId,
      homeColonyId: home?.id ?? "",
      ships,
      directives: { ...DEFAULT_DIRECTIVES },
      queue: [],
      movement: null,
    };
    empire.fleetMap.set(fleet.id, fleet);
    this.markExplored(empire, systemId);
    this.persistFleet(fleet, true);
    this.notify();
    return fleet.id;
  }

  /** Snapshot (forme externe WS) redacté au brouillard d'un empire (chantier 7c-B). */
  snapshotForEmpire(empire: Empire): EngineSnapshot {
    return this.snapshotFor(empire);
  }

  /** Univers redacté au brouillard d'un empire — payload initial du message `hello`. */
  clientUniverseForEmpire(empire: Empire): Universe {
    return this.clientUniverseFor(empire);
  }

  /** Outil de dev uniquement : résumé par empire (état en mémoire) pour l'observation. */
  devEmpireSummaries(): unknown {
    return [...this.empires.values()].map((e) => ({
      id: e.id,
      name: e.name,
      color: e.color,
      kind: e.kind,
      isDefault: e.id === this.defaultEmpire.id,
      influence: Math.round(e.influence * 100) / 100,
      researched: e.researched.length,
      claimed: e.claimedSystemIds.length,
      exploredCount: e.explored.size,
      exploredSystemIds: [...e.explored],
      colonies: [...e.colonyMap.values()].map((c) => ({
        name: c.name,
        systemId: this.planetsById.get(c.planetId)?.systemId ?? "?",
        population: Math.round(c.population * 100) / 100,
        credits: Math.round(c.resources.credits),
        ore: Math.round(c.resources.ore),
        energy: Math.round(c.resources.energy),
        food: Math.round(c.resources.food),
      })),
      fleets: e.fleetMap.size,
    }));
  }

  /** Outil de dev uniquement : injecte des ressources pour tester sans attendre. */
  devGrant(resources: Partial<Record<ResourceId, number>>): void {
    const colony = this.colonies[0];
    if (!colony) return;
    const updated = { ...colony.resources };
    for (const [res, amount] of Object.entries(resources) as [ResourceId, number][]) {
      updated[res] = (updated[res] ?? 0) + amount;
    }
    this.colonyMap.set(colony.id, { ...colony, resources: updated });
    this.persistColony(this.colonyMap.get(colony.id)!);
    this.notify();
  }

  private insertMission(
    empire: Empire,
    kind: Mission["kind"],
    fromColonyId: string,
    targetId: string,
    durationMs: number,
    extras: Pick<Mission, "cargo" | "budget" | "buyResource" | "capacity" | "contractId"> = {},
    departedAt = Date.now(),
  ): void {
    const mission: Mission = {
      id: randomUUID(),
      kind,
      fromColonyId,
      targetId,
      departedAt,
      arrivesAt: departedAt + durationMs,
      ...extras,
    };
    empire.missionMap.set(mission.id, mission);
    db.insert(schema.missions)
      .values({
        id: mission.id,
        gameId: this.clock.id,
        kind: mission.kind,
        fromColonyId: mission.fromColonyId,
        targetId: mission.targetId,
        departedAt: mission.departedAt,
        arrivesAt: mission.arrivesAt,
        cargo: mission.cargo ? JSON.stringify(mission.cargo) : null,
        budget: mission.budget ?? null,
        buyResource: mission.buyResource ?? null,
        capacity: mission.capacity ?? null,
        contractId: mission.contractId ?? null,
      })
      .run();
  }

  /**
   * Résout les missions de l'empire arrivées à l'instant `t` : révélation, fondation,
   * commerce. Marchés et portails restent partagés (univers) ; `insertMission` (trajet
   * retour d'achat) reste sur le defaultEmpire — threadé en 7c.
   */
  private resolveMissions(empire: Empire, t: number): void {
    for (const [id, mission] of empire.missionMap) {
      if (mission.arrivesAt > t) continue;
      switch (mission.kind) {
        case "probe":
          this.markExplored(empire, mission.targetId);
          break;
        case "colonize": {
          const planet = this.planetsById.get(mission.targetId);
          const alreadyColonized = [...empire.colonyMap.values()].some(
            (c) => c.planetId === mission.targetId,
          );
          if (planet && !alreadyColonized) {
            this.insertColony(empire, {
              id: randomUUID(),
              planetId: planet.id,
              name: planet.name,
              resources: { ...emptyResources(), ...NEW_COLONY_RESOURCES },
              // Le vaisseau colonial laisse sur place un dock sommaire : sans lui, la
              // colonie neuve ne pourrait jamais rien réexporter (chantier 12).
              orbitalResources: { ...emptyOrbital(), ...NEW_COLONY_ORBITAL },
              liftRules: {},
              buildings: { habitat: 1, orbital_dock: 1 },
              queue: [],
              population: NEW_COLONY_POPULATION,
              satisfaction: 60,
              // Le vaisseau colonial est démantelé en navette cargo.
              ships: { cargo_small: 1 },
              shipsBusy: [],
              shipQueue: [],
            });
            console.log(`[game] colonie fondée sur ${planet.name}`);
          }
          break;
        }
        case "sell": {
          const stocks = this.marketMap.get(mission.targetId);
          const colony = empire.colonyMap.get(mission.fromColonyId);
          if (stocks && colony && mission.cargo) {
            const result = resolveSale(stocks, mission.cargo, this.priceContextOf(mission.targetId));
            this.marketMap.set(mission.targetId, result.stocks);
            this.persistMarket(mission.targetId);
            // Bonus de réputation : la faction paie mieux ses partenaires.
            const revenue = Math.floor(
              result.revenue * (1 + this.stationRepBonus(empire, mission.targetId)),
            );
            this.addFactionRep(empire, mission.targetId, result.revenue);
            const resources = {
              ...colony.resources,
              credits: colony.resources.credits + revenue,
            };
            empire.colonyMap.set(colony.id, { ...colony, resources });
            this.persistColony(empire.colonyMap.get(colony.id)!);
          }
          break;
        }
        case "buy": {
          const stocks = this.marketMap.get(mission.targetId);
          if (stocks && mission.buyResource && mission.budget) {
            const result = resolvePurchase(
              stocks,
              mission.buyResource as MarketResource,
              mission.budget,
              mission.capacity ?? Infinity,
              this.priceContextOf(mission.targetId),
            );
            this.marketMap.set(mission.targetId, result.stocks);
            this.persistMarket(mission.targetId);
            // Remise de réputation : une part du prix payé est restituée.
            const rebate = Math.floor(result.spent * this.stationRepBonus(empire, mission.targetId));
            this.addFactionRep(empire, mission.targetId, result.spent);
            // Trajet retour, chargé + reliquat de budget (et remise) à rembourser.
            this.insertMission(
              empire,
              "buy_return",
              mission.fromColonyId,
              mission.targetId,
              mission.arrivesAt - mission.departedAt,
              {
                cargo: result.bought > 0 ? { [mission.buyResource]: result.bought } : {},
                budget: mission.budget - result.spent + rebate,
              },
              mission.arrivesAt,
            );
          }
          break;
        }
        case "contribute_gateway": {
          const gateway = this.gatewayMap.get(mission.targetId);
          if (gateway && !gateway.active && mission.cargo) {
            const progress = { ...gateway.progress };
            const cost = gatewayCost(gateway.galaxyId);
            for (const [res, amount] of Object.entries(mission.cargo) as [ResourceId, number][]) {
              const cap = cost[res] ?? 0;
              progress[res] = Math.min(cap, (progress[res] ?? 0) + amount);
            }
            let next: Gateway = { ...gateway, progress };
            if (!next.activatesAt && gatewayCovered(next)) {
              // Coût couvert : le chantier final démarre.
              next = { ...next, activatesAt: mission.arrivesAt + GATEWAY_BUILD_MS };
              console.log(`[game] chantier final du portail vers ${next.galaxyId}`);
            }
            this.gatewayMap.set(gateway.galaxyId, next);
            this.persistGateway(next);
          }
          break;
        }
        case "deliver_contract": {
          // Livraison cross-empire (chantier 14) : le cargo appartient à `empire`, la
          // colonie destinataire à l'émetteur du contrat — deux empires distincts.
          // Livraison à une FACTION (chantier 15) : pas de colonie émettrice — `colonyId`
          // porte alors l'id d'un comptoir, honoré au marché, standing à la clé.
          const contract = mission.contractId ? this.contractMap.get(mission.contractId) : undefined;
          const issuerEmpire = contract ? this.empires.get(contract.issuerId) : undefined;
          const cargoQty = Object.values(mission.cargo ?? {}).reduce((s, n) => s + (n ?? 0), 0);
          if (contract && issuerEmpire && mission.cargo) {
            const destColony = issuerEmpire.colonyMap.get(contract.colonyId);
            if (destColony) {
              const delivered = deliverToOrbit(destColony, mission.cargo, issuerEmpire.effects);
              issuerEmpire.colonyMap.set(destColony.id, delivered);
              this.persistColony(delivered);
            }
          } else if (contract && mission.cargo) {
            const stocks = this.marketMap.get(contract.colonyId);
            if (stocks) {
              // `resolveSale` ne sert ici qu'à faire bouger le stock/prix du comptoir —
              // sa recette est ignorée : l'accepteur est payé au prix FIXE du contrat.
              const result = resolveSale(stocks, mission.cargo, this.priceContextOf(contract.colonyId));
              this.marketMap.set(contract.colonyId, result.stocks);
              this.persistMarket(contract.colonyId);
              this.addFactionRep(empire, contract.colonyId, cargoQty * contract.pricePerUnit);
            }
          }
          const payer = empire.colonyMap.get(mission.fromColonyId);
          if (contract && payer) {
            const payout = contractPayout(contract, cargoQty);
            const resources = { ...payer.resources, credits: payer.resources.credits + payout };
            empire.colonyMap.set(payer.id, { ...payer, resources });
            this.persistColony(empire.colonyMap.get(payer.id)!);
          }
          break;
        }
        case "build_outpost": {
          const belt = this.beltsById.get(mission.targetId);
          const alreadyBuilt = [...empire.outpostMap.values()].some(
            (o) => o.beltId === mission.targetId,
          );
          if (belt && !alreadyBuilt) {
            const outpost: MiningOutpost = {
              id: randomUUID(),
              beltId: belt.id,
              ownerColonyId: mission.fromColonyId,
              oreStock: 0,
            };
            empire.outpostMap.set(outpost.id, outpost);
            db.insert(schema.outposts)
              .values({ ...outpost, gameId: this.clock.id, createdAt: Date.now() })
              .run();
            console.log(`[game] avant-poste minier fondé sur ${belt.name}`);
          }
          break;
        }
        case "buy_return": {
          const colony = empire.colonyMap.get(mission.fromColonyId);
          if (colony) {
            // L'achat revient en orbite ; seuls les crédits atterrissent directement.
            const delivered = deliverToOrbit(colony, mission.cargo ?? {}, empire.effects);
            empire.colonyMap.set(colony.id, {
              ...delivered,
              resources: {
                ...delivered.resources,
                credits: delivered.resources.credits + (mission.budget ?? 0),
              },
            });
            this.persistColony(empire.colonyMap.get(colony.id)!);
          }
          break;
        }
      }
      empire.missionMap.delete(id);
      db.delete(schema.missions).where(eq(schema.missions.id, id)).run();
    }
  }

  /**
   * Dote de stocks les stations qui n'en ont pas encore. Appelé à la création d'une
   * partie et après chaque extension de l'univers (les galaxies neuves arrivent avec
   * leurs comptoirs) — d'où l'idempotence.
   */
  private initMarkets(): void {
    for (const station of this.stationsById.values()) {
      if (this.marketMap.has(station.id)) continue;
      const stocks = initialStocks(createRng(`${this.clock.seed}-station-${station.id}`));
      this.marketMap.set(station.id, stocks);
      db.insert(schema.stationStates)
        .values({ stationId: station.id, gameId: this.clock.id, stocks: JSON.stringify(stocks) })
        .run();
    }
  }

  private loadMarkets(): void {
    for (const row of db.select().from(schema.stationStates).all()) {
      this.marketMap.set(row.stationId, JSON.parse(row.stocks));
    }
  }

  private persistMarket(stationId: string): void {
    const stocks = this.marketMap.get(stationId);
    if (!stocks) return;
    db.update(schema.stationStates)
      .set({ stocks: JSON.stringify(stocks) })
      .where(eq(schema.stationStates.stationId, stationId))
      .run();
  }

  /** Génération d'influence ; entretien impayé = la revendication la plus récente tombe. */
  private influenceTick(empire: Empire): void {
    // Bonus de territoire soudé : les claims contigus rapportent un supplément d'influence.
    const contiguous = contiguousClaims(this.universe, empire.claimedSystemIds).size;
    const net =
      influencePerTick([...empire.colonyMap.values()], empire.claimedSystemIds.length, empire.effects.influenceMult) +
      contiguous * CONTIGUOUS_CLAIM_BONUS;
    let influence = empire.influence + net;
    if (influence < 0 && empire.claimedSystemIds.length > 0) {
      const dropped = empire.claimedSystemIds.at(-1)!;
      this.dropClaim(empire, dropped);
      influence = 0;
      console.log(`[game] revendication perdue faute d'influence : ${dropped}`);
    }
    empire.influence = Math.max(0, influence);
  }

  /** Tick économique : les stocks PNJ de chaque station évoluent selon leur faction. */
  private economyTick(tickNumber: number): void {
    for (const station of this.stationsById.values()) {
      const stocks = this.marketMap.get(station.id);
      if (!stocks) continue;
      const faction = FACTIONS[station.factionId as FactionId];
      if (!faction) continue;
      const rng = createRng(`${this.clock.seed}-mkt-${station.id}-${tickNumber}`);
      this.marketMap.set(station.id, marketTick(stocks, faction, rng));
      this.persistMarket(station.id);
    }
  }

  private markExplored(empire: Empire, systemId: string): void {
    if (empire.explored.has(systemId)) return;
    empire.explored.add(systemId);
    empire.explorationDirty = true;
    db.update(schema.players)
      .set({ explored: JSON.stringify([...empire.explored]) })
      .where(eq(schema.players.id, empire.id))
      .run();
  }

  /** Livre les convois arrivés à l'instant `t` (surplus au-delà du stockage perdu). */
  private deliverTransfers(empire: Empire, t: number): void {
    for (const [id, transfer] of empire.transferMap) {
      if (transfer.arrivesAt > t) continue;
      const to = empire.colonyMap.get(transfer.toColonyId);
      if (to) {
        // Le convoi débarque EN ORBITE ; l'ascenseur redescendra selon les règles locales.
        empire.colonyMap.set(to.id, deliverToOrbit(to, transfer.resources, empire.effects));
      }
      empire.transferMap.delete(id);
      db.delete(schema.transfers).where(eq(schema.transfers.id, id)).run();
    }
  }

  /** Colonie de départ : la planète la plus habitable de la galaxie d'origine. */
  /**
   * Garantit qu'un empire par défaut existe et adopte les entités orphelines.
   * Socle du multi (chantier 7) : en solo, un unique player possède tout.
   * Pour une sauvegarde mono-locataire pré-existante, backfill des `ownerId` NULL.
   */
  /**
   * Garantit qu'au moins un player (empire par défaut) existe et adopte les entités
   * orphelines. Un player neuf démarre à l'état vide (la colonie mère peuple ensuite son
   * brouillard). Le backfill des `ownerId` NULL les rattache au player par défaut (le
   * premier). N'instancie PAS les `Empire` : `loadPlayers()` le fait pour toutes les
   * lignes `players` (chantier 7c — Phase A).
   *
   * NB : l'état d'empire des sauvegardes pré-7b a été copié `games`→`players` par la
   * migration 0005 ; les colonnes legacy de `games` sont supprimées en 0006 (Phase D).
   */
  private ensureDefaultPlayer(): void {
    const player = db
      .select()
      .from(schema.players)
      .where(eq(schema.players.gameId, this.clock.id))
      .limit(1)
      .get();
    const defaultId = player?.id ?? randomUUID();
    if (!player) {
      db.insert(schema.players)
        .values({
          id: defaultId,
          gameId: this.clock.id,
          name: DEFAULT_PLAYER_NAME,
          color: DEFAULT_PLAYER_COLOR,
          joinedAt: Date.now(),
          researched: "[]",
          research: null,
        researchQueue: "[]",
          influence: 0,
          factionRep: "{}",
          explored: "[]",
        })
        .run();
    }
    for (const table of [schema.colonies, schema.fleets, schema.claims]) {
      db.update(table)
        .set({ ownerId: defaultId })
        .where(and(eq(table.gameId, this.clock.id), isNull(table.ownerId)))
        .run();
    }
  }

  /**
   * Instancie un `Empire` par ligne `players` (Phase A du chantier 7c). Chaque empire
   * charge son état autoritaire (recherche, influence, réputation, brouillard, effets)
   * et ses claims (par `ownerId`). `defaultEmpire` = premier player (ordre d'insertion),
   * fallback de compatibilité tant que l'identité de connexion (7c-B) n'existe pas.
   */
  private loadPlayers(): void {
    const rows = db
      .select()
      .from(schema.players)
      .where(eq(schema.players.gameId, this.clock.id))
      .all();
    for (const p of rows) {
      const empire = new Empire(p.id, p.name, p.color, p.accountId, p.kind as "human" | "npc");
      empire.researched = JSON.parse(p.researched);
      empire.research = p.research ? JSON.parse(p.research) : null;
      empire.researchQueue = JSON.parse(p.researchQueue);
      empire.influence = p.influence;
      empire.factionRep = JSON.parse(p.factionRep);
      empire.explored = new Set(JSON.parse(p.explored));
      empire.claimedSystemIds = db
        .select()
        .from(schema.claims)
        .where(eq(schema.claims.ownerId, p.id))
        .all()
        .map((c) => c.systemId);
      empire.effects = computeEffects(empire.researched as TechId[]);
      this.empires.set(empire.id, empire);
    }
    this.defaultEmpire = this.empires.values().next().value!;
  }

  /** Empire propriétaire d'une colonie (pour router les entités dérivées au chargement). */
  private empireOfColony(colonyId: string): Empire {
    for (const empire of this.empires.values()) {
      if (empire.colonyMap.has(colonyId)) return empire;
    }
    return this.defaultEmpire;
  }

  private createHomeColony(): void {
    const homeGalaxy = this.universe.galaxies[0]!;
    const planets = homeGalaxy.systems.flatMap((s) => s.planets);
    const home = planets.reduce((best, p) => (p.habitability > best.habitability ? p : best));
    this.foundHomeColony(this.defaultEmpire, home);
  }

  /** Fonde une colonie mère pour un empire sur `planet` et révèle son système. */
  private foundHomeColony(empire: Empire, planet: Planet): void {
    this.insertColony(empire, {
      id: randomUUID(),
      planetId: planet.id,
      name: `${planet.name} — Colonie mère`,
      resources: { ...emptyResources(), ore: 400, energy: 200, food: 200, credits: 50 },
      // La colonie mère naît avec son dock et une soute orbitale amorcée : le premier
      // convoi doit rester possible sans attendre l'ascenseur (chantier 12).
      orbitalResources: { ...emptyOrbital(), ore: 150, food: 50 },
      liftRules: { ore: { keepGround: 250, direction: "up" } },
      buildings: { mine: 1, power_plant: 1, farm: 1, habitat: 1, shipyard: 1, orbital_dock: 1 },
      queue: [],
      population: 12,
      satisfaction: 80,
      ships: { cargo_small: 2 },
      shipsBusy: [],
      shipQueue: [],
    });
    this.markExplored(empire, planet.systemId);
    console.log(
      `[game] colonie mère fondée sur ${planet.name} (habitabilité ${planet.habitability}) pour « ${empire.name} »`,
    );
  }

  private insertColony(empire: Empire, colony: Colony): void {
    colony.ownerId = empire.id;
    empire.colonyMap.set(colony.id, colony);
    db.insert(schema.colonies)
      .values({
        id: colony.id,
        gameId: this.clock.id,
        ownerId: colony.ownerId,
        planetId: colony.planetId,
        name: colony.name,
        resources: JSON.stringify(colony.resources),
        orbitalResources: JSON.stringify(colony.orbitalResources),
        liftRules: JSON.stringify(colony.liftRules),
        buildings: JSON.stringify(colony.buildings),
        queue: JSON.stringify(colony.queue),
        population: colony.population,
        satisfaction: colony.satisfaction,
        ships: JSON.stringify(colony.ships),
        shipsBusy: JSON.stringify(colony.shipsBusy),
        shipQueue: JSON.stringify(colony.shipQueue),
        createdAt: Date.now(),
      })
      .run();
  }

  private loadColonies(): void {
    const rows = db.select().from(schema.colonies).all();
    for (const row of rows) {
      const ownerId = row.ownerId ?? this.defaultEmpire.id;
      const empire = this.empires.get(ownerId) ?? this.defaultEmpire;
      empire.colonyMap.set(row.id, {
        id: row.id,
        ownerId,
        planetId: row.planetId,
        name: row.name,
        resources: JSON.parse(row.resources),
        orbitalResources: { ...emptyOrbital(), ...JSON.parse(row.orbitalResources) },
        liftRules: JSON.parse(row.liftRules),
        buildings: JSON.parse(row.buildings),
        queue: JSON.parse(row.queue),
        population: row.population,
        satisfaction: row.satisfaction,
        ships: JSON.parse(row.ships),
        shipsBusy: JSON.parse(row.shipsBusy),
        shipQueue: JSON.parse(row.shipQueue),
      });
    }
  }

  private persistColony(colony: Colony): void {
    db.update(schema.colonies)
      .set({
        resources: JSON.stringify(colony.resources),
        orbitalResources: JSON.stringify(colony.orbitalResources),
        liftRules: JSON.stringify(colony.liftRules),
        buildings: JSON.stringify(colony.buildings),
        queue: JSON.stringify(colony.queue),
        population: colony.population,
        satisfaction: colony.satisfaction,
        ships: JSON.stringify(colony.ships),
        shipsBusy: JSON.stringify(colony.shipsBusy),
        shipQueue: JSON.stringify(colony.shipQueue),
      })
      .where(eq(schema.colonies.id, colony.id))
      .run();
  }

  private catchUp(): void {
    const elapsed = Math.floor((Date.now() - this.clock.lastTickAt) / TICK_MS);
    if (elapsed <= 0) return;
    const ticks = Math.min(elapsed, MAX_CATCHUP_TICKS);
    console.log(`[game] catch-up: ${ticks} ticks (${elapsed} écoulés)`);
    this.advance(ticks);
  }

  /**
   * Applique N ticks. Les timers réels (file de construction) sont résolus au
   * timestamp de chaque tick : un bâtiment fini en cours de catch-up produit
   * pour les ticks restants.
   */
  private advance(ticks: number): void {
    for (let i = 1; i <= ticks; i++) {
      const t = this.clock.lastTickAt + i * TICK_MS;
      const tickNumber = this.clock.tick + i;
      const isEconomyTick = tickNumber % ECONOMY_TICK_TICKS === 0;
      // Étapes par empire (un seul instancié à ce stade — la boucle tourne une fois).
      for (const empire of this.empires.values()) {
        this.deliverTransfers(empire, t);
        this.resolveMissions(empire, t);
        this.resolveResearch(empire, t);
      }
      // Portails et contrats : univers partagé, résolus une fois par tick.
      this.resolveGateways(t);
      this.resolveContracts(t);
      for (const empire of this.empires.values()) {
        this.processRoutes(empire, t);
        this.outpostsTick(empire);
        this.fleetsTick(empire, t);
      }
      // Apparition de repaires (PNJ partagés) : après les mouvements de flotte, avant
      // l'entretien d'influence — position historique (fin de `fleetsTick`), tick éco.
      if (isEconomyTick) this.spawnPirates(tickNumber);
      for (const empire of this.empires.values()) this.influenceTick(empire);
      // Marchés PNJ : univers partagé, une fois par tick éco.
      if (isEconomyTick) {
        this.economyTick(tickNumber);
        // Humeurs de faction (chantier 15) : après les marchés, avant les PNJ qui
        // tarifent leurs contrats sur les cours (et bientôt les humeurs) à jour.
        this.factionMoodTick(t, tickNumber);
        // Économie des empires PNJ (chantier 14) : après les marchés, pour tarifer
        // leurs contrats sur des cours à jour.
        for (const empire of this.empires.values()) this.npcTick(empire);
      }
      // Front de peuplement : une colonisation a pu entamer la frontière (chantier 9).
      if (isEconomyTick) this.ensureFrontier();
      for (const empire of this.empires.values()) this.colonyProductionTick(empire, t);
    }
    this.clock.tick += ticks;
    this.clock.lastTickAt += ticks * TICK_MS;
    db.update(schema.games)
      .set({ tick: this.clock.tick, lastTickAt: this.clock.lastTickAt })
      .where(eq(schema.games.id, this.clock.id))
      .run();
    for (const empire of this.empires.values()) {
      db.update(schema.players)
        .set({ influence: empire.influence, factionRep: JSON.stringify(empire.factionRep) })
        .where(eq(schema.players.id, empire.id))
        .run();
      for (const colony of empire.colonyMap.values()) this.persistColony(colony);
      this.persistOutposts(empire);
    }
    this.notify();
  }

  /** Production/économie d'une colonie à chaque tick, avec bonus territorial des claims. */
  private colonyProductionTick(empire: Empire, t: number): void {
    for (const [id, colony] of empire.colonyMap) {
      const planet = this.planetsById.get(colony.planetId);
      if (!planet) continue;
      // Bonus territorial : système revendiqué = production boostée.
      const claimed = empire.claimedSystemIds.includes(planet.systemId);
      const effects = claimed
        ? { ...empire.effects, outputMultAll: empire.effects.outputMultAll * CLAIM_PRODUCTION_BONUS }
        : empire.effects;
      // L'ascenseur tourne après la production : ce qui vient d'être produit peut monter.
      empire.colonyMap.set(
        id,
        applyLift(applyColonyTick(resolveShips(resolveQueue(colony, t), t), planet, effects), effects),
      );
    }
  }

  private loadTransfers(): void {
    for (const row of db.select().from(schema.transfers).all()) {
      this.empireOfColony(row.fromColonyId).transferMap.set(row.id, {
        id: row.id,
        fromColonyId: row.fromColonyId,
        toColonyId: row.toColonyId,
        resources: JSON.parse(row.resources),
        departedAt: row.departedAt,
        arrivesAt: row.arrivesAt,
      });
    }
  }

  private loadMissions(): void {
    for (const row of db.select().from(schema.missions).all()) {
      this.empireOfColony(row.fromColonyId).missionMap.set(row.id, {
        id: row.id,
        kind: row.kind as Mission["kind"],
        fromColonyId: row.fromColonyId,
        targetId: row.targetId,
        departedAt: row.departedAt,
        arrivesAt: row.arrivesAt,
        ...(row.cargo ? { cargo: JSON.parse(row.cargo) } : {}),
        ...(row.budget !== null ? { budget: row.budget } : {}),
        ...(row.buyResource ? { buyResource: row.buyResource as ResourceId } : {}),
        ...(row.capacity !== null ? { capacity: row.capacity } : {}),
        ...(row.contractId ? { contractId: row.contractId } : {}),
      });
    }
  }

  private notify(): void {
    // Signal seul : chaque connexion recompose le snapshot redacté de son empire
    // (7c-B). Le marqueur d'exploration se réarme par empire après diffusion.
    for (const listener of this.listeners) listener();
    for (const empire of this.empires.values()) {
      empire.explorationDirty = false;
      empire.universeDirty = false;
    }
  }
}
