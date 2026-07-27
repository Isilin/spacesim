import {
  createRng,
  decideColonyEconomy,
  embargoBlocks,
  FACTIONS,
  factionTick,
  gatewayLinks,
  jumpDistanceInUniverse,
  initialStocks,
  marketTick,
  moodRebateBonus,
  NPC_CONTRACT_DURATION_MS,
  NPC_CONTRACT_PRICE_MULT,
  FACTION_CONTRACT_DURATION_MS,
  FACTION_CONTRACT_PRICE_MULT,
  FACTION_CONTRACT_QUANTITY_MAX,
  FACTION_CONTRACT_QUANTITY_MIN,
  MARKET_RESOURCES,
  randInt,
  REP_PER_CREDIT,
  repBonus,
  resolvePurchase,
  resolveSale,
  stationPrice,
  takeFromOrbit,
  TARGET_STOCK,
  transferCostCredits,
  transferDurationMs,
  worldEventPriceBonus,
  type Colony,
  type Contract,
  type FactionId,
  type FactionState,
  type MarketResource,
  type Mission,
  type PriceContext,
  type ResourceId,
  type Rng,
  type TradeStation,
  type WorldEventKind,
} from "@spacesim/shared";
import { randomUUID } from "node:crypto";
import type { Empire } from "../../empire.js";
import type { GameRuntime } from "../game-runtime.js";
import type { Logger } from "../logger.js";
import { MarketRepository } from "../repositories/market-repository.js";

/**
 * Marché de station (joueur et PNJ) : prix régionaux, commerce joueur en station,
 * réputation/embargo de faction, humeur de faction, et l'IA économique PNJ (vente de
 * surplus, contrats de besoin). `reserveShip`/`insertMission` (Logistics) et
 * `postContract`/`insertContract` (Contract) sont injectés en callbacks — ce service
 * ne référence aucun autre service directement.
 */
export class MarketService {
  private readonly repo: MarketRepository;

  constructor(
    private readonly runtime: GameRuntime,
    private readonly notify: () => void,
    private readonly logger: Logger,
    private readonly persistColony: (colony: Colony) => void,
    private readonly persistFactionState: (state: FactionState) => void,
    private readonly worldEventKindsOnGalaxy: (galaxyId: string) => WorldEventKind[],
    private readonly reserveShip: (
      empire: Empire,
      colony: Colony,
      busyUntil: number,
    ) => { colony: Colony; shipId: string; capacity: number } | null,
    private readonly insertMission: (
      empire: Empire,
      kind: "sell" | "buy" | "buy_return",
      fromColonyId: string,
      targetId: string,
      durationMs: number,
      extras?: Pick<Mission, "cargo" | "budget" | "buyResource" | "capacity">,
      departedAt?: number,
    ) => void,
    private readonly postContract: (
      empire: Empire,
      colonyId: string,
      resource: ResourceId,
      quantity: number,
      pricePerUnit: number,
      durationMs: number,
    ) => string | null,
    private readonly insertContract: (contract: Contract) => void,
  ) {
    this.repo = new MarketRepository(runtime.clock.id);
  }

  private get portalLinks(): [string, string][] {
    return gatewayLinks(this.runtime.universe, [...this.runtime.gatewayMap.values()]);
  }

  /**
   * Contexte de prix d'une station (chantier 12) : son biais propre et l'éloignement de
   * sa galaxie. C'est ce qui fait diverger les prix d'un comptoir à l'autre.
   */
  priceContextOf(stationId: string): PriceContext | undefined {
    const station = this.runtime.stationsById.get(stationId);
    if (!station) return undefined;
    return {
      stationId,
      galaxyIndex: this.runtime.galaxyIndexOfSystem.get(station.systemId) ?? 0,
      factionId: station.factionId,
    };
  }

  /** Réputation gagnée auprès de la faction de la station, au volume de crédits échangé. */
  addFactionRep(empire: Empire, stationId: string, creditsExchanged: number): void {
    const station = this.runtime.stationsById.get(stationId);
    if (!station || creditsExchanged <= 0) return;
    const factionRep = { ...empire.factionRep };
    factionRep[station.factionId] =
      Math.round(((factionRep[station.factionId] ?? 0) + creditsExchanged * REP_PER_CREDIT) * 10) /
      10;
    empire.factionRep = factionRep;
  }

  /**
   * Bonus commercial appliqué en station : remise de réputation + marge des chartes
   * commerciales (chantier 12) + bonus d'humeur de faction (chantier 15, boom) + effet
   * d'un événement de monde régional (chantier 17, crise/ruée). Majore les ventes,
   * réduit les achats.
   */
  stationRepBonus(empire: Empire, stationId: string): number {
    const station = this.runtime.stationsById.get(stationId);
    const rep = station ? repBonus(empire.factionRep[station.factionId] ?? 0) : 0;
    const mood = station
      ? (this.runtime.factionStateMap.get(station.factionId)?.mood ?? "neutral")
      : "neutral";
    const galaxyIndex = station
      ? this.runtime.galaxyIndexOfSystem.get(station.systemId)
      : undefined;
    const galaxyId =
      galaxyIndex !== undefined ? this.runtime.universe.galaxies[galaxyIndex]?.id : undefined;
    const eventBonus = galaxyId ? worldEventPriceBonus(this.worldEventKindsOnGalaxy(galaxyId)) : 0;
    return rep + empire.effects.tradeMargin + moodRebateBonus(mood) + eventBonus;
  }

