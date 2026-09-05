import {
  type ClientUniverse,
  FACTION_MOOD_DURATION_MS,
  FRONTIER_GALAXIES,
  generateGalaxyAt,
  generateUniverse,
  INITIAL_GALAXIES,
  MAX_CATCHUP_TICKS,
  MAX_GALAXIES,
  WORLD_EVENT_DURATION_MS,
  TICK_MS,
  type AsteroidBelt,
  type Colony,
  type Contract,
  type EmpireEffects,
  type FactionState,
  type GameState,
  type Gateway,
  type MiningOutpost,
  type ResourceId,
  type RelationProposal,
  type Stocks,
  type TradingPost,
  type Universe,
  type WorldEventKind,
} from "@spacesim/shared";
import type { EmpireSnapshot } from "@spacesim/protocol";
import { randomUUID } from "node:crypto";
import { Empire, type Clock } from "./empire.js";
import { bootEngine } from "./runtime/boot.js";
import {
  ensureContentSeeded,
  loadContentBundle,
} from "./runtime/content/content-service.js";
import type { ContentBundle } from "./runtime/content/content-types.js";
import { composeEngine } from "./runtime/composition.js";
import { GameRuntime } from "./runtime/game-runtime.js";
import { consoleLogger, type Logger } from "./runtime/logger.js";
import type { BootstrapService } from "./runtime/services/bootstrap-service.js";
import type { ContractService } from "./runtime/services/contract-service.js";
import type { DevService } from "./runtime/services/dev-service.js";
import type { DiplomacyService } from "./runtime/services/diplomacy-service.js";
import type { ExplorationService } from "./runtime/services/exploration-service.js";
import type { FleetService } from "./runtime/services/fleet-service.js";
import type { GatewayService } from "./runtime/services/gateway-service.js";
import type { IndustryService } from "./runtime/services/industry-service.js";
import type { LogisticsService } from "./runtime/services/logistics-service.js";
import type { MarketService } from "./runtime/services/market-service.js";
import type { CommunicationService } from "./runtime/services/communication-service.js";
import type { CorporationService } from "./runtime/services/corporation-service.js";
import type { OrderBookService } from "./runtime/services/order-book-service.js";
import type { InboxService } from "./runtime/services/inbox-service.js";
import type { ObjectiveService } from "./runtime/services/objective-service.js";
import type { StationService } from "./runtime/services/station-service.js";
import { Persister } from "./runtime/persistence/persister.js";
import { GameRepository } from "./runtime/repositories/game-repository.js";
import { Notifier, type StateListener } from "./runtime/notifier.js";
import { Scheduler } from "./runtime/scheduler.js";
import type { TickRunner } from "./runtime/tick-runner.js";
import {
  appendGalaxies,
  loadUniverse,
  materializedGalaxyCount,
  withParentIndexes,
} from "./runtime/universe-store.js";
import {
  clientUniverseForEmpire,
  snapshotForEmpire as projectSnapshotForEmpire,
} from "./runtime/projections.js";

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
  /** Marché de comptoir (joueur + PNJ), prix régionaux, réputation/embargo, humeur de faction. */
  readonly market: MarketService;
  /** Sondes, colonisation, revendications de systèmes, croissance de l'univers (chantier 9). */
  readonly exploration: ExplorationService;
  /** Flottes, combat (repaire/PvP), production/déplacement et repaires pirates PNJ. */
  readonly fleetService: FleetService;
  /** Diplomatie, événements de monde et humeur de faction. */
  readonly diplomacy: DiplomacyService;
  /** Objectifs éphémères personnels (chantier 17), domaine isolé. */
  readonly objective: ObjectiveService;
  /** Boîte de réception d'empire (chantier 32) : journal durable des faits notables. */
  readonly inbox: InboxService;
  /** Corporations (chantier 32) : appartenance, rôles, coffre commun. */
  readonly corporation: CorporationService;
  /** Canaux de discussion et courrier (chantier 32), silence compris. */
  readonly communication: CommunicationService;
  /** Carnet d'ordres des stations de joueur (chantier 32) et avoirs déposés. */
  readonly orderBook: OrderBookService;
  /** Stations orbitales (chantier 24) : zones, installations, tick de production. */
  readonly station: StationService;
  /** Bootstrap des empires (compte joueur, PNJ, colonie mère) et outils de dev associés. */
  readonly bootstrap: BootstrapService;
  /** Outils de dev (chantier 19.11) : jamais en production, voir `http/routes/dev.ts`. */
  readonly devService: DevService;
  /** Injecté depuis le boot (`setLogger`) ; console brute par défaut (tests, scripts). */
  private logger: Logger = consoleLogger;
  private readonly notifier: Notifier;
  private readonly scheduler: Scheduler;
  /**
   * Flushe le `WriteSet` du runtime en transaction (chantier 20.2 — write-behind).
   * Sérialisé en interne, jamais rejeté : `flush()` s'appelle en fire-and-forget aux
   * frontières commande WS / lot de ticks.
   */
  private readonly persister: Persister;

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
  private get tradingPostsById(): Map<string, TradingPost> {
    return this.runtime.tradingPostsById;
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
  private get proposalMap(): Map<string, RelationProposal> {
    return this.runtime.proposalMap;
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
  private get outpostMap(): Map<string, MiningOutpost> {
    return this.defaultEmpire.outpostMap;
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
    this.persister = new Persister(
      this.runtime.writeSet,
      logger,
      () => this.runtime.universeWrite,
    );
    const composed = composeEngine(
      this.runtime,
      logger,
      () => this.notify(),
      this.persister,
    );
    this.industry = composed.industry;
    this.logistics = composed.logistics;
    this.gateway = composed.gateway;
    this.contract = composed.contract;
    this.market = composed.market;
    this.exploration = composed.exploration;
    this.fleetService = composed.fleetService;
    this.diplomacy = composed.diplomacy;
    this.objective = composed.objective;
    this.inbox = composed.inbox;
    this.corporation = composed.corporation;
    this.communication = composed.communication;
    this.orderBook = composed.orderBook;
    this.station = composed.station;
    this.bootstrap = composed.bootstrap;
    this.devService = composed.devService;
    this.tickRunner = composed.tickRunner;
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
      throw new Error(
        "Aucun univers en base — utiliser GameEngine.bootstrapNewUniverse()",
      );
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
    const done = await materializedGalaxyCount(clock.id);
    if (done < clock.galaxyCount) {
      const existing = (await loadUniverse(clock.id, clock.seed)) ?? {
        seed: clock.seed,
        galaxies: [],
      };
      const missing: Universe["galaxies"] = [];
      for (let i = done; i < clock.galaxyCount; i++)
        missing.push(generateGalaxyAt(clock.seed, i));
      const stamped = withParentIndexes({
        seed: clock.seed,
        galaxies: [...existing.galaxies, ...missing],
      });
      await appendGalaxies(
        clock.id,
        stamped.galaxies.slice(done),
        clock.galaxyCount,
      );
      console.log(
        `[game] rattrapage one-shot : ${clock.galaxyCount - done} galaxie(s) matérialisée(s) depuis la seed`,
      );
    } else if (done > clock.galaxyCount) {
      // Les tables font autorité : le compteur se réaligne sur elles.
      await appendGalaxies(clock.id, [], done);
      clock.galaxyCount = done;
      console.warn(
        `[game] games.galaxyCount réaligné sur les tables univers (${done})`,
      );
    }

    const universe = await loadUniverse(clock.id, clock.seed);
    if (!universe) {
      throw new Error(
        "Univers introuvable en base malgré une ligne games — base corrompue ?",
      );
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
      throw new Error(
        "Un univers existe déjà en base — utiliser GameEngine.load()",
      );
    }
    const row = {
      id: randomUUID(),
      seed: randomUUID().slice(0, 8),
      tick: 0,
      lastTickAt: Date.now(),
      createdAt: Date.now(),
      galaxyCount: INITIAL_GALAXIES,
    };
    await gameRepo.insert(row);
    const universe = withParentIndexes(
      generateUniverse(row.seed, INITIAL_GALAXIES),
    );
    await appendGalaxies(row.id, universe.galaxies, INITIAL_GALAXIES);
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

  /**
   * Séquence de chargement commune (l'ordre des étapes est un contrat implicite,
   * voir `runtime/boot.ts`). Le constructeur restant privé (geste explicite via
   * `load`/`bootstrapNewUniverse`), cette méthode reste le seul point qui construit
   * l'instance avant de lui déléguer la séquence.
   */
  private static async boot(
    clock: Clock,
    universe: Universe,
    isNew: boolean,
  ): Promise<GameEngine> {
    const engine = new GameEngine(clock, universe);
    await bootEngine(engine, isNew);
    return engine;
  }

  // Accesseur public (message `hello` d'index.ts) : vue de l'empire par défaut.
  get game(): GameState {
    return this.defaultEmpire.toGameState(this.clock);
  }

  // Les collections par-empire (colonies, transferts, missions, brouillard, routes,
  // avant-postes, flottes) n'ont plus d'accesseur ici : elles dupliquaient ce que
  // l'`Empire` retourné par `empireForAccount`/`createEmpireForAccount` expose déjà
  // (`colonyMap`, `explored`, etc. — voir empire.ts). `pirateLairs`, `battles`,
  // `markets`, `clientUniverse` et `planet()` ont été retirés sans remplacement : plus
  // aucun appelant (dev tools, routes, tests) ne les utilisait.
  //
  // `gateways`, `contracts` et `factionStates` restent : ce sont des collections
  // PARTAGÉES (`GameRuntime`, pas de fog par empire), donc elles ne dupliquent rien
  // côté `Empire` — chantier 19.7.
  get gateways(): Gateway[] {
    return [...this.gatewayMap.values()];
  }

  get contracts(): Contract[] {
    return [...this.contractMap.values()];
  }

  get factionStates(): FactionState[] {
    return [...this.factionStateMap.values()];
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

  // ─────────────────────────── Flottes & combat ───────────────────────────

  // ─────────────────────────── Diplomatie (chantier 16) ───────────────────────────

  // ─────────────────────────── Objectifs éphémères (chantier 17) ───────────────────────────

  // ─────────────────────────── Événements de monde (chantier 17) ───────────────────────────

  /** Action joueur : attaquer une flotte ennemie stationnée dans le même système (PvP). */
  attackFleet(
    empire: Empire,
    fleetId: string,
    targetFleetId: string,
  ): string | null {
    return this.fleetService.attackFleet(empire, fleetId, targetFleetId);
  }

  /**
   * Action joueur : attaquer une colonie ennemie (PvP — raid). La flotte ennemie la
   * plus puissante stationnée sur zone défend d'abord ; si l'attaquant l'emporte (ou
   * qu'il n'y a pas de défenseur), il pille une fraction des ressources et rompt le
   * claim ennemi sur le système. Pas de capture de colonie à ce stade.
   */
  attackColony(
    empire: Empire,
    fleetId: string,
    targetColonyId: string,
  ): string | null {
    return this.fleetService.attackColony(empire, fleetId, targetColonyId);
  }

  // ── Extension de l'univers (chantier 9) ────────────────────────────────

  /** Maintient la frontière glissante : toujours des galaxies vierges devant les joueurs. */
  ensureFrontier(): void {
    this.exploration.ensureFrontier();
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
    // Chaque service décale les timers de son propre domaine (chantier 19.8).
    this.industry.shiftTime(this.defaultEmpire, delta);
    this.logistics.shiftTime(this.defaultEmpire, delta);
    this.gateway.shiftTime(delta);
    this.contract.shiftTime(delta);
    this.diplomacy.shiftTime(delta);
    this.objective.shiftTime(delta);
    this.fleetService.shiftTime(this.defaultEmpire, delta);
    this.station.shiftTime(this.defaultEmpire, delta);
    this.persistResearch(this.defaultEmpire);

    const missed = Math.floor((Date.now() - this.clock.lastTickAt) / TICK_MS);
    if (missed > 0) this.advance(Math.min(missed, MAX_CATCHUP_TICKS));
    this.logger.info(`[game] fast-forward de ${seconds}s (${missed} ticks)`);
  }

  /**
   * Outil de dev uniquement : finance presque tout un portail (il reste `leave`
   * métaux à livrer) pour tester la dernière contribution et l'activation.
   */
  devFundGateway(galaxyId: string, leave = 50): void {
    this.devService.devFundGateway(galaxyId, leave);
  }

  /** Outil de dev uniquement : force l'humeur d'une faction (chantier 15). */
  devSetFactionMood(
    factionId: string,
    mood: FactionState["mood"],
    durationMs = FACTION_MOOD_DURATION_MS,
  ): boolean {
    return this.devService.devSetFactionMood(factionId, mood, durationMs);
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
    return this.devService.devTriggerWorldEvent(kind, target, durationMs);
  }

  /** Outil de dev uniquement : fait apparaître un repaire pirate dans un système. */
  devSpawnPirate(systemId: string, threat = 2): void {
    this.devService.devSpawnPirate(systemId, threat);
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
   * Applique un silence à l'empire d'un compte (chantier 32.16). Appelé à l'ouverture
   * d'une connexion et après une décision de modération, pour qu'elle prenne effet
   * immédiatement sur un joueur déjà connecté.
   *
   * `Number.POSITIVE_INFINITY` encode le silence sans terme : la comparaison à l'envoi
   * reste un simple `>` sur une date, sans cas particulier.
   */
  setMuted(accountId: string, until: number | null): void {
    const empire = this.bootstrap.empireForAccount(accountId);
    if (empire) empire.mutedUntil = until;
  }

  /** Résumé d'empire par compte (admin, chantier 23.3) — même forme que `devEmpireSummaries()`,
   *  scopée à un seul empire. null si le compte n'a pas encore d'empire dans cette partie. */
  empireSummaryForAccount(accountId: string): unknown | null {
    return this.bootstrap.empireSummaryForAccount(accountId);
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
    return this.devService.empireById(id);
  }

  /** Empire par défaut (outils de dev uniquement : `/dev/armfleet` sans `empireId`). */
  get defaultEmpireForDev(): Empire {
    return this.devService.defaultEmpireForDev;
  }

  /** Outil de dev uniquement : instancie un empire supplémentaire. Retourne son id. */
  devSpawnEmpire(name?: string): string | null {
    return this.devService.devSpawnEmpire(name);
  }

  /** Outil de dev uniquement : instancie un empire PNJ (chantier 14). Retourne son id. */
  devSpawnNpcEmpire(name?: string): string | null {
    return this.devService.devSpawnNpcEmpire(name);
  }

  /** Outil de dev uniquement : arme une flotte d'un empire dans un système (tests PvP). */
  devArmFleet(
    empire: Empire,
    systemId: string,
    ships: Partial<Record<string, number>>,
  ): string {
    return this.devService.devArmFleet(empire, systemId, ships);
  }

  /** Snapshot (forme externe WS) redacté au brouillard d'un empire (chantier 7c-B). */
  snapshotForEmpire(empire: Empire): EmpireSnapshot {
    return projectSnapshotForEmpire(
      this.runtime,
      empire,
      (stationId) => this.station.resolveVenueAccess(empire, stationId).ok,
    );
  }

  /**
   * Rapatrie les crédits d'un avoir de station vers une colonie (chantier 32.25). Vit sur
   * la façade et non dans `OrderBookService` : le crédit atterrit dans une COLONIE, dont
   * la persistance appartient au domaine industrie.
   */
  claimHoldingCredits(
    empire: Empire,
    stationId: string,
    colonyId: string,
  ): string | null {
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    const amount = this.orderBook.claimHoldingCredits(empire, stationId);
    if (amount <= 0) return "Aucun crédit à rapatrier";
    empire.colonyMap.set(colony.id, {
      ...colony,
      resources: {
        ...colony.resources,
        credits: colony.resources.credits + amount,
      },
    });
    this.industry.persistColony(empire.colonyMap.get(colony.id)!);
    return null;
  }

  /** Univers redacté au brouillard d'un empire — payload initial du message `hello`. */
  clientUniverseForEmpire(empire: Empire): ClientUniverse {
    return clientUniverseForEmpire(this.runtime, empire);
  }

  /** Outil de dev uniquement : résumé par empire (état en mémoire) pour l'observation. */
  devEmpireSummaries(): unknown {
    return this.devService.devEmpireSummaries();
  }

  /** Outil de dev uniquement : injecte des ressources pour tester sans attendre. */
  devGrant(resources: Partial<Record<ResourceId, number>>): void {
    this.devService.devGrant(resources);
  }

  persistColony(colony: Colony): void {
    this.industry.persistColony(colony);
  }

  /** Rejoue le temps hors-ligne (borné) — dernière étape de `runtime/boot.ts`. */
  catchUp(): void {
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

  notify(): void {
    this.notifier.notify();
  }

  /** Contenu de jeu chargé (chantier 23.5+) — lu par les routes admin, injecté par les
   *  services (`FleetService`/`DiplomacyService` détiennent déjà `runtime`). */
  get content(): ContentBundle {
    return this.runtime.content;
  }

  /**
   * (Ré)amorce si nécessaire puis charge tout le contenu depuis la DB dans `runtime.content`
   * — remplacement en bloc (édition en live, chantier 23 décision 3). Appelé une fois au
   * boot (`runtime/boot.ts`) puis après chaque écriture admin sur `/api/admin/content/*`.
   */
  async loadContent(): Promise<void> {
    await ensureContentSeeded();
    this.runtime.content = await loadContentBundle();
  }

  /**
   * Flushe le `WriteSet` en base (chantier 20.2). Fire-and-forget côté appelant (la RAM
   * fait déjà autorité) — appelé après chaque commande WS (`http/routes/ws.ts`) ; le
   * `TickRunner` le fait aussi à la fin de chaque lot de ticks. Renvoie la promesse pour
   * les tests qui veulent attendre l'écriture réelle avant d'asserter sur la DB.
   */
  flush(): Promise<void> {
    return this.persister.flush();
  }

  /**
   * Santé du moteur pour le tableau de bord admin (chantier 23.12) : `tick`/`lastTickAt`
   * (horloge), `lastFlushAt`/`lastFlushError` (déjà publics sur `Persister`, jamais
   * exposés en HTTP avant ce chantier), et la jauge de croissance de l'univers
   * (`galaxyCount` vs `MAX_GALAXIES`/`FRONTIER_GALAXIES`).
   */
  opsHealth(): {
    tick: number;
    lastTickAt: number;
    lastFlushAt: number | null;
    lastFlushError: string | null;
    galaxyCount: number;
    maxGalaxies: number;
    frontierGalaxies: number;
  } {
    return {
      tick: this.runtime.clock.tick,
      lastTickAt: this.runtime.clock.lastTickAt,
      lastFlushAt: this.persister.lastFlushAt,
      lastFlushError: this.persister.lastFlushError,
      galaxyCount: this.runtime.clock.galaxyCount,
      maxGalaxies: MAX_GALAXIES,
      frontierGalaxies: FRONTIER_GALAXIES,
    };
  }
}
