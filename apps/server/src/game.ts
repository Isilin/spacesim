import {
  createRng,
  FACTION_MOOD_DURATION_MS,
  GATEWAY_BUILD_MS,
  gatewayCost,
  gatewayCovered,
  generateGalaxyAt,
  generateUniverse,
  INITIAL_GALAXIES,
  MAX_CATCHUP_TICKS,
  WORLD_EVENT_DURATION_MS,
  pirateBounty,
  pirateComposition,
  pirateDirectives,
  TICK_MS,
  type AsteroidBelt,
  type Colony,
  type Contract,
  type EmpireEffects,
  type CombatPhase,
  type FactionState,
  type Fleet,
  type GameState,
  type Gateway,
  type PirateLair,
  type StoredBattle,
  type MiningOutpost,
  type Mission,
  type Objective,
  type Planet,
  type ResourceId,
  type Relation,
  type RelationProposal,
  type Route,
  type StationMarket,
  type Stocks,
  type TradeStation,
  type Transfer,
  type Universe,
  type WorldEvent,
  type WorldEventKind,
} from "@spacesim/shared";
import type { EmpireSnapshot } from "@spacesim/protocol";
import { randomUUID } from "node:crypto";
import { Empire, type Clock } from "./empire.js";
import { GameRuntime } from "./runtime/game-runtime.js";
import { consoleLogger, type Logger } from "./runtime/logger.js";
import { BootstrapService } from "./runtime/services/bootstrap-service.js";
import { ContractService } from "./runtime/services/contract-service.js";
import { DiplomacyService } from "./runtime/services/diplomacy-service.js";
import { ExplorationService } from "./runtime/services/exploration-service.js";
import { FleetService } from "./runtime/services/fleet-service.js";
import { GatewayService } from "./runtime/services/gateway-service.js";
import { IndustryService } from "./runtime/services/industry-service.js";
import { LogisticsService } from "./runtime/services/logistics-service.js";
import { MarketService } from "./runtime/services/market-service.js";
import { ObjectiveService } from "./runtime/services/objective-service.js";
import { GameRepository } from "./runtime/repositories/game-repository.js";
import { Notifier, type StateListener } from "./runtime/notifier.js";
import { Scheduler } from "./runtime/scheduler.js";
import { TickRunner } from "./runtime/tick-runner.js";
import {
  appendGalaxies,
  loadUniverse,
  materializedGalaxyCount,
  withParentIndexes,
} from "./runtime/universe-store.js";
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

export type { StateListener };

/**
 * Détient l'état de la partie et fait avancer la simulation.
 * Serveur autoritaire : le client ne fait qu'afficher.
 */
export class GameEngine {
  /** Composé au boot : univers, horloge, index et entités partagées (game-scoped). */
  private runtime: GameRuntime;
  /** Déroule un tick dans l'ordre exact observé en production (runtime/tick-runner.ts). */
  private tickRunner: TickRunner;
  /**
   * Services par domaine, publics : `ws/dispatch.ts` et `http/routes/dev.ts` les
   * appellent directement (chantier 19.6) — `GameEngine` n'expose plus de façade de
   * commande une-ligne par action.
   */
  /** Bâtiments, chantier civil, plans de vaisseaux (chantier 13) et recherche. */
  readonly industry: IndustryService;
  /** Convois manuels, ascenseur orbital, routes automatiques, avant-postes, missions. */
  readonly logistics: LogisticsService;
  /** Portails inter-galactiques : chantiers, contribution, activation. */
  readonly gateway: GatewayService;
  /** Contrats de fourniture : publication, acceptation, annulation, expiration. */
  readonly contract: ContractService;
  /** Marché de station (joueur + PNJ), prix régionaux, réputation/embargo, humeur de faction. */
  readonly market: MarketService;
  /** Sondes, colonisation, revendications de systèmes, croissance de l'univers (chantier 9). */
  readonly exploration: ExplorationService;
  /** Flottes, combat (repaire/PvP), production/déplacement et repaires pirates PNJ. */
  readonly fleetService: FleetService;
  /** Diplomatie, événements de monde et humeur de faction. */
  readonly diplomacy: DiplomacyService;
  /** Objectifs éphémères personnels (chantier 17), domaine isolé. */
  readonly objective: ObjectiveService;
  /** Bootstrap des empires (compte joueur, PNJ, colonie mère) et outils de dev associés. */
  readonly bootstrap: BootstrapService;
  /** Injecté depuis le boot (`setLogger`) ; console brute par défaut (tests, scripts). */
  private logger: Logger = consoleLogger;
  private readonly notifier: Notifier;
  private readonly scheduler: Scheduler;

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

