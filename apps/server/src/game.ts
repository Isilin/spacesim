import {
  breakRelationReason,
  combatDefFromStats,
  computeEffects,
  createRng,
  DECLARE_WAR_INFLUENCE_COST,
  declareWarReason,
  emptyOrbital,
  emptyResources,
  FACTION_IDS,
  FACTION_MOOD_DURATION_MS,
  FACTIONS,
  fleetIsEmpty,
  fleetPower,
  GATEWAY_BUILD_MS,
  gatewayCost,
  gatewayCovered,
  gatewayLinks,
  INITIAL_GALAXIES,
  pickStarterGalaxy,
  jumpDistanceInUniverse,
  makePeaceReason,
  MAX_CATCHUP_TICKS,
  npcAcceptsProposal,
  generateObjectiveSpec,
  MAX_OPEN_OBJECTIVES_PER_EMPIRE,
  objectiveMet,
  OBJECTIVE_DURATION_MS,
  PIRATE_SPAWN_CHANCE,
  PIRATE_TAX_PER_TICK,
  rollWorldEvent,
  WORLD_EVENT_DURATION_MS,
  WORLD_EVENT_PIRATE_MULT,
  RAID_FRACTION,
  pirateBounty,
  pirateComposition,
  pirateDirectives,
  resolveBlueprint,
  WARSHIP_COMBAT_DEFS,
  randInt,
  proposeRelationReason,
  relationKey,
  resolveBattle,
  RESOURCES,
  storageCap,
  WAR_COOLDOWN_MS,
  WARSHIPS,
  TICK_MS,
  transferDurationMs,
  type AsteroidBelt,
  type BuildingId,
  type CombatDef,
  type Colony,
  type Contract,
  type EmpireEffects,
  type CombatPhase,
  type FactionId,
  type FactionState,
  type Fleet,
  type FleetComposition,
  type LiftRule,
  type GameState,
  type Gateway,
  type PirateLair,
  type PriceContext,
  type StoredBattle,
  type WarshipId,
  type MiningOutpost,
  type Mission,
  type Objective,
  type ObjectiveKind,
  type Planet,
  type ProposalKind,
  type ResourceId,
  type Relation,
  type RelationProposal,
  type RelationState,
  type Route,
  type RouteRule,
  type ShipId,
  type StationMarket,
  type Stocks,
  type TechId,
  type TradeStation,
  type Transfer,
  type Universe,
  type WorldEvent,
  type WorldEventKind,
} from "@spacesim/shared";
import type { EmpireSnapshot } from "@spacesim/protocol";
import { and, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, schema } from "./db/index.js";
import { Empire, type Clock } from "./empire.js";
import { GameRuntime } from "./runtime/game-runtime.js";
import { consoleLogger, type Logger } from "./runtime/logger.js";
import { ExplorationService } from "./runtime/services/exploration-service.js";
import { IndustryService } from "./runtime/services/industry-service.js";
import { LogisticsService } from "./runtime/services/logistics-service.js";
import { TickRunner } from "./runtime/tick-runner.js";
import {
  clientUniverseForEmpire,
  marketsForEmpire,
  objectivesForEmpire,
  pirateLairsForEmpire,
  snapshotForEmpire as projectSnapshotForEmpire,
} from "./runtime/projections.js";

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
  /** Composé au boot : univers, horloge, index et entités partagées (game-scoped). */
  private runtime: GameRuntime;
  /** Déroule un tick dans l'ordre exact observé en production (runtime/tick-runner.ts). */
  private tickRunner: TickRunner;
  /** Bâtiments, chantier civil, plans de vaisseaux (chantier 13) et recherche. */
  private industry: IndustryService;
  /** Convois, routes, marché (joueur + PNJ), contrats et portails. */
  private logistics: LogisticsService;
  /** Sondes, colonisation, revendications de systèmes, croissance de l'univers (chantier 9). */
  private exploration: ExplorationService;
  /** Injecté depuis le boot (`setLogger`) ; console brute par défaut (tests, scripts). */
  private logger: Logger = consoleLogger;
  private listeners = new Set<StateListener>();
  private interval: NodeJS.Timeout | null = null;

  // Accesseurs délégant à `runtime` — préservent chaque site d'appel existant (`this.clock`,
  // `this.empires`, etc.) tel quel pendant que l'état bascule dans GameRuntime.
  /** Non figé : `growUniverse` le remplace quand de nouvelles galaxies s'ouvrent (chantier 9). */
  get universe(): Universe {
    return this.runtime.universe;
  }
  private set universe(value: Universe) {
    this.runtime.universe = value;
  }
  private get clock(): Clock {
    return this.runtime.clock;
  }
  private get planetsById(): Map<string, Planet> {
    return this.runtime.planetsById;
  }
  private get stationsById(): Map<string, TradeStation> {
    return this.runtime.stationsById;
  }
  private get beltsById(): Map<string, AsteroidBelt> {
    return this.runtime.beltsById;
  }
  private get galaxyIndexOfSystem(): Map<string, number> {
    return this.runtime.galaxyIndexOfSystem;
  }
  private get marketMap(): Map<string, Stocks> {
    return this.runtime.marketMap;
  }
  private get gatewayMap(): Map<string, Gateway> {
    return this.runtime.gatewayMap;
  }
  private get contractMap(): Map<string, Contract> {
    return this.runtime.contractMap;
  }
  private get factionStateMap(): Map<string, FactionState> {
    return this.runtime.factionStateMap;
  }
  private get lairMap(): Map<string, PirateLair> {
    return this.runtime.lairMap;
  }
  private get battleLog(): StoredBattle[] {
    return this.runtime.battleLog;
  }
  private set battleLog(value: StoredBattle[]) {
    this.runtime.battleLog = value;
  }
  private get relationMap(): Map<string, Relation> {
    return this.runtime.relationMap;
  }
  private get proposalMap(): Map<string, RelationProposal> {
    return this.runtime.proposalMap;
  }
  private get objectiveMap(): Map<string, Objective> {
    return this.runtime.objectiveMap;
  }
  private get worldEventMap(): Map<string, WorldEvent> {
    return this.runtime.worldEventMap;
  }
  /** Empires partageant cet univers (chantier 7b). Un seul instancié à ce stade. */
  private get empires(): Map<string, Empire> {
    return this.runtime.empires;
  }
  /** Empire propriétaire par défaut (solo). Posé par `ensureDefaultPlayer`. */
  private get defaultEmpire(): Empire {
    return this.runtime.defaultEmpire;
  }
  private set defaultEmpire(value: Empire) {
    this.runtime.defaultEmpire = value;
  }

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
    this.runtime = new GameRuntime(clock);
    this.tickRunner = new TickRunner(this.runtime, this);
    // Proxy stable : `setLogger` remplace `this.logger` après construction (boot de
    // apps/server), les services doivent donc lire la valeur courante à chaque appel.
    const logger: Logger = {
      info: (message) => this.logger.info(message),
      warn: (message) => this.logger.warn(message),
    };
    this.industry = new IndustryService(
      this.runtime,
      () => this.notify(),
      logger,
      (fleet) => this.persistFleet(fleet),
    );
    this.logistics = new LogisticsService(
      this.runtime,
      () => this.notify(),
      logger,
      (colony) => this.persistColony(colony),
      (state) => this.persistFactionState(state),
      (galaxyId) => this.worldEventKindsOnGalaxy(galaxyId),
      (empire, colony) => this.insertColony(empire, colony),
      (empire, systemId) => this.markExplored(empire, systemId),
      (colonyId) => this.empireOfColony(colonyId),
    );
    this.exploration = new ExplorationService(
      this.runtime,
      () => this.notify(),
      logger,
      (colony) => this.persistColony(colony),
      (empire, kind, fromColonyId, targetId, durationMs) =>
        this.logistics.insertMission(empire, kind, fromColonyId, targetId, durationMs),
      () => this.initMarkets(),
      () => this.initGateways(),
    );
  }

  /** (Ré)indexe les entités d'univers — appelé à la construction et après chaque extension. */
  private reindexUniverse(): void {
    this.runtime.reindexUniverse();
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
    engine.loadObjectives();
    engine.loadWorldEvents();
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
    // Plans de vaisseaux (chantier 13) : chargés puis amorcés pour tout empire qui n'en a
    // aucun (partie neuve, ou empire d'avant le chantier 13).
    engine.loadBlueprints();
    engine.seedStarterBlueprintsForAll();
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
    return clientUniverseForEmpire(this.runtime, this.defaultEmpire);
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
    return pirateLairsForEmpire(this.runtime, this.defaultEmpire);
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
    return marketsForEmpire(this.runtime, this.defaultEmpire);
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

  /** Remplace le logger console par défaut — appelé une fois au boot avec le logger Fastify. */
  setLogger(logger: Logger): void {
    this.logger = logger;
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
    return this.industry.build(empire, colonyId, buildingId);
  }

  /** Action joueur : régler (ou retirer) la consigne d'ascension d'une ressource. */
  setLiftRule(
    empire: Empire,
    colonyId: string,
    resource: ResourceId,
    rule: LiftRule | null,
  ): string | null {
    return this.logistics.setLiftRule(empire, colonyId, resource, rule);
  }

  /** Action joueur : envoyer un convoi cargo. Retourne un message d'erreur ou null. */
  sendTransfer(
    empire: Empire,
    fromColonyId: string,
    toColonyId: string,
    wanted: Partial<Record<ResourceId, number>>,
    convoy?: Partial<Record<ShipId, number>>,
  ): string | null {
    return this.logistics.sendTransfer(empire, fromColonyId, toColonyId, wanted, convoy);
  }

  /** Action joueur : vendre une cargaison à une station (créditée au spot d'arrivée). */
  sellToStation(
    empire: Empire,
    colonyId: string,
    stationId: string,
    wanted: Partial<Record<ResourceId, number>>,
  ): string | null {
    return this.logistics.sellToStation(empire, colonyId, stationId, wanted);
  }

  /** Action joueur : acheter au spot (le convoi part avec un budget, revient chargé). */
  buyFromStation(
    empire: Empire,
    colonyId: string,
    stationId: string,
    resource: ResourceId,
    budgetRaw: number,
  ): string | null {
    return this.logistics.buyFromStation(empire, colonyId, stationId, resource, budgetRaw);
  }

  /** Action joueur : produire un vaisseau au chantier naval (classe historique). */
  buildShip(empire: Empire, colonyId: string, shipId: ShipId): string | null {
    return this.industry.buildShip(empire, colonyId, shipId);
  }

  // ── Conception de vaisseaux (chantier 13) ────────────────────────────────

  private loadBlueprints(): void {
    this.industry.loadBlueprints();
  }

  /** Amorce un empire sans plan avec les designs de départ (presets constructibles). */
  private seedStarterBlueprints(empire: Empire): void {
    this.industry.seedStarterBlueprints(empire);
  }

  private seedStarterBlueprintsForAll(): void {
    this.industry.seedStarterBlueprintsForAll();
  }

  /**
   * Définitions de combat couvrant les classes historiques (défaut/PNJ) + les plans des
   * empires impliqués dans la bataille — le combat résout ainsi n'importe quel id présent.
   */
  private combatDefs(...empires: Empire[]): Record<string, CombatDef> {
    const defs: Record<string, CombatDef> = { ...WARSHIP_COMBAT_DEFS };
    for (const empire of empires) {
      for (const bp of empire.blueprintMap.values()) {
        defs[bp.id] = combatDefFromStats(resolveBlueprint(bp));
      }
    }
    return defs;
  }

  /** Action joueur : créer un plan (validé contre les techs débloquées). */
  createBlueprint(
    empire: Empire,
    name: string,
    chassisId: string,
    modules: string[],
  ): string | null {
    return this.industry.createBlueprint(empire, name, chassisId, modules);
  }

  /** Action joueur : remplacer le contenu d'un plan existant. */
  updateBlueprint(
    empire: Empire,
    blueprintId: string,
    name: string,
    chassisId: string,
    modules: string[],
  ): string | null {
    return this.industry.updateBlueprint(empire, blueprintId, name, chassisId, modules);
  }

  /** Action joueur : supprimer un plan. */
  deleteBlueprint(empire: Empire, blueprintId: string): string | null {
    return this.industry.deleteBlueprint(empire, blueprintId);
  }

  /**
   * Action joueur : produire un vaisseau depuis un plan. Domaine colonie → pool civil
   * (routes/convois) ; domaine flotte → file de production de la flotte.
   */
  buildBlueprint(
    empire: Empire,
    blueprintId: string,
    colonyId?: string,
    fleetId?: string,
  ): string | null {
    return this.industry.buildBlueprint(empire, blueprintId, colonyId, fleetId);
  }

  /**
   * Action joueur : acheter un plan tout fait à une station PNJ (chantier 13). Transaction
   * instantanée (un plan n'est pas une cargaison physique) : le prix majore la valeur en
   * ressources du design, payé en crédits au sol.
   */
  buyBlueprintFromStation(
    empire: Empire,
    colonyId: string,
    stationId: string,
    presetId: string,
  ): string | null {
    return this.industry.buyBlueprintFromStation(empire, colonyId, stationId, presetId);
  }

  /** Action joueur : revendre un plan à une station PNJ, contre une fraction de sa valeur. */
  sellBlueprint(
    empire: Empire,
    colonyId: string,
    stationId: string,
    blueprintId: string,
  ): string | null {
    return this.industry.sellBlueprint(empire, colonyId, stationId, blueprintId);
  }

  /**
   * Action joueur : revendre des vaisseaux assemblés (civils, désœuvrés) à une station PNJ.
   * Couvre aussi bien les classes historiques que les vaisseaux issus d'un plan.
   */
  sellShip(
    empire: Empire,
    colonyId: string,
    stationId: string,
    shipId: string,
    countRaw: number,
  ): string | null {
    return this.industry.sellShip(empire, colonyId, stationId, shipId, countRaw);
  }

  /** Action joueur : fonder un avant-poste minier sur une ceinture. */
  buildOutpost(empire: Empire, colonyId: string, beltId: string): string | null {
    return this.logistics.buildOutpost(empire, colonyId, beltId);
  }

  /** Production des avant-postes + entretien payé par la colonie propriétaire. */
  outpostsTick(empire: Empire): void {
    this.logistics.outpostsTick(empire);
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
    return this.logistics.createRoute(
      empire,
      ownerColonyId,
      fromId,
      fromKind,
      toId,
      toKind,
      resource,
      rule,
      ships,
    );
  }

  /** Action joueur : suspendre/reprendre une route (le cycle en cours se termine). */
  setRoutePaused(empire: Empire, routeId: string, paused: boolean): string | null {
    return this.logistics.setRoutePaused(empire, routeId, paused);
  }

  /** Action joueur : supprimer une route au repos (les vaisseaux redeviennent libres). */
  deleteRoute(empire: Empire, routeId: string): string | null {
    return this.logistics.deleteRoute(empire, routeId);
  }

  /** Ordonnanceur : départs et résolutions de cycles à l'instant `t`. */
  processRoutes(empire: Empire, t: number): void {
    this.logistics.processRoutes(empire, t);
  }

  /**
   * Contexte de prix d'une station (chantier 12) : son biais propre et l'éloignement de
   * sa galaxie. C'est ce qui fait diverger les prix d'un comptoir à l'autre.
   */
  priceContextOf(stationId: string): PriceContext | undefined {
    return this.logistics.priceContextOf(stationId);
  }

  /** Fait évoluer l'humeur de chaque faction à un tick économique (chantier 15). */
  factionMoodTick(now: number, tickNumber: number): void {
    this.logistics.factionMoodTick(now, tickNumber);
  }

  /** Fait tourner l'économie d'un empire PNJ : vend le surplus, contractualise les besoins. */
  npcTick(empire: Empire): void {
    this.logistics.npcTick(empire);
  }

  private loadRoutes(): void {
    this.logistics.loadRoutes();
  }

  private loadOutposts(): void {
    this.logistics.loadOutposts();
  }

  persistOutposts(empire: Empire): void {
    this.logistics.persistOutposts(empire);
  }

  /** Action joueur : lancer une recherche (une seule à la fois, payée en science). */
  startResearch(empire: Empire, techId: string): string | null {
    return this.industry.startResearch(empire, techId);
  }

  /**
   * Action joueur : planifier la chaîne menant à une tech (chantier 11.4).
   * La file remplace la précédente ; sa tête démarre dès que la science suffit.
   */
  queueResearch(empire: Empire, techId: string): string | null {
    return this.industry.queueResearch(empire, techId);
  }

  /** Action joueur : vider la file planifiée (la recherche en cours continue). */
  clearResearchQueue(empire: Empire): string | null {
    return this.industry.clearResearchQueue(empire);
  }

  resolveResearch(empire: Empire, t: number): void {
    this.industry.resolveResearch(empire, t);
  }

  /** Action joueur : envoyer une sonde révéler un système. */
  probe(empire: Empire, colonyId: string, systemId: string): string | null {
    return this.exploration.probe(empire, colonyId, systemId);
  }

  /** Action joueur : envoyer un vaisseau colonial fonder une colonie. */
  colonize(empire: Empire, colonyId: string, planetId: string): string | null {
    return this.exploration.colonize(empire, colonyId, planetId);
  }

  /** Action joueur : livrer des ressources au chantier de portail (tech requise). */
  contributeGateway(
    empire: Empire,
    colonyId: string,
    galaxyId: string,
    wanted: Partial<Record<ResourceId, number>>,
  ): string | null {
    return this.logistics.contributeGateway(empire, colonyId, galaxyId, wanted);
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
    return this.logistics.postContract(
      empire,
      colonyId,
      resource,
      quantity,
      pricePerUnit,
      durationMs,
    );
  }

  /** Action joueur : accepter (tout ou partie d')un contrat étranger et affréter le convoi. */
  acceptContract(
    empire: Empire,
    colonyId: string,
    contractId: string,
    quantity: number,
  ): string | null {
    return this.logistics.acceptContract(empire, colonyId, contractId, quantity);
  }

  /** Action joueur : annuler son propre contrat — rembourse le séquestre du reliquat non honoré. */
  cancelContract(empire: Empire, contractId: string): string | null {
    return this.logistics.cancelContract(empire, contractId);
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
    const jumps = jumpDistanceInUniverse(
      this.universe,
      fleet.systemId,
      toSystemId,
      this.portalLinks,
    );
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
      this.combatDefs(empire),
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
      this.logger.info(`[game] repaire nettoyé (butin ${lair.bounty})`);
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
        and(
          eq(schema.relations.empireA, relation.empireA),
          eq(schema.relations.empireB, relation.empireB),
        ),
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
    this.logger.info(`[game] « ${empire.name} » déclare la guerre à « ${target.name} »`);
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
    for (const fleet of empire.fleetMap.values())
      power += fleetPower(fleet.ships as FleetComposition);
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

  // ─────────────────────────── Objectifs éphémères (chantier 17) ───────────────────────────

  private loadObjectives(): void {
    for (const row of db.select().from(schema.objectives).all()) {
      this.objectiveMap.set(row.id, {
        id: row.id,
        empireId: row.empireId,
        kind: row.kind as ObjectiveKind,
        ...(row.targetCount !== null ? { targetCount: row.targetCount } : {}),
        ...(row.targetSystemId !== null ? { targetSystemId: row.targetSystemId } : {}),
        reward: row.reward,
        createdAt: row.createdAt,
        deadline: row.deadline,
        status: row.status as Objective["status"],
      });
    }
  }

  private insertObjective(objective: Objective): void {
    db.insert(schema.objectives)
      .values({
        id: objective.id,
        gameId: this.clock.id,
        empireId: objective.empireId,
        kind: objective.kind,
        targetCount: objective.targetCount ?? null,
        targetSystemId: objective.targetSystemId ?? null,
        reward: objective.reward,
        createdAt: objective.createdAt,
        deadline: objective.deadline,
        status: objective.status,
      })
      .run();
  }

  private persistObjective(objective: Objective): void {
    db.update(schema.objectives)
      .set({ status: objective.status, deadline: objective.deadline })
      .where(eq(schema.objectives.id, objective.id))
      .run();
  }

  /** Empires en tête de population/influence — sert à évaluer lead_population/lead_influence. */
  private empireLeaders(): { populationLeaderId: string | null; influenceLeaderId: string | null } {
    let popLeader: { id: string; value: number } | null = null;
    let infLeader: { id: string; value: number } | null = null;
    for (const empire of this.empires.values()) {
      const population = [...empire.colonyMap.values()].reduce((s, c) => s + c.population, 0);
      if (!popLeader || population > popLeader.value)
        popLeader = { id: empire.id, value: population };
      if (!infLeader || empire.influence > infLeader.value)
        infLeader = { id: empire.id, value: empire.influence };
    }
    return { populationLeaderId: popLeader?.id ?? null, influenceLeaderId: infLeader?.id ?? null };
  }

  /** Tire un nouvel objectif éphémère pour chaque empire humain qui n'en a pas déjà un ouvert. */
  generateObjectives(tickNumber: number, now: number): void {
    for (const empire of this.empires.values()) {
      if (empire.kind !== "human") continue;
      const mine = objectivesForEmpire(this.runtime, empire);
      const open = mine.filter((o) => o.status === "open");
      if (open.length >= MAX_OPEN_OBJECTIVES_PER_EMPIRE) continue;
      // Cooldown : pas de nouveau tirage juste après complétion/expiration, sinon un but
      // trivialement déjà vrai (ex. lead_influence en tête depuis longtemps) se rejouerait
      // en boucle à chaque tick éco et verserait sa récompense sans fin.
      const lastCreatedAt = mine.reduce((max, o) => Math.max(max, o.createdAt), 0);
      if (lastCreatedAt > 0 && now - lastCreatedAt < OBJECTIVE_DURATION_MS) continue;
      const rng = createRng(`objective-${this.clock.seed}-${empire.id}-${tickNumber}`);
      const spec = generateObjectiveSpec(rng, now, empire.colonyMap.size, empire.claimedSystemIds);
      const objective: Objective = {
        id: randomUUID(),
        empireId: empire.id,
        status: "open",
        ...spec,
      };
      this.objectiveMap.set(objective.id, objective);
      this.insertObjective(objective);
    }
  }

  /** Valide ou expire les objectifs ouverts, contre l'état courant du jeu. */
  resolveObjectives(t: number): void {
    const { populationLeaderId, influenceLeaderId } = this.empireLeaders();
    for (const [id, objective] of this.objectiveMap) {
      if (objective.status !== "open") continue;
      const empire = this.empires.get(objective.empireId);
      if (!empire) continue;
      const met = objectiveMet(objective, {
        colonyCount: empire.colonyMap.size,
        claimedSystemIds: empire.claimedSystemIds,
        leadsPopulation: populationLeaderId === empire.id,
        leadsInfluence: influenceLeaderId === empire.id,
      });
      if (met) {
        const home = [...empire.colonyMap.values()][0];
        if (home) {
          const resources = {
            ...home.resources,
            credits: home.resources.credits + objective.reward,
          };
          empire.colonyMap.set(home.id, { ...home, resources });
          this.persistColony(empire.colonyMap.get(home.id)!);
        }
        const next: Objective = { ...objective, status: "completed" };
        this.objectiveMap.set(id, next);
        this.persistObjective(next);
        this.logger.info(`[game] « ${empire.name} » a rempli son objectif : ${objective.kind}`);
      } else if (t >= objective.deadline) {
        const next: Objective = { ...objective, status: "expired" };
        this.objectiveMap.set(id, next);
        this.persistObjective(next);
      }
    }
  }

  // ─────────────────────────── Événements de monde (chantier 17) ───────────────────────────

  private loadWorldEvents(): void {
    for (const row of db.select().from(schema.worldEvents).all()) {
      this.worldEventMap.set(row.id, {
        id: row.id,
        kind: row.kind as WorldEventKind,
        ...(row.galaxyId !== null ? { galaxyId: row.galaxyId } : {}),
        ...(row.factionId !== null ? { factionId: row.factionId } : {}),
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
      });
    }
  }

  private insertWorldEvent(event: WorldEvent): void {
    db.insert(schema.worldEvents)
      .values({
        id: event.id,
        gameId: this.clock.id,
        kind: event.kind,
        galaxyId: event.galaxyId ?? null,
        factionId: event.factionId ?? null,
        createdAt: event.createdAt,
        expiresAt: event.expiresAt,
      })
      .run();
  }

  /** Retire les événements de monde expirés (pas de statut : ils disparaissent, point). */
  resolveWorldEvents(t: number): void {
    for (const [id, event] of this.worldEventMap) {
      if (t < event.expiresAt) continue;
      this.worldEventMap.delete(id);
      db.delete(schema.worldEvents).where(eq(schema.worldEvents.id, id)).run();
    }
  }

  /** Kinds d'événements de monde actifs sur une galaxie (bonus/malus de prix, spawn pirate). */
  private worldEventKindsOnGalaxy(galaxyId: string): WorldEventKind[] {
    return [...this.worldEventMap.values()]
      .filter((e) => e.galaxyId === galaxyId)
      .map((e) => e.kind);
  }

  /** Tire un nouvel événement de monde et l'applique — cadence lente, un à la fois par cible. */
  worldEventTick(tickNumber: number, now: number): void {
    const rng = createRng(`worldevent-${this.clock.seed}-${tickNumber}`);
    const kind = rollWorldEvent(rng);
    if (!kind) return;

    if (kind === "faction_boom") {
      const factionId = FACTION_IDS[Math.floor(rng() * FACTION_IDS.length)]!;
      const alreadyActive = [...this.worldEventMap.values()].some(
        (e) => e.kind === "faction_boom" && e.factionId === factionId,
      );
      if (alreadyActive) return;
      const expiresAt = now + WORLD_EVENT_DURATION_MS;
      const event: WorldEvent = { id: randomUUID(), kind, factionId, createdAt: now, expiresAt };
      this.worldEventMap.set(event.id, event);
      this.insertWorldEvent(event);
      // Effet immédiat : force le boom, comme une pénurie de faction poste aussitôt un contrat.
      this.setFactionMood(factionId, "boom", expiresAt);
      this.logger.info(`[game] essor de faction : ${FACTIONS[factionId as FactionId].name}`);
      this.notify();
      return;
    }

    // Les trois autres kinds ciblent une galaxie de l'univers déjà généré.
    if (this.universe.galaxies.length === 0) return;
    const galaxy = this.universe.galaxies[Math.floor(rng() * this.universe.galaxies.length)]!;
    const alreadyActive = this.worldEventKindsOnGalaxy(galaxy.id).includes(kind);
    if (alreadyActive) return;
    const event: WorldEvent = {
      id: randomUUID(),
      kind,
      galaxyId: galaxy.id,
      createdAt: now,
      expiresAt: now + WORLD_EVENT_DURATION_MS,
    };
    this.worldEventMap.set(event.id, event);
    this.insertWorldEvent(event);
    this.logger.info(`[game] événement de monde : ${kind} sur ${galaxy.name}`);
    this.notify();
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
      this.combatDefs(empire, target.empire),
    );
    this.archiveBattle(
      fleet.systemId,
      fleet.name,
      `${target.empire.name} — ${target.fleet.name}`,
      report,
    );
    this.applyFleetSurvivors(empire, fleet, report.attackerSurvivors as FleetComposition);
    this.applyFleetSurvivors(
      target.empire,
      target.fleet,
      report.defenderSurvivors as FleetComposition,
    );
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
        this.combatDefs(empire, target.empire),
      );
      this.archiveBattle(systemId, fleet.name, `${target.empire.name} — ${defender.name}`, report);
      this.applyFleetSurvivors(
        target.empire,
        defender,
        report.defenderSurvivors as FleetComposition,
      );
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
        homeResources[res] = Math.min(
          homeResources[res] + amount,
          storageCap(home, res, empire.effects),
        );
      }
      empire.colonyMap.set(home.id, { ...home, resources: homeResources });
      this.persistColony(empire.colonyMap.get(home.id)!);
    }
    // Rupture du claim ennemi sur le système pillé.
    if (target.empire.claimedSystemIds.includes(systemId)) {
      this.exploration.dropClaim(target.empire, systemId);
    }
    this.archiveBattle(systemId, fleet.name, `${target.empire.name} — ${victim.name} (raid)`, {
      raid: true,
      stolen,
    });
    this.logger.info(`[game] raid sur ${victim.name} par « ${empire.name} »`);
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
  fleetsTick(empire: Empire, t: number): void {
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

  /**
   * Apparition de repaires pirates PNJ (univers partagé, une fois par tick éco).
   * Brouillard univers (union des empires) ; jamais dans un système revendiqué.
   */
  spawnPirates(tickNumber: number): void {
    for (const systemId of this.exploration.universeExplored()) {
      if (this.exploration.claimOwner(systemId)) continue;
      if ([...this.lairMap.values()].some((l) => l.systemId === systemId)) continue;
      const galaxy = this.universe.galaxies.find((g) => g.systems.some((s) => s.id === systemId));
      // Vague pirate majeure (chantier 17) : la galaxie touchée voit sa chance de spawn multipliée.
      const surging = galaxy
        ? this.worldEventKindsOnGalaxy(galaxy.id).includes("pirate_surge")
        : false;
      const chance = surging
        ? Math.min(1, PIRATE_SPAWN_CHANCE * WORLD_EVENT_PIRATE_MULT)
        : PIRATE_SPAWN_CHANCE;
      const rng = createRng(`pirate-${this.clock.seed}-${systemId}-${tickNumber}`);
      if (rng() > chance) continue;
      // Menace croissante selon l'éloignement de la galaxie d'origine.
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
        .values({
          id: fleet.id,
          gameId: this.clock.id,
          ownerId: fleet.ownerId ?? this.defaultEmpire.id,
          ...values,
        })
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
      db.insert(schema.pirateLairs)
        .values({ id: lair.id, gameId: this.clock.id, ...values })
        .run();
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
    this.logistics.initGateways();
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

  /** Maintient la frontière glissante : toujours des galaxies vierges devant les joueurs. */
  ensureFrontier(): void {
    this.exploration.ensureFrontier();
  }

  private loadGateways(): void {
    this.logistics.loadGateways();
  }

  /** Active les portails dont le chantier final est terminé. */
  resolveGateways(t: number): void {
    this.logistics.resolveGateways(t);
  }

  private loadContracts(): void {
    this.logistics.loadContracts();
  }

  /** Expire les contrats dépassés et rembourse le séquestre du reliquat non honoré. */
  resolveContracts(t: number): void {
    this.logistics.resolveContracts(t);
  }

  /** Action joueur : revendiquer un système (colonie sur place requise). */
  claimSystem(empire: Empire, systemId: string): string | null {
    return this.exploration.claimSystem(empire, systemId);
  }

  /** Action joueur : abandonner une revendication (sans remboursement). */
  unclaimSystem(empire: Empire, systemId: string): string | null {
    return this.exploration.unclaimSystem(empire, systemId);
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
      this.logistics.persistRoute(this.routeMap.get(id)!);
    }
    for (const [id, gateway] of this.gatewayMap) {
      if (gateway.activatesAt === null) continue;
      this.gatewayMap.set(id, { ...gateway, activatesAt: gateway.activatesAt - delta });
      this.logistics.persistGateway(this.gatewayMap.get(id)!);
    }
    // Contrats : partagés comme les portails — l'échéance suit le même décalage.
    for (const [id, contract] of this.contractMap) {
      if (contract.status !== "open") continue;
      const next: Contract = { ...contract, deadline: contract.deadline - delta };
      this.contractMap.set(id, next);
      this.logistics.persistContract(next);
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
    // Échéance des objectifs éphémères : même décalage.
    for (const [id, objective] of this.objectiveMap) {
      if (objective.status !== "open") continue;
      const next: Objective = { ...objective, deadline: objective.deadline - delta };
      this.objectiveMap.set(id, next);
      this.persistObjective(next);
    }
    // Échéance des événements de monde déclenchés via l'outil de dev (Date.now() réel,
    // contrairement au tirage naturel qui utilise déjà l'horloge simulée).
    for (const [id, event] of this.worldEventMap) {
      const next: WorldEvent = { ...event, expiresAt: event.expiresAt - delta };
      this.worldEventMap.set(id, next);
      db.update(schema.worldEvents)
        .set({ expiresAt: next.expiresAt })
        .where(eq(schema.worldEvents.id, id))
        .run();
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
    this.logger.info(`[game] fast-forward de ${seconds}s (${missed} ticks)`);
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
    this.logistics.persistGateway(next);
    this.notify();
  }

  /** Force l'humeur d'une faction — partagé entre l'outil de dev et les événements de monde. */
  private setFactionMood(
    factionId: string,
    mood: FactionState["mood"],
    until: number | null,
  ): boolean {
    if (!this.factionStateMap.has(factionId)) return false;
    const state: FactionState = { factionId, mood, moodUntil: mood === "neutral" ? null : until };
    this.factionStateMap.set(factionId, state);
    this.persistFactionState(state);
    return true;
  }

  /** Outil de dev uniquement : force l'humeur d'une faction (chantier 15). */
  devSetFactionMood(
    factionId: string,
    mood: FactionState["mood"],
    durationMs = FACTION_MOOD_DURATION_MS,
  ): boolean {
    if (!this.setFactionMood(factionId, mood, Date.now() + durationMs)) return false;
    // Même effet de bord qu'une bascule naturelle : sinon l'outil de dev mentirait sur
    // ce qu'une pénurie déclenche réellement.
    if (mood === "shortage") {
      this.logistics.factionPostShortageContract(
        factionId,
        createRng(`dev-shortage-${factionId}-${Date.now()}`),
      );
    }
    this.notify();
    return true;
  }

  /**
   * Outil de dev uniquement : déclenche un événement de monde (chantier 17). `target`
   * est un id de galaxie (economic_crisis/gold_rush/pirate_surge) ou de faction
   * (faction_boom) ; laissé vide, le premier de l'univers/des factions est pris.
   */
  devTriggerWorldEvent(
    kind: WorldEventKind,
    target = "",
    durationMs = WORLD_EVENT_DURATION_MS,
  ): string | null {
    const now = Date.now();
    const expiresAt = now + durationMs;
    if (kind === "faction_boom") {
      const factionId = target || FACTION_IDS[0]!;
      if (!this.factionStateMap.has(factionId)) return null;
      const event: WorldEvent = { id: randomUUID(), kind, factionId, createdAt: now, expiresAt };
      this.worldEventMap.set(event.id, event);
      this.insertWorldEvent(event);
      this.setFactionMood(factionId, "boom", expiresAt);
      this.notify();
      return event.id;
    }
    const galaxyId = target || this.universe.galaxies[0]?.id;
    if (!galaxyId || !this.universe.galaxies.some((g) => g.id === galaxyId)) return null;
    const event: WorldEvent = { id: randomUUID(), kind, galaxyId, createdAt: now, expiresAt };
    this.worldEventMap.set(event.id, event);
    this.insertWorldEvent(event);
    this.notify();
    return event.id;
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
    const starter = pickStarterGalaxy(this.exploration.galaxyOccupancy());
    if (starter === null) {
      // Plus une seule place : ouvrir la frontière, puis viser la première galaxie neuve.
      const before = this.universe.galaxies.length;
      this.exploration.growUniverse(1);
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
    return freeSystem[0] ?? candidates[0] ?? null;
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
    this.seedStarterBlueprints(empire);
    // L'arrivant peut avoir entamé la dernière galaxie vierge : on repousse le bord.
    this.ensureFrontier();
    this.notify();
    this.logger.info(`[game] empire « ${empireName} » instancié (${this.empires.size} au total)`);
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
      this.logger.info(`[game] empire « ${orphan.name} » adopté par un compte`);
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
  snapshotForEmpire(empire: Empire): EmpireSnapshot {
    return projectSnapshotForEmpire(this.runtime, empire);
  }

  /** Univers redacté au brouillard d'un empire — payload initial du message `hello`. */
  clientUniverseForEmpire(empire: Empire): Universe {
    return clientUniverseForEmpire(this.runtime, empire);
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
    this.logistics.insertMission(
      empire,
      kind,
      fromColonyId,
      targetId,
      durationMs,
      extras,
      departedAt,
    );
  }

  /**
   * Résout les missions de l'empire arrivées à l'instant `t` : révélation, fondation,
   * commerce. Marchés et portails restent partagés (univers) ; `insertMission` (trajet
   * retour d'achat) reste sur le defaultEmpire — threadé en 7c.
   */
  resolveMissions(empire: Empire, t: number): void {
    this.logistics.resolveMissions(empire, t);
  }

  /**
   * Dote de stocks les stations qui n'en ont pas encore. Appelé à la création d'une
   * partie et après chaque extension de l'univers (les galaxies neuves arrivent avec
   * leurs comptoirs) — d'où l'idempotence.
   */
  private initMarkets(): void {
    this.logistics.initMarkets();
  }

  private loadMarkets(): void {
    this.logistics.loadMarkets();
  }

  /** Génération d'influence ; entretien impayé = la revendication la plus récente tombe. */
  influenceTick(empire: Empire): void {
    this.exploration.influenceTick(empire);
  }

  /** Tick économique : les stocks PNJ de chaque station évoluent selon leur faction. */
  economyTick(tickNumber: number): void {
    this.logistics.economyTick(tickNumber);
  }

  private markExplored(empire: Empire, systemId: string): void {
    this.exploration.markExplored(empire, systemId);
  }

  /** Livre les convois arrivés à l'instant `t` (surplus au-delà du stockage perdu). */
  deliverTransfers(empire: Empire, t: number): void {
    this.logistics.deliverTransfers(empire, t);
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
    this.logger.info(
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

  persistColony(colony: Colony): void {
    this.industry.persistColony(colony);
  }

  private catchUp(): void {
    const elapsed = Math.floor((Date.now() - this.clock.lastTickAt) / TICK_MS);
    if (elapsed <= 0) return;
    const ticks = Math.min(elapsed, MAX_CATCHUP_TICKS);
    this.logger.info(`[game] catch-up: ${ticks} ticks (${elapsed} écoulés)`);
    this.advance(ticks);
  }

  /**
   * Applique N ticks. Les timers réels (file de construction) sont résolus au
   * timestamp de chaque tick : un bâtiment fini en cours de catch-up produit
   * pour les ticks restants.
   */
  /** Encodé nommément, dans l'ordre exact, par `TickRunner` (voir runtime/tick-runner.ts). */
  private advance(ticks: number): void {
    this.tickRunner.run(ticks);
  }

  /** Production/économie d'une colonie à chaque tick, avec bonus territorial des claims. */
  colonyProductionTick(empire: Empire, t: number): void {
    this.industry.colonyProductionTick(empire, t);
  }

  private persistResearch(empire: Empire): void {
    this.industry.persistResearch(empire);
  }

  private loadTransfers(): void {
    this.logistics.loadTransfers();
  }

  private loadMissions(): void {
    this.logistics.loadMissions();
  }

  notify(): void {
    // Signal seul : chaque connexion recompose le snapshot redacté de son empire
    // (7c-B). Le marqueur d'exploration se réarme par empire après diffusion.
    for (const listener of this.listeners) listener();
    for (const empire of this.empires.values()) {
      empire.explorationDirty = false;
      empire.universeDirty = false;
    }
  }
}