  /** Un embargo de faction ferme la station aux empires qui n'ont pas encore fait leurs preuves. */
  stationEmbargoed(empire: Empire, stationId: string): boolean {
    const station = this.runtime.stationsById.get(stationId);
    if (!station) return false;
    const mood = this.runtime.factionStateMap.get(station.factionId)?.mood ?? "neutral";
    return embargoBlocks(mood, empire.factionRep[station.factionId] ?? 0);
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
    const station = this.runtime.stationsById.get(stationId);
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

    const fromPlanet = this.runtime.planetsById.get(colony.planetId);
    if (!fromPlanet) return "Planète inconnue";
    const jumps = jumpDistanceInUniverse(
      this.runtime.universe,
      fromPlanet.systemId,
      station.systemId,
      this.portalLinks,
    );
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
    const station = this.runtime.stationsById.get(stationId);
    if (!station) return "Station inconnue";
    if (!empire.explored.has(station.systemId)) return "Station non découverte";
    if (this.stationEmbargoed(empire, stationId)) return "Embargo de faction — commerce refusé";
    if (!(MARKET_RESOURCES as readonly string[]).includes(resource)) {
      return `Ressource non échangeable : ${resource}`;
    }
    const budget = Math.floor(Number(budgetRaw));
    if (!Number.isFinite(budget) || budget <= 0) return "Budget invalide";

    const fromPlanet = this.runtime.planetsById.get(colony.planetId);
    if (!fromPlanet) return "Planète inconnue";
    const jumps = jumpDistanceInUniverse(
      this.runtime.universe,
      fromPlanet.systemId,
      station.systemId,
      this.portalLinks,
    );
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

  // ─────────────────────────── Économie PNJ (chantier 14) ───────────────────────────

  /** Comptoir le plus proche dans la MÊME galaxie (un PNJ ne commerce pas à l'échelle de l'univers). */
  private nearestStation(systemId: string): TradeStation | null {
    const galaxyIndex = this.runtime.galaxyIndexOfSystem.get(systemId);
    let best: TradeStation | null = null;
    let bestJumps = Infinity;
    for (const station of this.runtime.stationsById.values()) {
      if (this.runtime.galaxyIndexOfSystem.get(station.systemId) !== galaxyIndex) continue;
      const jumps = jumpDistanceInUniverse(
        this.runtime.universe,
        systemId,
        station.systemId,
        this.portalLinks,
      );
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
  private npcSellSurplus(
    empire: Empire,
    colony: Colony,
    resource: MarketResource,
    quantity: number,
  ): void {
    if (quantity <= 0) return;
    const planet = this.runtime.planetsById.get(colony.planetId);
    const station = planet ? this.nearestStation(planet.systemId) : null;
    if (!station) return;
    const stocks = this.runtime.marketMap.get(station.id);
    if (!stocks) return;
    const loaded = takeFromOrbit(colony, { [resource]: quantity });
    if (!loaded) return;
    const result = resolveSale(stocks, { [resource]: quantity }, this.priceContextOf(station.id));
    this.runtime.marketMap.set(station.id, result.stocks);
    this.persistMarket(station.id);
    const updated: Colony = {
      ...loaded,
      resources: { ...loaded.resources, credits: loaded.resources.credits + result.revenue },
    };
    empire.colonyMap.set(colony.id, updated);
    this.persistColony(updated);
  }

  /** Publie un contrat pour un besoin PNJ — un joueur peut le servir contre rémunération. */
  private npcPostContract(
    empire: Empire,
    colony: Colony,
    resource: MarketResource,
    quantity: number,
  ): void {
    if (quantity <= 0) return;
    // Pas d'empilement : un contrat déjà ouvert pour cette ressource suffit à couvrir le besoin.
    const alreadyOpen = [...this.runtime.contractMap.values()].some(
      (c) =>
        c.issuerId === empire.id &&
        c.colonyId === colony.id &&
        c.resource === resource &&
        c.status === "open",
    );
    if (alreadyOpen) return;
    const planet = this.runtime.planetsById.get(colony.planetId);
    const station = planet ? this.nearestStation(planet.systemId) : null;
    const stocks = station ? this.runtime.marketMap.get(station.id) : undefined;
    const price =
      Math.round(
        stationPrice(
          resource,
          stocks?.[resource] ?? TARGET_STOCK,
          station ? this.priceContextOf(station.id) : undefined,
        ) *
          NPC_CONTRACT_PRICE_MULT *
          100,
      ) / 100;
    this.postContract(empire, colony.id, resource, quantity, price, NPC_CONTRACT_DURATION_MS);
  }

  /** Fait évoluer l'humeur de chaque faction à un tick économique (chantier 15). */
  factionMoodTick(now: number, tickNumber: number): void {
    for (const [factionId, state] of this.runtime.factionStateMap) {
      const rng = createRng(`faction-${this.runtime.clock.seed}-${factionId}-${tickNumber}`);
      const next = factionTick(state, rng, now);
      if (next === state) continue;
      this.runtime.factionStateMap.set(factionId, next);
      this.persistFactionState(next);
      this.logger.info(`[game] humeur de ${FACTIONS[factionId as FactionId].name} : ${next.mood}`);
      // La pénurie se traduit en demande concrète : un contrat qu'un joueur peut honorer.
      if (next.mood === "shortage") this.factionPostShortageContract(factionId, rng);
    }
  }

  /**
   * Publie un contrat pour un intrant manquant d'une faction en pénurie (chantier 15).
   * Sans séquestre : une faction n'a pas de colonie ni de solde de crédits propre, à la
   * différence d'un empire — c'est le marché lui-même qui l'honore, standing à la clé.
   */
  factionPostShortageContract(factionId: string, rng: Rng): void {
    const def = FACTIONS[factionId as FactionId];
    const consumed = Object.keys(def.consumes) as MarketResource[];
    if (consumed.length === 0) return;
    const alreadyOpen = [...this.runtime.contractMap.values()].some(
      (c) => c.issuerId === factionId && c.status === "open",
    );
    if (alreadyOpen) return;
    const station = [...this.runtime.stationsById.values()].find((s) => s.factionId === factionId);
    if (!station) return;

    const resource = consumed[Math.floor(rng() * consumed.length)]!;
    const stocks = this.runtime.marketMap.get(station.id);
    const price =
      Math.round(
        stationPrice(
          resource,
          stocks?.[resource] ?? TARGET_STOCK,
          this.priceContextOf(station.id),
        ) *
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
    this.runtime.contractMap.set(contract.id, contract);
    this.insertContract(contract);
    this.logger.info(`[game] ${def.name} publie un contrat de pénurie : ${quantity} ${resource}`);
    this.notify();
  }

  /** Fait tourner l'économie d'un empire PNJ : vend le surplus, contractualise les besoins. */
  npcTick(empire: Empire): void {
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
   * Dote de stocks les stations qui n'en ont pas encore. Appelé à la création d'une
   * partie et après chaque extension de l'univers (les galaxies neuves arrivent avec
   * leurs comptoirs) — d'où l'idempotence.
   */
  initMarkets(): void {
    for (const station of this.runtime.stationsById.values()) {
      if (this.runtime.marketMap.has(station.id)) continue;
      const stocks = initialStocks(createRng(`${this.runtime.clock.seed}-station-${station.id}`));
      this.runtime.marketMap.set(station.id, stocks);
      this.repo.insert(station.id, stocks);
    }
  }

  async loadMarkets(): Promise<void> {
    for (const { stationId, stocks } of await this.repo.loadAll()) {
      this.runtime.marketMap.set(stationId, stocks);
    }
  }

  persistMarket(stationId: string): void {
    const stocks = this.runtime.marketMap.get(stationId);
    if (!stocks) return;
    this.repo.save(stationId, stocks);
  }

  /** Tick économique : les stocks PNJ de chaque station évoluent selon leur faction. */
  economyTick(tickNumber: number): void {
    for (const station of this.runtime.stationsById.values()) {
      const stocks = this.runtime.marketMap.get(station.id);
      if (!stocks) continue;
      const faction = FACTIONS[station.factionId as FactionId];
      if (!faction) continue;
      const rng = createRng(`${this.runtime.clock.seed}-mkt-${station.id}-${tickNumber}`);
      this.runtime.marketMap.set(station.id, marketTick(stocks, faction, rng));
      this.persistMarket(station.id);
    }
  }

  /** Résout un achat au spot (mission "buy") — factorisé pour `resolveMissions` (Logistics). */
  resolvePurchaseAt(
    stationId: string,
    resource: MarketResource,
    budget: number,
    capacity: number,
  ): { bought: number; spent: number } | null {
    const stocks = this.runtime.marketMap.get(stationId);
    if (!stocks) return null;
    const result = resolvePurchase(
      stocks,
      resource,
      budget,
      capacity,
      this.priceContextOf(stationId),
    );
    this.runtime.marketMap.set(stationId, result.stocks);
    this.persistMarket(stationId);
    return { bought: result.bought, spent: result.spent };
  }

  /** Résout une vente au marché (missions "sell"/"deliver_contract") — même logique factorisée. */
  resolveSaleAt(
    stationId: string,
    cargo: Partial<Record<ResourceId, number>>,
  ): { revenue: number } | null {
    const stocks = this.runtime.marketMap.get(stationId);
    if (!stocks) return null;
    const result = resolveSale(stocks, cargo, this.priceContextOf(stationId));
    this.runtime.marketMap.set(stationId, result.stocks);
    this.persistMarket(stationId);
    return { revenue: result.revenue };
  }
}
