import {
  allBelts,
  allPlanets,
  allStations,
  allSystems,
  applyColonyTick,
  beltRichness,
  canResearch,
  CLAIM_COST,
  CLAIM_PRODUCTION_BONUS,
  COLONY_SHIP_COST,
  colonizeInfluenceCost,
  colonyShipDurationMs,
  computeEffects,
  createRng,
  ECONOMY_TICK_TICKS,
  emptyResources,
  enqueueBuilding,
  enqueueShip,
  FACTIONS,
  fleetCapacity,
  fleetIsEmpty,
  GATEWAY_BUILD_MS,
  GATEWAY_COST,
  gatewayCovered,
  gatewayLinks,
  gatewayRemaining,
  generateUniverse,
  idleShips,
  influencePerTick,
  jumpDistanceInUniverse,
  MARKET_RESOURCES,
  marketTick,
  initialStocks,
  MAX_CATCHUP_TICKS,
  NEW_COLONY_POPULATION,
  NEW_COLONY_RESOURCES,
  OUTPOST_COST,
  OUTPOST_UPKEEP_CREDITS,
  outpostTick,
  PIRATE_SPAWN_CHANCE,
  PIRATE_TAX_PER_TICK,
  pirateBounty,
  pirateComposition,
  pirateDirectives,
  pickShip,
  randInt,
  PROBE_COST_CREDITS,
  probeDurationMs,
  redactUniverse,
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
  storageCap,
  WARSHIPS,
  TICK_MS,
  transferCostCredits,
  transferDurationMs,
  TECHS,
  type AsteroidBelt,
  type BuildingId,
  type Colony,
  type EmpireEffects,
  type CombatPhase,
  type FactionId,
  type Fleet,
  type FleetComposition,
  type GameState,
  type Gateway,
  type PirateLair,
  type StoredBattle,
  type WarshipId,
  type MarketResource,
  type MiningOutpost,
  type Mission,
  type Planet,
  type ResourceId,
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
import { Empire } from "./empire.js";

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

export type StateListener = (snapshot: EngineSnapshot) => void;

/**
 * Détient l'état de la partie et fait avancer la simulation.
 * Serveur autoritaire : le client ne fait qu'afficher.
 */
export class GameEngine {
  readonly universe: Universe;
  private state: GameState;
  private explored = new Set<string>();
  private explorationDirty = false;
  private effects: EmpireEffects = computeEffects([]);
  private planetsById: Map<string, Planet>;
  private stationsById: Map<string, TradeStation>;
  private marketMap = new Map<string, Stocks>();
  private gatewayMap = new Map<string, Gateway>();
  private lairMap = new Map<string, PirateLair>();
  private battleLog: StoredBattle[] = [];
  private beltsById: Map<string, AsteroidBelt>;
  private listeners = new Set<StateListener>();
  private interval: NodeJS.Timeout | null = null;
  /** Empires partageant cet univers (chantier 7b). Un seul instancié à ce stade. */
  private empires = new Map<string, Empire>();
  /** Empire propriétaire par défaut (solo). Posé par `ensureDefaultPlayer`. */
  private defaultEmpire!: Empire;

  // Maps d'entités portées par l'empire par défaut (délégation le temps du mono-empire).
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

  private constructor(state: GameState) {
    this.state = state;
    this.universe = generateUniverse(state.seed);
    this.planetsById = new Map(allPlanets(this.universe).map((p) => [p.id, p]));
    this.stationsById = new Map(allStations(this.universe).map((s) => [s.id, s]));
    this.beltsById = new Map(allBelts(this.universe).map((b) => [b.id, b]));
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
        explored: "[]",
        researched: "[]",
        research: null,
        influence: 0,
        factionRep: "{}",
        createdAt: Date.now(),
      };
      db.insert(schema.games).values(row).run();
    }
    const claimRows = db.select().from(schema.claims).all();
    const engine = new GameEngine({
      id: row.id,
      seed: row.seed,
      tick: row.tick,
      lastTickAt: row.lastTickAt,
      researched: JSON.parse(row.researched),
      research: row.research ? JSON.parse(row.research) : null,
      influence: row.influence,
      factionRep: JSON.parse(row.factionRep),
      claimedSystemIds: claimRows.map((c) => c.systemId),
    });
    engine.explored = new Set(JSON.parse(row.explored));
    engine.ensureDefaultPlayer();
    engine.effects = computeEffects(engine.state.researched as TechId[]);
    if (isNew) {
      engine.createHomeColony();
      engine.initMarkets();
      engine.initGateways();
    } else {
      engine.loadColonies();
      engine.loadTransfers();
      engine.loadMissions();
      engine.loadMarkets();
      engine.loadRoutes();
      engine.loadOutposts();
      engine.loadGateways();
      engine.loadFleets();
      engine.loadPirates();
      engine.loadBattles();
    }
    engine.catchUp();
    return engine;
  }

  get game(): GameState {
    return this.state;
  }

  get colonies(): Colony[] {
    return [...this.colonyMap.values()];
  }

  get transfers(): Transfer[] {
    return [...this.transferMap.values()];
  }

  get missions(): Mission[] {
    return [...this.missionMap.values()];
  }

  get exploredSystemIds(): string[] {
    return [...this.explored];
  }

  /** Univers vu par le client : planètes masquées hors systèmes explorés. */
  get clientUniverse(): Universe {
    return redactUniverse(this.universe, this.explored);
  }

  get routes(): Route[] {
    return [...this.routeMap.values()];
  }

  get outposts(): MiningOutpost[] {
    return [...this.outpostMap.values()];
  }

  get gateways(): Gateway[] {
    return [...this.gatewayMap.values()];
  }

  get fleets(): Fleet[] {
    return [...this.fleetMap.values()];
  }

  /** Repaires dans les systèmes explorés uniquement (fog). */
  get pirateLairs(): PirateLair[] {
    return [...this.lairMap.values()].filter((l) => this.explored.has(l.systemId));
  }

  get battles(): StoredBattle[] {
    return this.battleLog;
  }

  /** Liaisons inter-galactiques des portails actifs. */
  private get portalLinks(): [string, string][] {
    return gatewayLinks(this.universe, this.gateways);
  }

  /** Marchés des seules stations situées dans des systèmes explorés. */
  get markets(): StationMarket[] {
    const markets: StationMarket[] = [];
    for (const [stationId, stocks] of this.marketMap) {
      const station = this.stationsById.get(stationId);
      if (station && this.explored.has(station.systemId)) {
        markets.push({ stationId, stocks });
      }
    }
    return markets;
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
      const missed = Math.floor((Date.now() - this.state.lastTickAt) / TICK_MS);
      if (missed > 0) this.advance(missed);
    }, TICK_MS);
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  /** Action joueur : lancer une construction. Retourne un message d'erreur ou null. */
  build(colonyId: string, buildingId: BuildingId): string | null {
    const colony = this.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    const planet = this.planetsById.get(colony.planetId);
    if (!planet) return "Planète inconnue";
    const result = enqueueBuilding(colony, planet, buildingId, Date.now(), this.effects);
    if (!result.ok) return result.reason;
    this.colonyMap.set(colonyId, result.colony);
    this.persistColony(result.colony);
    this.notify();
    return null;
  }

  /**
   * Réserve le plus gros cargo disponible de la colonie jusqu'à `busyUntil`.
   * Retourne null si aucun vaisseau libre.
   */
  private reserveShip(
    colony: Colony,
    busyUntil: number,
  ): { colony: Colony; shipId: ShipId; capacity: number } | null {
    const idle = idleShips(colony, this.routes);
    const shipId = pickShip(idle);
    if (!shipId) return null;
    return {
      colony: { ...colony, shipsBusy: [...colony.shipsBusy, { shipId, freeAt: busyUntil }] },
      shipId,
      capacity: SHIPS[shipId].capacity,
    };
  }

  /** Action joueur : envoyer un convoi cargo. Retourne un message d'erreur ou null. */
  sendTransfer(
    fromColonyId: string,
    toColonyId: string,
    wanted: Partial<Record<ResourceId, number>>,
  ): string | null {
    const from = this.colonyMap.get(fromColonyId);
    const to = this.colonyMap.get(toColonyId);
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
    const cost = transferCostCredits(jumps);

    const resources = { ...from.resources };
    if (resources.credits < cost) return `Crédits insuffisants (coût : ${cost})`;
    for (const [res, amount] of Object.entries(cargo) as [ResourceId, number][]) {
      if (resources[res] < amount) return `Stock insuffisant : ${res}`;
    }
    const now = Date.now();
    const duration = transferDurationMs(jumps) * this.effects.transferSpeedMult;
    const reserved = this.reserveShip(from, now + 2 * duration);
    if (!reserved) return "Aucun cargo disponible";
    const total = Object.values(cargo).reduce((s, n) => s + n, 0);
    if (total > reserved.capacity) {
      return `Cargaison trop lourde pour le ${reserved.shipId === "cargo_large" ? "grand cargo" : "cargo"} (${reserved.capacity} max)`;
    }

    resources.credits -= cost;
    for (const [res, amount] of Object.entries(cargo) as [ResourceId, number][]) {
      resources[res] -= amount;
    }

    const transfer: Transfer = {
      id: randomUUID(),
      fromColonyId,
      toColonyId,
      resources: cargo,
      departedAt: now,
      arrivesAt: now + duration,
    };
    this.colonyMap.set(from.id, { ...reserved.colony, resources });
    this.transferMap.set(transfer.id, transfer);
    this.persistColony(this.colonyMap.get(from.id)!);
    db.insert(schema.transfers)
      .values({
        id: transfer.id,
        gameId: this.state.id,
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
    colonyId: string,
    stationId: string,
    wanted: Partial<Record<ResourceId, number>>,
  ): string | null {
    const colony = this.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    const station = this.stationsById.get(stationId);
    if (!station) return "Station inconnue";
    if (!this.explored.has(station.systemId)) return "Station non découverte";

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

    const resources = { ...colony.resources };
    if (resources.credits < fee) return `Crédits insuffisants (frais : ${fee})`;
    for (const [res, amount] of Object.entries(cargo) as [ResourceId, number][]) {
      if (resources[res] < amount) return `Stock insuffisant : ${res}`;
    }

    const duration = transferDurationMs(jumps) * this.effects.transferSpeedMult;
    const reserved = this.reserveShip(colony, Date.now() + 2 * duration);
    if (!reserved) return "Aucun cargo disponible";
    const total = Object.values(cargo).reduce((s, n) => s + n, 0);
    if (total > reserved.capacity) {
      return `Cargaison trop lourde (soute : ${reserved.capacity})`;
    }

    resources.credits -= fee;
    for (const [res, amount] of Object.entries(cargo) as [ResourceId, number][]) {
      resources[res] -= amount;
    }
    this.colonyMap.set(colony.id, { ...reserved.colony, resources });
    this.persistColony(this.colonyMap.get(colony.id)!);
    this.insertMission("sell", colonyId, stationId, duration, { cargo });
    this.notify();
    return null;
  }

  /** Action joueur : acheter au spot (le convoi part avec un budget, revient chargé). */
  buyFromStation(
    colonyId: string,
    stationId: string,
    resource: ResourceId,
    budgetRaw: number,
  ): string | null {
    const colony = this.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    const station = this.stationsById.get(stationId);
    if (!station) return "Station inconnue";
    if (!this.explored.has(station.systemId)) return "Station non découverte";
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

    const duration = transferDurationMs(jumps) * this.effects.transferSpeedMult;
    const reserved = this.reserveShip(colony, Date.now() + 2 * duration);
    if (!reserved) return "Aucun cargo disponible";

    const resources = { ...colony.resources, credits: colony.resources.credits - budget - fee };
    this.colonyMap.set(colony.id, { ...reserved.colony, resources });
    this.persistColony(this.colonyMap.get(colony.id)!);
    // La capacité du cargo réservé borne l'achat à l'arrivée.
    this.insertMission("buy", colonyId, stationId, duration, {
      budget,
      buyResource: resource,
      capacity: reserved.capacity,
    });
    this.notify();
    return null;
  }

  /** Action joueur : produire un vaisseau au chantier naval. */
  buildShip(colonyId: string, shipId: ShipId): string | null {
    const colony = this.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    const result = enqueueShip(colony, shipId, Date.now(), this.state.researched as TechId[]);
    if (!result.ok) return result.reason;
    this.colonyMap.set(colonyId, result.colony);
    this.persistColony(result.colony);
    this.notify();
    return null;
  }

  /** Action joueur : fonder un avant-poste minier sur une ceinture. */
  buildOutpost(colonyId: string, beltId: string): string | null {
    const colony = this.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    const belt = this.beltsById.get(beltId);
    if (!belt) return "Ceinture inconnue";
    if (!this.explored.has(belt.systemId)) return "Système non exploré";
    if ([...this.outpostMap.values()].some((o) => o.beltId === beltId)) {
      return "Ceinture déjà exploitée";
    }
    if (
      [...this.missionMap.values()].some((m) => m.kind === "build_outpost" && m.targetId === beltId)
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
    this.colonyMap.set(colony.id, { ...colony, resources });
    this.persistColony(this.colonyMap.get(colony.id)!);
    this.insertMission(
      "build_outpost",
      colonyId,
      beltId,
      transferDurationMs(jumps) * this.effects.transferSpeedMult,
    );
    this.notify();
    return null;
  }

  /** Production des avant-postes + entretien payé par la colonie propriétaire. */
  private outpostsTick(): void {
    for (const [id, outpost] of this.outpostMap) {
      const belt = this.beltsById.get(outpost.beltId);
      if (!belt) continue;
      const owner = this.colonyMap.get(outpost.ownerColonyId);
      const upkeepPaid = !!owner && owner.resources.credits >= OUTPOST_UPKEEP_CREDITS;
      if (upkeepPaid && owner) {
        this.colonyMap.set(owner.id, {
          ...owner,
          resources: {
            ...owner.resources,
            credits: owner.resources.credits - OUTPOST_UPKEEP_CREDITS,
          },
        });
      }
      const oreStock = outpostTick(outpost.oreStock, beltRichness(belt), upkeepPaid);
      if (oreStock !== outpost.oreStock) {
        this.outpostMap.set(id, { ...outpost, oreStock });
      }
    }
  }

  /** Action joueur : créer une route logistique automatique. */
  createRoute(
    ownerColonyId: string,
    fromId: string,
    fromKind: "colony" | "outpost",
    toId: string,
    toKind: "colony" | "station",
    resource: ResourceId,
    rule: RouteRule,
    ships: Partial<Record<ShipId, number>>,
  ): string | null {
    const owner = this.colonyMap.get(ownerColonyId);
    if (!owner) return "Colonie propriétaire inconnue";

    let fromSystemId: string;
    if (fromKind === "colony") {
      const from = this.colonyMap.get(fromId);
      if (!from) return "Colonie source inconnue";
      fromSystemId = this.planetsById.get(from.planetId)?.systemId ?? "";
    } else {
      const outpost = this.outpostMap.get(fromId);
      if (!outpost) return "Avant-poste inconnu";
      if (resource !== "ore") return "Un avant-poste n'exporte que du minerai";
      fromSystemId = this.beltsById.get(outpost.beltId)?.systemId ?? "";
    }

    let toSystemId: string;
    if (toKind === "colony") {
      const to = this.colonyMap.get(toId);
      if (!to) return "Colonie destination inconnue";
      if (fromKind === "colony" && to.id === fromId) return "Origine et destination identiques";
      if (!(RESOURCES as readonly string[]).includes(resource)) return "Ressource inconnue";
      toSystemId = this.planetsById.get(to.planetId)?.systemId ?? "";
    } else {
      const station = this.stationsById.get(toId);
      if (!station) return "Station inconnue";
      if (!this.explored.has(station.systemId)) return "Station non découverte";
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
    const idle = idleShips(owner, this.routes);
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
    this.routeMap.set(route.id, route);
    db.insert(schema.routes)
      .values({
        id: route.id,
        gameId: this.state.id,
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
  setRoutePaused(routeId: string, paused: boolean): string | null {
    const route = this.routeMap.get(routeId);
    if (!route) return "Route inconnue";
    this.routeMap.set(routeId, { ...route, paused });
    this.persistRoute(this.routeMap.get(routeId)!);
    this.notify();
    return null;
  }

  /** Action joueur : supprimer une route au repos (les vaisseaux redeviennent libres). */
  deleteRoute(routeId: string): string | null {
    const route = this.routeMap.get(routeId);
    if (!route) return "Route inconnue";
    if (route.activeCycle) return "Cycle en cours : suspendez la route et attendez le retour";
    this.routeMap.delete(routeId);
    db.delete(schema.routes).where(eq(schema.routes.id, routeId)).run();
    this.notify();
    return null;
  }

  /** Ordonnanceur : départs et résolutions de cycles à l'instant `t`. */
  private processRoutes(t: number): void {
    for (const [id, route] of this.routeMap) {
      let current = route;

      // Livraison à l'arrivée (cargaison > 0), puis fin de cycle au retour.
      if (current.activeCycle) {
        const cycle = current.activeCycle;
        if (cycle.carrying > 0 && cycle.arrivesAt <= t) {
          this.deliverRouteCargo(current, cycle.carrying);
          current = { ...current, activeCycle: { ...cycle, carrying: 0 } };
        }
        if (current.activeCycle && current.activeCycle.backAt <= t) {
          current = { ...current, activeCycle: null };
        }
        if (current !== route) {
          this.routeMap.set(id, current);
          this.persistRoute(current);
        }
      }

      // Départ d'un nouveau cycle.
      if (current.activeCycle || current.paused) continue;
      const owner = this.colonyMap.get(current.ownerColonyId);
      if (!owner) continue;

      // Source : stock + système d'origine.
      let sourceStock: number;
      let fromSystemId: string | undefined;
      if (current.fromKind === "colony") {
        const from = this.colonyMap.get(current.fromId);
        if (!from) continue;
        sourceStock = from.resources[current.resource];
        fromSystemId = this.planetsById.get(from.planetId)?.systemId;
      } else {
        const outpost = this.outpostMap.get(current.fromId);
        if (!outpost) continue;
        sourceStock = outpost.oreStock;
        fromSystemId = this.beltsById.get(outpost.beltId)?.systemId;
      }
      if (!fromSystemId) continue;

      const toSystemId =
        current.toKind === "colony"
          ? this.planetsById.get(this.colonyMap.get(current.toId)?.planetId ?? "")?.systemId
          : this.stationsById.get(current.toId)?.systemId;
      if (!toSystemId) continue;
      const jumps = jumpDistanceInUniverse(this.universe, fromSystemId, toSystemId, this.portalLinks);
      if (jumps < 0) continue;

      const destStock =
        current.toKind === "colony"
          ? this.colonyMap.get(current.toId)?.resources[current.resource] ?? 0
          : 0;
      const qty = routeCargoQuantity(current.rule, sourceStock, destStock, fleetCapacity(current.ships));
      if (qty <= 0) continue;
      const fee = transferCostCredits(jumps);
      if (owner.resources.credits < fee) continue;

      // Frais payés par le propriétaire, cargaison retirée à la source.
      this.colonyMap.set(owner.id, {
        ...owner,
        resources: { ...owner.resources, credits: owner.resources.credits - fee },
      });
      if (current.fromKind === "colony") {
        const from = this.colonyMap.get(current.fromId)!;
        this.colonyMap.set(from.id, {
          ...from,
          resources: {
            ...from.resources,
            [current.resource]: from.resources[current.resource] - qty,
          },
        });
        this.persistColony(this.colonyMap.get(from.id)!);
      } else {
        const outpost = this.outpostMap.get(current.fromId)!;
        this.outpostMap.set(outpost.id, { ...outpost, oreStock: outpost.oreStock - qty });
      }
      this.persistColony(this.colonyMap.get(owner.id)!);

      const duration = transferDurationMs(jumps) * this.effects.transferSpeedMult;
      const next: Route = {
        ...current,
        activeCycle: { departedAt: t, arrivesAt: t + duration, backAt: t + 2 * duration, carrying: qty },
      };
      this.routeMap.set(id, next);
      this.persistRoute(next);
    }
  }

  /** Livre la cargaison d'un cycle : stock colonie ou vente au spot en station. */
  private deliverRouteCargo(route: Route, carrying: number): void {
    if (route.toKind === "colony") {
      const to = this.colonyMap.get(route.toId);
      if (!to) return;
      const resources = { ...to.resources };
      resources[route.resource] = Math.min(
        resources[route.resource] + carrying,
        storageCap(to, route.resource),
      );
      this.colonyMap.set(to.id, { ...to, resources });
      this.persistColony(this.colonyMap.get(to.id)!);
    } else {
      const stocks = this.marketMap.get(route.toId);
      const owner = this.colonyMap.get(route.ownerColonyId);
      if (!stocks || !owner) return;
      const result = resolveSale(stocks, { [route.resource]: carrying });
      this.marketMap.set(route.toId, result.stocks);
      this.persistMarket(route.toId);
      const revenue = Math.floor(result.revenue * (1 + this.stationRepBonus(route.toId)));
      this.addFactionRep(route.toId, result.revenue);
      const resources = { ...owner.resources, credits: owner.resources.credits + revenue };
      this.colonyMap.set(owner.id, { ...owner, resources });
      this.persistColony(this.colonyMap.get(owner.id)!);
    }
  }

  /** Réputation gagnée auprès de la faction de la station, au volume de crédits échangé. */
  private addFactionRep(stationId: string, creditsExchanged: number): void {
    const station = this.stationsById.get(stationId);
    if (!station || creditsExchanged <= 0) return;
    const factionRep = { ...this.state.factionRep };
    factionRep[station.factionId] =
      Math.round(((factionRep[station.factionId] ?? 0) + creditsExchanged * REP_PER_CREDIT) * 10) /
      10;
    this.state = { ...this.state, factionRep };
  }

  /** Remise commerciale liée à la réputation auprès de la faction de la station. */
  private stationRepBonus(stationId: string): number {
    const station = this.stationsById.get(stationId);
    if (!station) return 0;
    return repBonus(this.state.factionRep[station.factionId] ?? 0);
  }

  private loadRoutes(): void {
    for (const row of db.select().from(schema.routes).all()) {
      this.routeMap.set(row.id, {
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
      this.outpostMap.set(row.id, {
        id: row.id,
        beltId: row.beltId,
        ownerColonyId: row.ownerColonyId,
        oreStock: row.oreStock,
      });
    }
  }

  private persistOutposts(): void {
    for (const outpost of this.outpostMap.values()) {
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
  startResearch(techId: string): string | null {
    if (this.state.research) return "Une recherche est déjà en cours";
    const tech = TECHS[techId as TechId];
    if (!tech) return "Technologie inconnue";
    if (!canResearch(tech.id, this.state.researched as TechId[])) {
      return "Prérequis non satisfaits";
    }
    const totalScience = this.colonies.reduce((s, c) => s + c.resources.science, 0);
    if (totalScience < tech.cost) {
      return `Science insuffisante (${Math.floor(totalScience)}/${tech.cost})`;
    }

    // Paiement réparti : on ponctionne les colonies dans l'ordre jusqu'à couvrir le coût.
    let remaining = tech.cost;
    for (const colony of this.colonies) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, colony.resources.science);
      if (take <= 0) continue;
      remaining -= take;
      const updated = {
        ...colony,
        resources: { ...colony.resources, science: colony.resources.science - take },
      };
      this.colonyMap.set(colony.id, updated);
      this.persistColony(updated);
    }

    const now = Date.now();
    this.state = {
      ...this.state,
      research: { techId: tech.id, startedAt: now, finishesAt: now + tech.durationMs },
    };
    this.persistResearch();
    this.notify();
    return null;
  }

  private resolveResearch(t: number): void {
    const research = this.state.research;
    if (!research || research.finishesAt > t) return;
    this.state = {
      ...this.state,
      researched: [...this.state.researched, research.techId],
      research: null,
    };
    this.effects = computeEffects(this.state.researched as TechId[]);
    this.persistResearch();
    console.log(`[game] recherche terminée : ${research.techId}`);
  }

  private persistResearch(): void {
    db.update(schema.players)
      .set({
        researched: JSON.stringify(this.state.researched),
        research: this.state.research ? JSON.stringify(this.state.research) : null,
      })
      .where(eq(schema.players.id, this.defaultEmpire.id))
      .run();
  }

  /** Action joueur : envoyer une sonde révéler un système. */
  probe(colonyId: string, systemId: string): string | null {
    const colony = this.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    if (this.explored.has(systemId)) return "Système déjà exploré";
    const system = allSystems(this.universe).find((s) => s.id === systemId);
    if (!system) return "Système inconnu";
    if ([...this.missionMap.values()].some((m) => m.kind === "probe" && m.targetId === systemId)) {
      return "Une sonde est déjà en route";
    }
    const fromPlanet = this.planetsById.get(colony.planetId);
    if (!fromPlanet) return "Planète inconnue";
    const cost = Math.round(PROBE_COST_CREDITS * this.effects.probeCostMult);
    if (colony.resources.credits < cost) {
      return `Crédits insuffisants (coût : ${cost})`;
    }
    const jumps = jumpDistanceInUniverse(this.universe, fromPlanet.systemId, systemId, this.portalLinks);
    if (jumps < 0) return "Système inaccessible";

    const resources = { ...colony.resources, credits: colony.resources.credits - cost };
    this.colonyMap.set(colony.id, { ...colony, resources });
    this.persistColony(this.colonyMap.get(colony.id)!);
    this.insertMission(
      "probe",
      colonyId,
      systemId,
      probeDurationMs(jumps) * this.effects.probeSpeedMult,
    );
    this.notify();
    return null;
  }

  /** Action joueur : envoyer un vaisseau colonial fonder une colonie. */
  colonize(colonyId: string, planetId: string): string | null {
    const colony = this.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    const target = this.planetsById.get(planetId);
    if (!target) return "Planète inconnue";
    if (!this.explored.has(target.systemId)) return "Système non exploré";
    if (target.type === "gas") return "Impossible de coloniser une géante gazeuse";
    if ([...this.colonyMap.values()].some((c) => c.planetId === planetId)) {
      return "Planète déjà colonisée";
    }
    if (
      [...this.missionMap.values()].some((m) => m.kind === "colonize" && m.targetId === planetId)
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
    const pendingColonies = [...this.missionMap.values()].filter(
      (m) => m.kind === "colonize",
    ).length;
    const influenceCost = colonizeInfluenceCost(this.colonyMap.size + pendingColonies);
    if (this.state.influence < influenceCost) {
      return `Influence insuffisante (${Math.floor(this.state.influence)}/${influenceCost})`;
    }
    for (const [res, amount] of Object.entries(COLONY_SHIP_COST) as [ResourceId, number][]) {
      resources[res] -= amount;
    }
    this.state = { ...this.state, influence: this.state.influence - influenceCost };
    this.colonyMap.set(colony.id, { ...colony, resources });
    this.persistColony(this.colonyMap.get(colony.id)!);
    this.insertMission(
      "colonize",
      colonyId,
      planetId,
      colonyShipDurationMs(jumps) * this.effects.colonyShipSpeedMult,
    );
    this.notify();
    return null;
  }

  /** Action joueur : livrer des ressources au chantier de portail (tech requise). */
  contributeGateway(
    colonyId: string,
    galaxyId: string,
    wanted: Partial<Record<ResourceId, number>>,
  ): string | null {
    if (!this.state.researched.includes("gateway_engineering")) {
      return "Technologie « Ingénierie des portails » requise";
    }
    const colony = this.colonyMap.get(colonyId);
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
    const anchorId = this.universe.galaxies[0]!.anchorSystemId;
    const jumps = jumpDistanceInUniverse(this.universe, fromPlanet.systemId, anchorId, this.portalLinks);
    if (jumps < 0) return "Ancrage inaccessible";
    const fee = transferCostCredits(jumps);

    const resources = { ...colony.resources };
    if (resources.credits < fee + (cargo.credits ?? 0)) {
      return `Crédits insuffisants (cargaison + frais ${fee})`;
    }
    for (const [res, amount] of Object.entries(cargo) as [ResourceId, number][]) {
      if (resources[res] < amount) return `Stock insuffisant : ${res}`;
    }

    const duration = transferDurationMs(jumps) * this.effects.transferSpeedMult;
    const reserved = this.reserveShip(colony, Date.now() + 2 * duration);
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
    this.colonyMap.set(colony.id, { ...reserved.colony, resources });
    this.persistColony(this.colonyMap.get(colony.id)!);
    this.insertMission("contribute_gateway", colonyId, galaxyId, duration, { cargo });
    this.notify();
    return null;
  }

  // ─────────────────────────── Flottes & combat ───────────────────────────

  /** Action joueur : créer une flotte vide rattachée à une colonie. */
  createFleet(colonyId: string, name: string): string | null {
    const colony = this.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    const systemId = this.planetsById.get(colony.planetId)?.systemId;
    if (!systemId) return "Système inconnu";
    const fleet: Fleet = {
      id: randomUUID(),
      ownerId: this.defaultEmpire.id,
      name: name.trim().slice(0, 40) || "Flotte",
      systemId,
      homeColonyId: colonyId,
      ships: {},
      directives: { ...DEFAULT_DIRECTIVES },
      queue: [],
      movement: null,
    };
    this.fleetMap.set(fleet.id, fleet);
    this.persistFleet(fleet, true);
    this.notify();
    return null;
  }

  /** Action joueur : produire un vaisseau de guerre (file de la flotte, tech requise). */
  buildWarship(fleetId: string, warshipId: string): string | null {
    const fleet = this.fleetMap.get(fleetId);
    if (!fleet) return "Flotte inconnue";
    if (fleet.movement) return "Flotte en déplacement";
    const def = WARSHIPS[warshipId as WarshipId];
    if (!def) return "Vaisseau inconnu";
    const home = this.colonyMap.get(fleet.homeColonyId);
    if (!home) return "Colonie de rattachement inconnue";
    if ((home.buildings.shipyard ?? 0) < 1) return "Chantier naval requis";
    if (!this.state.researched.includes(def.requiresTech)) {
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
    this.colonyMap.set(home.id, { ...home, resources });
    this.persistColony(this.colonyMap.get(home.id)!);
    const now = Date.now();
    const lastFinish = fleet.queue.at(-1)?.finishesAt ?? now;
    const startedAt = Math.max(now, lastFinish);
    const next: Fleet = {
      ...fleet,
      queue: [...fleet.queue, { warshipId, startedAt, finishesAt: startedAt + def.buildMs }],
    };
    this.fleetMap.set(fleetId, next);
    this.persistFleet(next);
    this.notify();
    return null;
  }

  setFleetDirectives(fleetId: string, directives: Record<string, string>): string | null {
    const fleet = this.fleetMap.get(fleetId);
    if (!fleet) return "Flotte inconnue";
    const next: Fleet = {
      ...fleet,
      directives: {
        long: directives.long ?? fleet.directives.long ?? "focus_fire",
        medium: directives.medium ?? fleet.directives.medium ?? "focus_fire",
        short: directives.short ?? fleet.directives.short ?? "focus_fire",
      },
    };
    this.fleetMap.set(fleetId, next);
    this.persistFleet(next);
    this.notify();
    return null;
  }

  /** Action joueur : déplacer une flotte vers un système accessible. */
  moveFleet(fleetId: string, toSystemId: string): string | null {
    const fleet = this.fleetMap.get(fleetId);
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
        arrivesAt: now + transferDurationMs(jumps) * this.effects.transferSpeedMult,
      },
    };
    this.fleetMap.set(fleetId, next);
    this.persistFleet(next);
    this.notify();
    return null;
  }

  /** Action joueur : attaquer un repaire pirate présent dans le système de la flotte. */
  attackLair(fleetId: string, lairId: string): string | null {
    const fleet = this.fleetMap.get(fleetId);
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
    this.fleetMap.set(fleetId, updatedFleet);
    this.persistFleet(updatedFleet);

    if (report.winner === "attacker") {
      // Butin crédité à la colonie de rattachement, repaire détruit.
      const home = this.colonyMap.get(fleet.homeColonyId);
      if (home) {
        this.colonyMap.set(home.id, {
          ...home,
          resources: { ...home.resources, credits: home.resources.credits + lair.bounty },
        });
        this.persistColony(this.colonyMap.get(home.id)!);
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

  disbandFleet(fleetId: string): string | null {
    const fleet = this.fleetMap.get(fleetId);
    if (!fleet) return "Flotte inconnue";
    if (fleet.movement) return "Flotte en déplacement";
    this.fleetMap.delete(fleetId);
    db.delete(schema.fleets).where(eq(schema.fleets.id, fleetId)).run();
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
        gameId: this.state.id,
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

  /** Résout production, déplacements et spawns pirates à chaque tick. */
  private fleetsTick(t: number, tickNumber: number): void {
    for (const [id, fleet] of this.fleetMap) {
      let current = fleet;
      // Livraison des vaisseaux produits.
      const done = current.queue.filter((q) => q.finishesAt <= t);
      if (done.length > 0) {
        const ships = { ...current.ships };
        for (const item of done) ships[item.warshipId] = (ships[item.warshipId] ?? 0) + 1;
        current = { ...current, ships, queue: current.queue.filter((q) => q.finishesAt > t) };
      }
      // Arrivée d'un déplacement.
      if (current.movement && current.movement.arrivesAt <= t) {
        current = { ...current, systemId: current.movement.toSystemId, movement: null };
      }
      if (current !== fleet) {
        this.fleetMap.set(id, current);
        this.persistFleet(current);
      }
    }

    // Piraterie : ponction de crédits aux colonies partageant un système avec un repaire.
    for (const lair of this.lairMap.values()) {
      for (const colony of this.colonyMap.values()) {
        if (this.planetsById.get(colony.planetId)?.systemId !== lair.systemId) continue;
        const credits = Math.max(0, colony.resources.credits - PIRATE_TAX_PER_TICK);
        this.colonyMap.set(colony.id, {
          ...colony,
          resources: { ...colony.resources, credits },
        });
      }
    }

    // Apparition de repaires au tick éco (systèmes explorés, non revendiqués, sans repaire).
    if (tickNumber % ECONOMY_TICK_TICKS === 0) this.spawnPirates(tickNumber);
  }

  private spawnPirates(tickNumber: number): void {
    for (const systemId of this.explored) {
      if (this.state.claimedSystemIds.includes(systemId)) continue;
      if ([...this.lairMap.values()].some((l) => l.systemId === systemId)) continue;
      const rng = createRng(`pirate-${this.state.seed}-${systemId}-${tickNumber}`);
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
        .values({ id: fleet.id, gameId: this.state.id, ownerId: fleet.ownerId ?? this.defaultEmpire.id, ...values })
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
      db.insert(schema.pirateLairs).values({ id: lair.id, gameId: this.state.id, ...values }).run();
    } else {
      db.update(schema.pirateLairs).set(values).where(eq(schema.pirateLairs.id, lair.id)).run();
    }
  }

  private loadFleets(): void {
    for (const row of db.select().from(schema.fleets).all()) {
      this.fleetMap.set(row.id, {
        id: row.id,
        ownerId: row.ownerId ?? this.defaultEmpire.id,
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

  private initGateways(): void {
    for (const galaxy of this.universe.galaxies.slice(1)) {
      const gateway: Gateway = { galaxyId: galaxy.id, progress: {}, activatesAt: null, active: false };
      this.gatewayMap.set(galaxy.id, gateway);
      db.insert(schema.gateways)
        .values({ galaxyId: galaxy.id, gameId: this.state.id, progress: "{}", activatesAt: null, active: 0 })
        .run();
    }
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

  /** Action joueur : revendiquer un système (colonie sur place requise). */
  claimSystem(systemId: string): string | null {
    const system = allSystems(this.universe).find((s) => s.id === systemId);
    if (!system) return "Système inconnu";
    if (!this.explored.has(systemId)) return "Système non exploré";
    if (this.state.claimedSystemIds.includes(systemId)) return "Système déjà revendiqué";
    const hasColony = [...this.colonyMap.values()].some(
      (c) => this.planetsById.get(c.planetId)?.systemId === systemId,
    );
    if (!hasColony) return "Une colonie sur place est requise pour revendiquer";
    if (this.state.influence < CLAIM_COST) {
      return `Influence insuffisante (${Math.floor(this.state.influence)}/${CLAIM_COST})`;
    }
    this.state = {
      ...this.state,
      influence: this.state.influence - CLAIM_COST,
      claimedSystemIds: [...this.state.claimedSystemIds, systemId],
    };
    db.insert(schema.claims)
      .values({ systemId, gameId: this.state.id, ownerId: this.defaultEmpire.id, claimedAt: Date.now() })
      .run();
    this.notify();
    return null;
  }

  /** Action joueur : abandonner une revendication (sans remboursement). */
  unclaimSystem(systemId: string): string | null {
    if (!this.state.claimedSystemIds.includes(systemId)) return "Système non revendiqué";
    this.dropClaim(systemId);
    this.notify();
    return null;
  }

  private dropClaim(systemId: string): void {
    this.state = {
      ...this.state,
      claimedSystemIds: this.state.claimedSystemIds.filter((id) => id !== systemId),
    };
    db.delete(schema.claims).where(eq(schema.claims.systemId, systemId)).run();
  }

  /**
   * Outil de dev uniquement : avance le temps simulé de N secondes.
   * Décale tous les timestamps absolus (timers réels) vers le passé puis rejoue les ticks.
   */
  devFastForward(seconds: number): void {
    const delta = Math.max(0, Math.floor(seconds)) * 1000;
    if (delta <= 0) return;

    this.state = { ...this.state, lastTickAt: this.state.lastTickAt - delta };
    if (this.state.research) {
      this.state = {
        ...this.state,
        research: {
          ...this.state.research,
          startedAt: this.state.research.startedAt - delta,
          finishesAt: this.state.research.finishesAt - delta,
        },
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
    this.persistResearch();
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

    const missed = Math.floor((Date.now() - this.state.lastTickAt) / TICK_MS);
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
    const progress: Partial<Record<ResourceId, number>> = { ...GATEWAY_COST };
    progress.metals = Math.max(0, (GATEWAY_COST.metals ?? 0) - leave);
    const next: Gateway = { ...gateway, progress };
    this.gatewayMap.set(galaxyId, next);
    this.persistGateway(next);
    this.notify();
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
    kind: Mission["kind"],
    fromColonyId: string,
    targetId: string,
    durationMs: number,
    extras: Pick<Mission, "cargo" | "budget" | "buyResource" | "capacity"> = {},
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
    this.missionMap.set(mission.id, mission);
    db.insert(schema.missions)
      .values({
        id: mission.id,
        gameId: this.state.id,
        kind: mission.kind,
        fromColonyId: mission.fromColonyId,
        targetId: mission.targetId,
        departedAt: mission.departedAt,
        arrivesAt: mission.arrivesAt,
        cargo: mission.cargo ? JSON.stringify(mission.cargo) : null,
        budget: mission.budget ?? null,
        buyResource: mission.buyResource ?? null,
        capacity: mission.capacity ?? null,
      })
      .run();
  }

  /** Résout les missions arrivées à l'instant `t` : révélation, fondation, commerce. */
  private resolveMissions(t: number): void {
    for (const [id, mission] of this.missionMap) {
      if (mission.arrivesAt > t) continue;
      switch (mission.kind) {
        case "probe":
          this.markExplored(mission.targetId);
          break;
        case "colonize": {
          const planet = this.planetsById.get(mission.targetId);
          const alreadyColonized = [...this.colonyMap.values()].some(
            (c) => c.planetId === mission.targetId,
          );
          if (planet && !alreadyColonized) {
            this.insertColony({
              id: randomUUID(),
              planetId: planet.id,
              name: planet.name,
              resources: { ...emptyResources(), ...NEW_COLONY_RESOURCES },
              buildings: { habitat: 1 },
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
          const colony = this.colonyMap.get(mission.fromColonyId);
          if (stocks && colony && mission.cargo) {
            const result = resolveSale(stocks, mission.cargo);
            this.marketMap.set(mission.targetId, result.stocks);
            this.persistMarket(mission.targetId);
            // Bonus de réputation : la faction paie mieux ses partenaires.
            const revenue = Math.floor(
              result.revenue * (1 + this.stationRepBonus(mission.targetId)),
            );
            this.addFactionRep(mission.targetId, result.revenue);
            const resources = {
              ...colony.resources,
              credits: colony.resources.credits + revenue,
            };
            this.colonyMap.set(colony.id, { ...colony, resources });
            this.persistColony(this.colonyMap.get(colony.id)!);
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
            );
            this.marketMap.set(mission.targetId, result.stocks);
            this.persistMarket(mission.targetId);
            // Remise de réputation : une part du prix payé est restituée.
            const rebate = Math.floor(result.spent * this.stationRepBonus(mission.targetId));
            this.addFactionRep(mission.targetId, result.spent);
            // Trajet retour, chargé + reliquat de budget (et remise) à rembourser.
            this.insertMission(
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
            for (const [res, amount] of Object.entries(mission.cargo) as [ResourceId, number][]) {
              const cap = GATEWAY_COST[res] ?? 0;
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
        case "build_outpost": {
          const belt = this.beltsById.get(mission.targetId);
          const alreadyBuilt = [...this.outpostMap.values()].some(
            (o) => o.beltId === mission.targetId,
          );
          if (belt && !alreadyBuilt) {
            const outpost: MiningOutpost = {
              id: randomUUID(),
              beltId: belt.id,
              ownerColonyId: mission.fromColonyId,
              oreStock: 0,
            };
            this.outpostMap.set(outpost.id, outpost);
            db.insert(schema.outposts)
              .values({ ...outpost, gameId: this.state.id, createdAt: Date.now() })
              .run();
            console.log(`[game] avant-poste minier fondé sur ${belt.name}`);
          }
          break;
        }
        case "buy_return": {
          const colony = this.colonyMap.get(mission.fromColonyId);
          if (colony) {
            const resources = { ...colony.resources };
            for (const [res, amount] of Object.entries(mission.cargo ?? {}) as [
              ResourceId,
              number,
            ][]) {
              resources[res] = Math.min(resources[res] + amount, storageCap(colony, res));
            }
            resources.credits += mission.budget ?? 0;
            this.colonyMap.set(colony.id, { ...colony, resources });
            this.persistColony(this.colonyMap.get(colony.id)!);
          }
          break;
        }
      }
      this.missionMap.delete(id);
      db.delete(schema.missions).where(eq(schema.missions.id, id)).run();
    }
  }

  private initMarkets(): void {
    for (const station of this.stationsById.values()) {
      const stocks = initialStocks(createRng(`${this.state.seed}-station-${station.id}`));
      this.marketMap.set(station.id, stocks);
      db.insert(schema.stationStates)
        .values({ stationId: station.id, gameId: this.state.id, stocks: JSON.stringify(stocks) })
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
  private influenceTick(): void {
    const net = influencePerTick(this.colonies, this.state.claimedSystemIds.length);
    let influence = this.state.influence + net;
    if (influence < 0 && this.state.claimedSystemIds.length > 0) {
      const dropped = this.state.claimedSystemIds.at(-1)!;
      this.dropClaim(dropped);
      influence = 0;
      console.log(`[game] revendication perdue faute d'influence : ${dropped}`);
    }
    this.state = { ...this.state, influence: Math.max(0, influence) };
  }

  /** Tick économique : les stocks PNJ de chaque station évoluent selon leur faction. */
  private economyTick(tickNumber: number): void {
    for (const station of this.stationsById.values()) {
      const stocks = this.marketMap.get(station.id);
      if (!stocks) continue;
      const faction = FACTIONS[station.factionId as FactionId];
      if (!faction) continue;
      const rng = createRng(`${this.state.seed}-mkt-${station.id}-${tickNumber}`);
      this.marketMap.set(station.id, marketTick(stocks, faction, rng));
      this.persistMarket(station.id);
    }
  }

  private markExplored(systemId: string): void {
    if (this.explored.has(systemId)) return;
    this.explored.add(systemId);
    this.explorationDirty = true;
    db.update(schema.players)
      .set({ explored: JSON.stringify([...this.explored]) })
      .where(eq(schema.players.id, this.defaultEmpire.id))
      .run();
  }

  /** Livre les convois arrivés à l'instant `t` (surplus au-delà du stockage perdu). */
  private deliverTransfers(t: number): void {
    for (const [id, transfer] of this.transferMap) {
      if (transfer.arrivesAt > t) continue;
      const to = this.colonyMap.get(transfer.toColonyId);
      if (to) {
        const resources = { ...to.resources };
        for (const [res, amount] of Object.entries(transfer.resources) as [ResourceId, number][]) {
          resources[res] = Math.min(resources[res] + amount, storageCap(to, res));
        }
        this.colonyMap.set(to.id, { ...to, resources });
      }
      this.transferMap.delete(id);
      db.delete(schema.transfers).where(eq(schema.transfers.id, id)).run();
    }
  }

  /** Colonie de départ : la planète la plus habitable de la galaxie d'origine. */
  /**
   * Garantit qu'un empire par défaut existe et adopte les entités orphelines.
   * Socle du multi (chantier 7) : en solo, un unique player possède tout.
   * Pour une sauvegarde mono-locataire pré-existante, backfill des `ownerId` NULL.
   */
  private ensureDefaultPlayer(): void {
    let player = db
      .select()
      .from(schema.players)
      .where(eq(schema.players.gameId, this.state.id))
      .limit(1)
      .get();
    if (!player) {
      // Nouveau player : on l'ensemence avec l'état d'empire courant (issu de la
      // ligne `games` legacy pour une sauvegarde pré-7b, sinon les valeurs par défaut).
      player = {
        id: randomUUID(),
        gameId: this.state.id,
        name: DEFAULT_PLAYER_NAME,
        color: DEFAULT_PLAYER_COLOR,
        joinedAt: Date.now(),
        researched: JSON.stringify(this.state.researched),
        research: this.state.research ? JSON.stringify(this.state.research) : null,
        influence: this.state.influence,
        factionRep: JSON.stringify(this.state.factionRep),
        explored: JSON.stringify([...this.explored]),
      };
      db.insert(schema.players).values(player).run();
    }
    this.defaultEmpire = new Empire(player.id, player.name, player.color);
    this.empires.set(this.defaultEmpire.id, this.defaultEmpire);
    for (const table of [schema.colonies, schema.fleets, schema.claims]) {
      db.update(table)
        .set({ ownerId: this.defaultEmpire.id })
        .where(and(eq(table.gameId, this.state.id), isNull(table.ownerId)))
        .run();
    }
    // Source autoritaire de l'état d'empire = la ligne `players` (chantier 7b).
    this.state = {
      ...this.state,
      researched: JSON.parse(player.researched),
      research: player.research ? JSON.parse(player.research) : null,
      influence: player.influence,
      factionRep: JSON.parse(player.factionRep),
    };
    this.explored = new Set(JSON.parse(player.explored));
  }

  private createHomeColony(): void {
    const homeGalaxy = this.universe.galaxies[0]!;
    const planets = homeGalaxy.systems.flatMap((s) => s.planets);
    const home = planets.reduce((best, p) => (p.habitability > best.habitability ? p : best));
    this.insertColony({
      id: randomUUID(),
      planetId: home.id,
      name: `${home.name} — Colonie mère`,
      resources: { ...emptyResources(), ore: 400, energy: 200, food: 200, credits: 50 },
      buildings: { mine: 1, power_plant: 1, farm: 1, habitat: 1, shipyard: 1 },
      queue: [],
      population: 12,
      satisfaction: 80,
      ships: { cargo_small: 2 },
      shipsBusy: [],
      shipQueue: [],
    });
    this.markExplored(home.systemId);
    console.log(`[game] colonie mère fondée sur ${home.name} (habitabilité ${home.habitability})`);
  }

  private insertColony(colony: Colony): void {
    colony.ownerId = this.defaultEmpire.id;
    this.colonyMap.set(colony.id, colony);
    db.insert(schema.colonies)
      .values({
        id: colony.id,
        gameId: this.state.id,
        ownerId: colony.ownerId,
        planetId: colony.planetId,
        name: colony.name,
        resources: JSON.stringify(colony.resources),
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
      this.colonyMap.set(row.id, {
        id: row.id,
        ownerId: row.ownerId ?? this.defaultEmpire.id,
        planetId: row.planetId,
        name: row.name,
        resources: JSON.parse(row.resources),
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
    const elapsed = Math.floor((Date.now() - this.state.lastTickAt) / TICK_MS);
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
      const t = this.state.lastTickAt + i * TICK_MS;
      const tickNumber = this.state.tick + i;
      this.deliverTransfers(t);
      this.resolveMissions(t);
      this.resolveResearch(t);
      this.resolveGateways(t);
      this.processRoutes(t);
      this.outpostsTick();
      this.fleetsTick(t, tickNumber);
      this.influenceTick();
      if (tickNumber % ECONOMY_TICK_TICKS === 0) this.economyTick(tickNumber);
      for (const [id, colony] of this.colonyMap) {
        const planet = this.planetsById.get(colony.planetId);
        if (!planet) continue;
        // Bonus territorial : système revendiqué = production boostée.
        const claimed = this.state.claimedSystemIds.includes(planet.systemId);
        const effects = claimed
          ? { ...this.effects, outputMultAll: this.effects.outputMultAll * CLAIM_PRODUCTION_BONUS }
          : this.effects;
        this.colonyMap.set(
          id,
          applyColonyTick(resolveShips(resolveQueue(colony, t), t), planet, effects),
        );
      }
    }
    this.state = {
      ...this.state,
      tick: this.state.tick + ticks,
      lastTickAt: this.state.lastTickAt + ticks * TICK_MS,
    };
    db.update(schema.games)
      .set({ tick: this.state.tick, lastTickAt: this.state.lastTickAt })
      .where(eq(schema.games.id, this.state.id))
      .run();
    db.update(schema.players)
      .set({ influence: this.state.influence, factionRep: JSON.stringify(this.state.factionRep) })
      .where(eq(schema.players.id, this.defaultEmpire.id))
      .run();
    for (const colony of this.colonyMap.values()) this.persistColony(colony);
    this.persistOutposts();
    this.notify();
  }

  private loadTransfers(): void {
    for (const row of db.select().from(schema.transfers).all()) {
      this.transferMap.set(row.id, {
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
      this.missionMap.set(row.id, {
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
      });
    }
  }

  private notify(): void {
    const snapshot: EngineSnapshot = {
      game: this.state,
      colonies: this.colonies,
      transfers: this.transfers,
      missions: this.missions,
      exploredSystemIds: this.exploredSystemIds,
      markets: this.markets,
      routes: this.routes,
      outposts: this.outposts,
      gateways: this.gateways,
      fleets: this.fleets,
      pirateLairs: this.pirateLairs,
      battles: this.battles,
      ...(this.explorationDirty ? { universe: this.clientUniverse } : {}),
    };
    this.explorationDirty = false;
    for (const listener of this.listeners) listener(snapshot);
  }
}