  private constructor(clock: Clock, universe: Universe) {
    this.runtime = new GameRuntime(clock, universe);
    this.notifier = new Notifier(() => this.runtime.empires.values());
    this.scheduler = new Scheduler({
      lastTickAt: () => this.clock.lastTickAt,
      advance: (ticks) => this.advance(ticks),
    });
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
    // Gateway/Contract/Market ont besoin de `reserveShip`/`insertMission` (Logistics) ;
    // Logistics a besoin de `resolveSaleAt`/`persistGateway` (Market/Gateway) pour
    // résoudre les missions qui traversent leur domaine. Cycle cassé par des callbacks
    // paresseux (fermetures) : l'ordre de construction n'importe pas, seul l'ordre
    // d'AFFECTATION des champs compte, et il est complet à la fin du constructeur.
    this.gateway = new GatewayService(
      this.runtime,
      () => this.notify(),
      logger,
      (colony) => this.persistColony(colony),
      (empire, colony, busyUntil) => this.logistics.reserveShip(empire, colony, busyUntil),
      (empire, kind, fromColonyId, targetId, durationMs, extras) =>
        this.logistics.insertMission(empire, kind, fromColonyId, targetId, durationMs, extras),
    );
    this.contract = new ContractService(
      this.runtime,
      () => this.notify(),
      logger,
      (colony) => this.persistColony(colony),
      (empire, colony, busyUntil) => this.logistics.reserveShip(empire, colony, busyUntil),
      (empire, kind, fromColonyId, targetId, durationMs, extras, departedAt) =>
        this.logistics.insertMission(
          empire,
          kind,
          fromColonyId,
          targetId,
          durationMs,
          extras,
          departedAt,
        ),
    );
    this.market = new MarketService(
      this.runtime,
      () => this.notify(),
      logger,
      (colony) => this.persistColony(colony),
      (state) => this.persistFactionState(state),
      (galaxyId) => this.worldEventKindsOnGalaxy(galaxyId),
      (empire, colony, busyUntil) => this.logistics.reserveShip(empire, colony, busyUntil),
      (empire, kind, fromColonyId, targetId, durationMs, extras, departedAt) =>
        this.logistics.insertMission(
          empire,
          kind,
          fromColonyId,
          targetId,
          durationMs,
          extras,
          departedAt,
        ),
      (empire, colonyId, resource, quantity, pricePerUnit, durationMs) =>
        this.contract.postContract(empire, colonyId, resource, quantity, pricePerUnit, durationMs),
      (contract) => this.contract.insertContract(contract),
    );
    this.logistics = new LogisticsService(
      this.runtime,
      () => this.notify(),
      logger,
      (colony) => this.persistColony(colony),
      (empire, colony) => this.insertColony(empire, colony),
      (empire, systemId) => this.markExplored(empire, systemId),
      (colonyId) => this.empireOfColony(colonyId),
      {
        resolveSaleAt: (stationId, cargo) => this.market.resolveSaleAt(stationId, cargo),
        resolvePurchaseAt: (stationId, resource, budget, capacity) =>
          this.market.resolvePurchaseAt(stationId, resource, budget, capacity),
        stationRepBonus: (empire, stationId) => this.market.stationRepBonus(empire, stationId),
        addFactionRep: (empire, stationId, creditsExchanged) =>
          this.market.addFactionRep(empire, stationId, creditsExchanged),
      },
      (gateway) => this.gateway.persistGateway(gateway),
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
    this.diplomacy = new DiplomacyService(this.runtime, () => this.notify(), logger);
    this.objective = new ObjectiveService(
      this.runtime,
      () => this.notify(),
      logger,
      (colony) => this.persistColony(colony),
    );
    this.bootstrap = new BootstrapService(
      this.runtime,
      () => this.notify(),
      logger,
      (empire) => this.seedStarterBlueprints(empire),
      () => this.ensureFrontier(),
      () => this.exploration.galaxyOccupancy(),
      (count) => this.exploration.growUniverse(count),
      (empire, systemId) => this.markExplored(empire, systemId),
    );
    this.tickRunner = new TickRunner(
      this.runtime,
      {
        industry: this.industry,
        logistics: this.logistics,
        gateway: this.gateway,
        contract: this.contract,
        market: this.market,
        exploration: this.exploration,
        fleetService: this.fleetService,
        diplomacy: this.diplomacy,
        objective: this.objective,
      },
      () => this.notify(),
    );
  }

  /** (Ré)indexe les entités d'univers — appelé à la construction et après chaque extension. */
  private reindexUniverse(): void {
    this.runtime.reindexUniverse();
  }

  /**
   * Charge l'univers existant depuis la base, puis rattrape le temps hors-ligne (borné).
   * Lève si la base est vierge : la création d'un univers est un geste explicite
   * (`bootstrapNewUniverse`), jamais un effet de bord — un serveur officiel ne doit pas
   * pouvoir repartir de zéro parce que sa base était inaccessible.
   */
  static async load(): Promise<GameEngine> {
    const row = await new GameRepository().find();
    if (!row) {
      throw new Error("Aucun univers en base — utiliser GameEngine.bootstrapNewUniverse()");
    }
    const clock: Clock = {
      id: row.id,
      seed: row.seed,
      tick: row.tick,
      lastTickAt: row.lastTickAt,
      galaxyCount: row.galaxyCount,
    };

    // Rattrapage one-shot : base d'avant le chantier 18 (compteur seul persisté) —
    // matérialise les galaxies manquantes depuis la seed, parents figés sur les
    // positions RÉELLES déjà en base. Idempotent, rejouable après un crash.
    const done = materializedGalaxyCount(clock.id);
    if (done < clock.galaxyCount) {
      const existing = loadUniverse(clock.id, clock.seed) ?? { seed: clock.seed, galaxies: [] };
      const missing: Universe["galaxies"] = [];
      for (let i = done; i < clock.galaxyCount; i++) missing.push(generateGalaxyAt(clock.seed, i));
      const stamped = withParentIndexes({
        seed: clock.seed,
        galaxies: [...existing.galaxies, ...missing],
      });
      appendGalaxies(clock.id, stamped.galaxies.slice(done), clock.galaxyCount);
      console.log(
        `[game] rattrapage one-shot : ${clock.galaxyCount - done} galaxie(s) matérialisée(s) depuis la seed`,
      );
    } else if (done > clock.galaxyCount) {
      // Les tables font autorité : le compteur se réaligne sur elles.
      appendGalaxies(clock.id, [], done);
      clock.galaxyCount = done;
      console.warn(`[game] games.galaxyCount réaligné sur les tables univers (${done})`);
    }

    const universe = loadUniverse(clock.id, clock.seed);
    if (!universe) {
      throw new Error("Univers introuvable en base malgré une ligne games — base corrompue ?");
    }
    return GameEngine.boot(clock, universe, false);
  }

  /**
   * Crée l'univers — UNE fois dans la vie du serveur (geste explicite, voir `load`).
   * Lève si un univers existe déjà.
   */
  static async bootstrapNewUniverse(): Promise<GameEngine> {
    const gameRepo = new GameRepository();
    if (await gameRepo.find()) {
      throw new Error("Un univers existe déjà en base — utiliser GameEngine.load()");
    }
    const row = {
      id: randomUUID(),
      seed: randomUUID().slice(0, 8),
      tick: 0,
      lastTickAt: Date.now(),
      createdAt: Date.now(),
      galaxyCount: INITIAL_GALAXIES,
    };
    gameRepo.insert(row);
    const universe = withParentIndexes(generateUniverse(row.seed, INITIAL_GALAXIES));
    appendGalaxies(row.id, universe.galaxies, INITIAL_GALAXIES);
    const clock: Clock = {
      id: row.id,
      seed: row.seed,
      tick: row.tick,
      lastTickAt: row.lastTickAt,
      galaxyCount: row.galaxyCount,
    };
    return GameEngine.boot(clock, universe, true);
  }

  /** Charge l'univers s'il existe, sinon le crée — comportement dev/tests. */
  static async loadOrBootstrap(): Promise<GameEngine> {
    return (await new GameRepository().find())
      ? GameEngine.load()
      : GameEngine.bootstrapNewUniverse();
  }

  /** Séquence de chargement commune (l'ordre des étapes est un contrat implicite). */
  private static async boot(clock: Clock, universe: Universe, isNew: boolean): Promise<GameEngine> {
    const engine = new GameEngine(clock, universe);
    await engine.ensureDefaultPlayer();
    await engine.loadPlayers();
    await engine.loadRelations();
    await engine.loadProposals();
    await engine.loadObjectives();
    await engine.loadWorldEvents();
    if (isNew) {
      engine.createHomeColony();
    } else {
      await engine.loadColonies();
      await engine.loadTransfers();
      await engine.loadMissions();
      await engine.loadMarkets();
      await engine.loadRoutes();
      await engine.loadOutposts();
      await engine.loadGateways();
      await engine.loadContracts();
      await engine.loadFactionStates();
      await engine.loadFleets();
      await engine.loadPirates();
      await engine.loadBattles();
    }
    // Plans de vaisseaux (chantier 13) : chargés puis amorcés pour tout empire qui n'en a
    // aucun (partie neuve, ou empire d'avant le chantier 13).
    await engine.loadBlueprints();
    engine.seedStarterBlueprintsForAll();
    // Équipement des galaxies (idempotent) : couvre aussi bien la partie neuve que les
    // galaxies apparues par extension.
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

  /** Marchés des seules stations situées dans des systèmes explorés. */
  get markets(): StationMarket[] {
    return marketsForEmpire(this.runtime, this.defaultEmpire);
  }

  planet(planetId: string): Planet | undefined {
    return this.planetsById.get(planetId);
  }

  onChange(listener: StateListener): () => void {
    return this.notifier.onChange(listener);
  }

  /** Remplace le logger console par défaut — appelé une fois au boot avec le logger Fastify. */
  setLogger(logger: Logger): void {
    this.logger = logger;
  }

  start(): void {
    this.scheduler.start();
  }

  stop(): void {
    this.scheduler.stop();
  }

  // ── Conception de vaisseaux (chantier 13) ────────────────────────────────

  private async loadBlueprints(): Promise<void> {
    await this.industry.loadBlueprints();
  }

  /** Amorce un empire sans plan avec les designs de départ (presets constructibles). */
  private seedStarterBlueprints(empire: Empire): void {
    this.industry.seedStarterBlueprints(empire);
  }

  private seedStarterBlueprintsForAll(): void {
    this.industry.seedStarterBlueprintsForAll();
  }

  private async loadRoutes(): Promise<void> {
    await this.logistics.loadRoutes();
  }

  private async loadOutposts(): Promise<void> {
    await this.logistics.loadOutposts();
  }

  // ─────────────────────────── Flottes & combat ───────────────────────────

  // ─────────────────────────── Diplomatie (chantier 16) ───────────────────────────

  /** Deux empires sont-ils en guerre ? */
  private atWar(a: string, b: string): boolean {
    return this.diplomacy.atWar(a, b);
  }

  private async loadRelations(): Promise<void> {
    await this.diplomacy.loadRelations();
  }

  private async loadProposals(): Promise<void> {
    await this.diplomacy.loadProposals();
  }

  // ─────────────────────────── Objectifs éphémères (chantier 17) ───────────────────────────

  private async loadObjectives(): Promise<void> {
    await this.objective.loadObjectives();
  }

  // ─────────────────────────── Événements de monde (chantier 17) ───────────────────────────

  private async loadWorldEvents(): Promise<void> {
    await this.diplomacy.loadWorldEvents();
  }

  /** Kinds d'événements de monde actifs sur une galaxie (bonus/malus de prix, spawn pirate). */
  private worldEventKindsOnGalaxy(galaxyId: string): WorldEventKind[] {
    return this.diplomacy.worldEventKindsOnGalaxy(galaxyId);
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

  private persistFleet(fleet: Fleet, insert = false): void {
    this.fleetService.persistFleet(fleet, insert);
  }

  private persistLair(lair: PirateLair, insert = false): void {
    this.fleetService.persistLair(lair, insert);
  }

  private async loadFleets(): Promise<void> {
    await this.fleetService.loadFleets();
  }

  private async loadPirates(): Promise<void> {
    await this.fleetService.loadPirates();
  }

  private async loadBattles(): Promise<void> {
    await this.fleetService.loadBattles();
  }

  /**
   * Ouvre un chantier de portail pour chaque galaxie lointaine qui n'en a pas encore.
   * Idempotent : rejoué après chaque extension de l'univers (chantier 9).
   */
  private initGateways(): void {
    this.gateway.initGateways();
  }

  /** Dote chaque faction d'un état (chantier 15). Idempotent : rejoué sans jamais dédoubler. */
  private initFactionStates(): void {
    this.diplomacy.initFactionStates();
  }

  private async loadFactionStates(): Promise<void> {
    await this.diplomacy.loadFactionStates();
  }

  private persistFactionState(state: FactionState): void {
    this.diplomacy.persistFactionState(state);
  }

  private persistRelation(relation: Relation): void {
    this.diplomacy.persistRelation(relation);
  }

  private persistObjective(objective: Objective): void {
    this.objective.persistObjective(objective);
  }

  // ── Extension de l'univers (chantier 9) ────────────────────────────────

  /** Maintient la frontière glissante : toujours des galaxies vierges devant les joueurs. */
  ensureFrontier(): void {
    this.exploration.ensureFrontier();
  }

  private async loadGateways(): Promise<void> {
    await this.gateway.loadGateways();
  }

  private async loadContracts(): Promise<void> {
    await this.contract.loadContracts();
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
      this.gateway.persistGateway(this.gatewayMap.get(id)!);
    }
    // Contrats : partagés comme les portails — l'échéance suit le même décalage.
    for (const [id, contract] of this.contractMap) {
      if (contract.status !== "open") continue;
      const next: Contract = { ...contract, deadline: contract.deadline - delta };
      this.contractMap.set(id, next);
      this.contract.persistContract(next);
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
      this.diplomacy.persistWorldEvent(next);
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
      this.logistics.persistTransferTimes(transfer);
    }
    for (const mission of this.missionMap.values()) {
      this.logistics.persistMissionTimes(mission);
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
    this.gateway.persistGateway(next);
    this.notify();
  }

  /** Outil de dev uniquement : force l'humeur d'une faction (chantier 15). */
  devSetFactionMood(
    factionId: string,
    mood: FactionState["mood"],
    durationMs = FACTION_MOOD_DURATION_MS,
  ): boolean {
    return this.diplomacy.devSetFactionMood(factionId, mood, durationMs, (fid) =>
      this.market.factionPostShortageContract(fid, createRng(`dev-shortage-${fid}-${Date.now()}`)),
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
   * Amorce quelques empires PNJ si le monde n'en a encore aucun (chantier 14) : le
   * monde n'est plus vide au premier tick, l'IA économique (`npcTick`) les fait vivre
   * ensuite. Public et idempotent (compte les PNJ déjà présents plutôt que de dépendre
   * d'un flag « partie neuve ») : le serveur peut l'appeler à chaque boot sans jamais
   * doubler la population, y compris pour une partie créée avant ce chantier. Distinct
   * de `load()` à dessein — les tests qui n'en ont pas besoin restent à un seul empire.
   */
  ensureNpcPopulation(count?: number): void {
    this.bootstrap.ensureNpcPopulation(count);
  }

  /**
   * Empire piloté par un compte (chantier 8). null si le compte n'a pas encore d'empire
   * dans cette partie — l'inscription en crée un via `createEmpireForAccount`.
   */
  empireForAccount(accountId: string): Empire | null {
    return this.bootstrap.empireForAccount(accountId);
  }

  /**
   * Rattache un empire à un compte fraîchement inscrit. Le premier compte **adopte**
   * l'empire amorcé au boot (sa colonie mère et son brouillard) plutôt que d'en créer un
   * second, qui laisserait un empire fantôme sur la meilleure planète. Les suivants
   * obtiennent un empire neuf. null si l'univers n'a plus de planète d'accueil.
   */
  createEmpireForAccount(accountId: string, name?: string): Empire | null {
    return this.bootstrap.createEmpireForAccount(accountId, name);
  }

  /** Empire par son id (outils de dev). */
  empireById(id: string): Empire | null {
    return this.bootstrap.empireById(id);
  }

  /** Empire par défaut (outils de dev uniquement : `/dev/armfleet` sans `empireId`). */
  get defaultEmpireForDev(): Empire {
    return this.defaultEmpire;
  }

  /** Outil de dev uniquement : instancie un empire supplémentaire. Retourne son id. */
  devSpawnEmpire(name?: string): string | null {
    return this.bootstrap.devSpawnEmpire(name);
  }

  /** Outil de dev uniquement : instancie un empire PNJ (chantier 14). Retourne son id. */
  devSpawnNpcEmpire(name?: string): string | null {
    return this.bootstrap.devSpawnNpcEmpire(name);
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
    return this.bootstrap.devEmpireSummaries();
  }

  /** Outil de dev uniquement : injecte des ressources pour tester sans attendre. */
  devGrant(resources: Partial<Record<ResourceId, number>>): void {
    this.bootstrap.devGrant(resources);
  }

  /**
   * Dote de stocks les stations qui n'en ont pas encore. Appelé à la création d'une
   * partie et après chaque extension de l'univers (les galaxies neuves arrivent avec
   * leurs comptoirs) — d'où l'idempotence.
   */
  private initMarkets(): void {
    this.market.initMarkets();
  }

  private async loadMarkets(): Promise<void> {
    await this.market.loadMarkets();
  }

  private markExplored(empire: Empire, systemId: string): void {
    this.exploration.markExplored(empire, systemId);
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
  private async ensureDefaultPlayer(): Promise<void> {
    await this.bootstrap.ensureDefaultPlayer();
  }

  /**
   * Instancie un `Empire` par ligne `players` (Phase A du chantier 7c). Chaque empire
   * charge son état autoritaire (recherche, influence, réputation, brouillard, effets)
   * et ses claims (par `ownerId`). `defaultEmpire` = premier player (ordre d'insertion),
   * fallback de compatibilité tant que l'identité de connexion (7c-B) n'existe pas.
   */
  private async loadPlayers(): Promise<void> {
    await this.bootstrap.loadPlayers();
  }

  /** Empire propriétaire d'une colonie (pour router les entités dérivées au chargement). */
  private empireOfColony(colonyId: string): Empire {
    return this.bootstrap.empireOfColony(colonyId);
  }

  private createHomeColony(): void {
    this.bootstrap.createHomeColony();
  }

  private insertColony(empire: Empire, colony: Colony): void {
    this.bootstrap.insertColony(empire, colony);
  }

  private async loadColonies(): Promise<void> {
    await this.bootstrap.loadColonies();
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

  private persistResearch(empire: Empire): void {
    this.industry.persistResearch(empire);
  }

  private async loadTransfers(): Promise<void> {
    await this.logistics.loadTransfers();
  }

  private async loadMissions(): Promise<void> {
    await this.logistics.loadMissions();
  }

  notify(): void {
    this.notifier.notify();
  }
}
