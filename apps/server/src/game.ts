import {
  computeEffects,
  createRng,
  emptyOrbital,
  emptyResources,
  FACTION_MOOD_DURATION_MS,
  GATEWAY_BUILD_MS,
  gatewayCost,
  gatewayCovered,
  gatewayLinks,
  INITIAL_GALAXIES,
  pickStarterGalaxy,
  MAX_CATCHUP_TICKS,
  WORLD_EVENT_DURATION_MS,
  pirateBounty,
  pirateComposition,
  pirateDirectives,
  TICK_MS,
  type AsteroidBelt,
  type BuildingId,
  type Colony,
  type Contract,
  type EmpireEffects,
  type CombatPhase,
  type FactionState,
  type Fleet,
  type LiftRule,
  type GameState,
  type Gateway,
  type PirateLair,
  type PriceContext,
  type StoredBattle,
  type MiningOutpost,
  type Mission,
  type Objective,
  type Planet,
  type ProposalKind,
  type ResourceId,
  type Relation,
  type RelationProposal,
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
import { DiplomacyService } from "./runtime/services/diplomacy-service.js";
import { ExplorationService } from "./runtime/services/exploration-service.js";
import { FleetService } from "./runtime/services/fleet-service.js";
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
  /** Flottes, combat (repaire/PvP), production/déplacement et repaires pirates PNJ. */
  private fleetService: FleetService;
  /** Diplomatie, objectifs éphémères, événements de monde et humeur de faction. */
  private diplomacy: DiplomacyService;
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
    this.fleetService = new FleetService(
      this.runtime,
      () => this.notify(),
      logger,
      (colony) => this.persistColony(colony),
      (empire, systemId) => this.exploration.dropClaim(empire, systemId),
      (empire, systemId) => this.markExplored(empire, systemId),
      (a, b) => this.atWar(a, b),
      (galaxyId) => this.worldEventKindsOnGalaxy(galaxyId),
    );
    this.diplomacy = new DiplomacyService(
      this.runtime,
      () => this.notify(),
      logger,
      (colony) => this.persistColony(colony),
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
    return this.fleetService.createFleet(empire, colonyId, name);
  }

  /** Action joueur : produire un vaisseau de guerre (file de la flotte, tech requise). */
  buildWarship(empire: Empire, fleetId: string, warshipId: string): string | null {
    return this.fleetService.buildWarship(empire, fleetId, warshipId);
  }

  setFleetDirectives(
    empire: Empire,
    fleetId: string,
    directives: Record<string, string>,
  ): string | null {
    return this.fleetService.setFleetDirectives(empire, fleetId, directives);
  }

  /** Action joueur : déplacer une flotte vers un système accessible. */
  moveFleet(empire: Empire, fleetId: string, toSystemId: string): string | null {
    return this.fleetService.moveFleet(empire, fleetId, toSystemId);
  }

  /** Action joueur : attaquer un repaire pirate présent dans le système de la flotte. */
  attackLair(empire: Empire, fleetId: string, lairId: string): string | null {
    return this.fleetService.attackLair(empire, fleetId, lairId);
  }

  disbandFleet(empire: Empire, fleetId: string): string | null {
    return this.fleetService.disbandFleet(empire, fleetId);
  }

  // ─────────────────────────── Diplomatie (chantier 16) ───────────────────────────

  /** Deux empires sont-ils en guerre ? */
  private atWar(a: string, b: string): boolean {
    return this.diplomacy.atWar(a, b);
  }

  private loadRelations(): void {
    this.diplomacy.loadRelations();
  }

  /** Action joueur : déclarer la guerre à un empire — unilatérale, mais coûteuse en influence. */
  declareWar(empire: Empire, targetEmpireId: string): string | null {
    return this.diplomacy.declareWar(empire, targetEmpireId);
  }

  /** Action joueur : faire la paix avec un empire — rouvre un cooldown avant re-déclaration. */
  makePeace(empire: Empire, targetEmpireId: string): string | null {
    return this.diplomacy.makePeace(empire, targetEmpireId);
  }

  /** Action joueur : proposer un pacte (NAP ou alliance) — exige le consentement de la cible. */
  proposeRelation(empire: Empire, targetEmpireId: string, kind: ProposalKind): string | null {
    return this.diplomacy.proposeRelation(empire, targetEmpireId, kind);
  }

  /** Action joueur : répondre (accepter/refuser) une proposition qui lui est adressée. */
  respondRelation(empire: Empire, proposalId: string, accept: boolean): string | null {
    return this.diplomacy.respondRelation(empire, proposalId, accept);
  }

  /** Action joueur : retirer sa propre proposition avant qu'elle ne reçoive de réponse. */
  cancelProposal(empire: Empire, proposalId: string): string | null {
    return this.diplomacy.cancelProposal(empire, proposalId);
  }

  /** Action joueur : rompre un pacte (NAP ou alliance) en vigueur — retour à neutre. */
  breakRelation(empire: Empire, targetEmpireId: string): string | null {
    return this.diplomacy.breakRelation(empire, targetEmpireId);
  }

  private loadProposals(): void {
    this.diplomacy.loadProposals();
  }

  // ─────────────────────────── Objectifs éphémères (chantier 17) ───────────────────────────

  private loadObjectives(): void {
    this.diplomacy.loadObjectives();
  }

  /** Tire un nouvel objectif éphémère pour chaque empire humain qui n'en a pas déjà un ouvert. */
  generateObjectives(tickNumber: number, now: number): void {
    this.diplomacy.generateObjectives(tickNumber, now);
  }

  /** Valide ou expire les objectifs ouverts, contre l'état courant du jeu. */
  resolveObjectives(t: number): void {
    this.diplomacy.resolveObjectives(t);
  }

  // ─────────────────────────── Événements de monde (chantier 17) ───────────────────────────

  private loadWorldEvents(): void {
    this.diplomacy.loadWorldEvents();
  }

  /** Retire les événements de monde expirés (pas de statut : ils disparaissent, point). */
  resolveWorldEvents(t: number): void {
    this.diplomacy.resolveWorldEvents(t);
  }

  /** Kinds d'événements de monde actifs sur une galaxie (bonus/malus de prix, spawn pirate). */
  private worldEventKindsOnGalaxy(galaxyId: string): WorldEventKind[] {
    return this.diplomacy.worldEventKindsOnGalaxy(galaxyId);
  }

  /** Tire un nouvel événement de monde et l'applique — cadence lente, un à la fois par cible. */
  worldEventTick(tickNumber: number, now: number): void {
    this.diplomacy.worldEventTick(tickNumber, now);
  }

  /** Action joueur : attaquer une flotte ennemie stationnée dans le même système (PvP). */
  attackFleet(empire: Empire, fleetId: string, targetFleetId: string): string | null {
    return this.fleetService.attackFleet(empire, fleetId, targetFleetId);
  }

  /**
   * Action joueur : attaquer une colonie ennemie (PvP — raid). La flotte ennemie la
   * plus puissante stationnée sur zone défend d'abord ; si l'attaquant l'emporte (ou
   * qu'il n'y a pas de défenseur), il pille une fraction des ressources et rompt le
   * claim ennemi sur le système. Pas de capture de colonie à ce stade.
   */
  attackColony(empire: Empire, fleetId: string, targetColonyId: string): string | null {
    return this.fleetService.attackColony(empire, fleetId, targetColonyId);
  }

  /**
   * Résout production et déplacements des flottes de l'empire, puis la ponction
   * pirate sur ses colonies. Repaires pirates = PNJ partagés (l'apparition est
   * résolue une fois par tick au niveau univers, cf. `advance`).
   */
  fleetsTick(empire: Empire, t: number): void {
    this.fleetService.fleetsTick(empire, t);
  }

  /**
   * Apparition de repaires pirates PNJ (univers partagé, une fois par tick éco).
   * Brouillard univers (union des empires) ; jamais dans un système revendiqué.
   */
  spawnPirates(tickNumber: number): void {
    this.fleetService.spawnPirates(tickNumber, this.exploration.universeExplored(), (systemId) =>
      this.exploration.claimOwner(systemId),
    );
  }

  private persistFleet(fleet: Fleet, insert = false): void {
    this.fleetService.persistFleet(fleet, insert);
  }

  private persistLair(lair: PirateLair, insert = false): void {
    this.fleetService.persistLair(lair, insert);
  }

  private loadFleets(): void {
    this.fleetService.loadFleets();
  }

  private loadPirates(): void {
    this.fleetService.loadPirates();
  }

  private loadBattles(): void {
    this.fleetService.loadBattles();
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
    this.diplomacy.initFactionStates();
  }

  private loadFactionStates(): void {
    this.diplomacy.loadFactionStates();
  }

  private persistFactionState(state: FactionState): void {
    this.diplomacy.persistFactionState(state);
  }

  private persistRelation(relation: Relation): void {
    this.diplomacy.persistRelation(relation);
  }

  private persistObjective(objective: Objective): void {
    this.diplomacy.persistObjective(objective);
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

  /** Outil de dev uniquement : force l'humeur d'une faction (chantier 15). */
  devSetFactionMood(
    factionId: string,
    mood: FactionState["mood"],
    durationMs = FACTION_MOOD_DURATION_MS,
  ): boolean {
    return this.diplomacy.devSetFactionMood(factionId, mood, durationMs, (fid) =>
      this.logistics.factionPostShortageContract(
        fid,
        createRng(`dev-shortage-${fid}-${Date.now()}`),
      ),
    );
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
    return this.diplomacy.devTriggerWorldEvent(kind, target, durationMs);
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
