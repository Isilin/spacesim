import {
  createRng,
  decideColonyEconomy,
  embargoBlocks,
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
  tradingPostPrice,
  takeFromOrbit,
  TARGET_STOCK,
  transferCostCredits,
  transferDurationMs,
  worldEventPriceBonus,
  type BalanceConstants,
  type Colony,
  type Contract,
  type FactionState,
  type MarketResource,
  type Mission,
  type PriceContext,
  type ResourceId,
  type Rng,
  type TradingPost,
  type WorldEventKind,
} from "@spacesim/shared";
import { randomUUID } from "node:crypto";
import type { Empire } from "../../empire.js";
import { balanceFromContent } from "../content/content-service.js";
import type { GameRuntime } from "../game-runtime.js";
import type { Logger } from "../logger.js";
import { MarketRepository } from "../repositories/market-repository.js";

/**
 * Marché de comptoir (joueur et PNJ) : prix régionaux, commerce joueur en comptoir,
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
    this.repo = new MarketRepository(runtime.clock.id, runtime.writeSet);
  }

  private get portalLinks(): [string, string][] {
    return gatewayLinks(this.runtime.universe, [...this.runtime.gatewayMap.values()]);
  }

  /** Scalaires d'équilibrage (DB-backed, chantier 23.8). */
  private get balance(): BalanceConstants {
    return balanceFromContent(this.runtime.content.constants);
  }

  /**
   * Contexte de prix d'une comptoir (chantier 12) : son biais propre et l'éloignement de
   * sa galaxie. C'est ce qui fait diverger les prix d'un comptoir à l'autre.
   */
  priceContextOf(tradingPostId: string): PriceContext | undefined {
    const comptoir = this.runtime.tradingPostsById.get(tradingPostId);
    if (!comptoir) return undefined;
    return {
      venueId: tradingPostId,
      galaxyIndex: this.runtime.galaxyIndexOfSystem.get(comptoir.systemId) ?? 0,
      factionId: comptoir.factionId,
    };
  }

  /** Réputation gagnée auprès de la faction de la comptoir, au volume de crédits échangé. */
  addFactionRep(empire: Empire, tradingPostId: string, creditsExchanged: number): void {
    const comptoir = this.runtime.tradingPostsById.get(tradingPostId);
    if (!comptoir || creditsExchanged <= 0) return;
    const factionRep = { ...empire.factionRep };
    factionRep[comptoir.factionId] =
      Math.round(((factionRep[comptoir.factionId] ?? 0) + creditsExchanged * REP_PER_CREDIT) * 10) /
      10;
    empire.factionRep = factionRep;
  }

  /**
   * Bonus commercial appliqué en comptoir : remise de réputation + marge des chartes
   * commerciales (chantier 12) + bonus d'humeur de faction (chantier 15, boom) + effet
   * d'un événement de monde régional (chantier 17, crise/ruée). Majore les ventes,
   * réduit les achats.
   */
  tradingPostRepBonus(empire: Empire, tradingPostId: string): number {
    const comptoir = this.runtime.tradingPostsById.get(tradingPostId);
    const rep = comptoir ? repBonus(empire.factionRep[comptoir.factionId] ?? 0) : 0;
    const mood = comptoir
      ? (this.runtime.factionStateMap.get(comptoir.factionId)?.mood ?? "neutral")
      : "neutral";
    const galaxyIndex = comptoir
      ? this.runtime.galaxyIndexOfSystem.get(comptoir.systemId)
      : undefined;
    const galaxyId =
      galaxyIndex !== undefined ? this.runtime.universe.galaxies[galaxyIndex]?.id : undefined;
    const eventBonus = galaxyId ? worldEventPriceBonus(this.worldEventKindsOnGalaxy(galaxyId)) : 0;
    return rep + empire.effects.tradeMargin + moodRebateBonus(mood) + eventBonus;
  }

  /** Un embargo de faction ferme la comptoir aux empires qui n'ont pas encore fait leurs preuves. */
  tradingPostEmbargoed(empire: Empire, tradingPostId: string): boolean {
    const comptoir = this.runtime.tradingPostsById.get(tradingPostId);
    if (!comptoir) return false;
    const mood = this.runtime.factionStateMap.get(comptoir.factionId)?.mood ?? "neutral";
    return embargoBlocks(mood, empire.factionRep[comptoir.factionId] ?? 0);
  }

  /** Action joueur : vendre une cargaison à une comptoir (créditée au spot d'arrivée). */
  sellToTradingPost(
    empire: Empire,
    colonyId: string,
    tradingPostId: string,
    wanted: Partial<Record<ResourceId, number>>,
  ): string | null {
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    const comptoir = this.runtime.tradingPostsById.get(tradingPostId);
    if (!comptoir) return "Comptoir inconnu";
    if (!empire.explored.has(comptoir.systemId)) return "Comptoir non découvert";
    if (this.tradingPostEmbargoed(empire, tradingPostId)) return "Embargo de faction — commerce refusé";

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
      comptoir.systemId,
      this.portalLinks,
    );
    if (jumps < 0) return "Comptoir inaccessible";
    const balance = this.balance;
    const fee = transferCostCredits(jumps, balance);

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

    const duration = transferDurationMs(jumps, balance) * empire.effects.transferSpeedMult;
    const reserved = this.reserveShip(empire, loaded, Date.now() + 2 * duration);
    if (!reserved) return "Aucun cargo disponible";
    const total = Object.values(cargo).reduce((s, n) => s + n, 0);
    if (total > reserved.capacity) {
      return `Cargaison trop lourde (soute : ${reserved.capacity})`;
    }

    resources.credits -= fee;
    empire.colonyMap.set(colony.id, { ...reserved.colony, resources });
    this.persistColony(empire.colonyMap.get(colony.id)!);
    this.insertMission(empire, "sell", colonyId, tradingPostId, duration, { cargo });
    this.notify();
    return null;
  }

  /** Action joueur : acheter au spot (le convoi part avec un budget, revient chargé). */
  buyFromTradingPost(
    empire: Empire,
    colonyId: string,
    tradingPostId: string,
    resource: ResourceId,
    budgetRaw: number,
  ): string | null {
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    const comptoir = this.runtime.tradingPostsById.get(tradingPostId);
    if (!comptoir) return "Comptoir inconnu";
    if (!empire.explored.has(comptoir.systemId)) return "Comptoir non découvert";
    if (this.tradingPostEmbargoed(empire, tradingPostId)) return "Embargo de faction — commerce refusé";
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
      comptoir.systemId,
      this.portalLinks,
    );
    if (jumps < 0) return "Comptoir inaccessible";
    const balance = this.balance;
    const fee = transferCostCredits(jumps, balance);

    if (colony.resources.credits < budget + fee) {
      return `Crédits insuffisants (budget ${budget} + frais ${fee})`;
    }

    const duration = transferDurationMs(jumps, balance) * empire.effects.transferSpeedMult;
    const reserved = this.reserveShip(empire, colony, Date.now() + 2 * duration);
    if (!reserved) return "Aucun cargo disponible";

    const resources = { ...colony.resources, credits: colony.resources.credits - budget - fee };
    empire.colonyMap.set(colony.id, { ...reserved.colony, resources });
    this.persistColony(empire.colonyMap.get(colony.id)!);
    // La capacité du cargo réservé borne l'achat à l'arrivée.
    this.insertMission(empire, "buy", colonyId, tradingPostId, duration, {
      budget,
      buyResource: resource,
      capacity: reserved.capacity,
    });
    this.notify();
    return null;
  }

  // ─────────────────────────── Économie PNJ (chantier 14) ───────────────────────────

  /** Comptoir le plus proche dans la MÊME galaxie (un PNJ ne commerce pas à l'échelle de l'univers). */
  private nearestTradingPost(systemId: string): TradingPost | null {
    const galaxyIndex = this.runtime.galaxyIndexOfSystem.get(systemId);
    let best: TradingPost | null = null;
    let bestJumps = Infinity;
    for (const comptoir of this.runtime.tradingPostsById.values()) {
      if (this.runtime.galaxyIndexOfSystem.get(comptoir.systemId) !== galaxyIndex) continue;
      const jumps = jumpDistanceInUniverse(
        this.runtime.universe,
        systemId,
        comptoir.systemId,
        this.portalLinks,
      );
      if (jumps < 0 || jumps >= bestJumps) continue;
      bestJumps = jumps;
      best = comptoir;
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
    const comptoir = planet ? this.nearestTradingPost(planet.systemId) : null;
    if (!comptoir) return;
    const stocks = this.runtime.marketMap.get(comptoir.id);
    if (!stocks) return;
    const loaded = takeFromOrbit(colony, { [resource]: quantity });
    if (!loaded) return;
    const result = resolveSale(stocks, { [resource]: quantity }, this.priceContextOf(comptoir.id));
    this.runtime.marketMap.set(comptoir.id, result.stocks);
    this.persistMarket(comptoir.id);
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
    const comptoir = planet ? this.nearestTradingPost(planet.systemId) : null;
    const stocks = comptoir ? this.runtime.marketMap.get(comptoir.id) : undefined;
    const price =
      Math.round(
        tradingPostPrice(
          resource,
          stocks?.[resource] ?? TARGET_STOCK,
          comptoir ? this.priceContextOf(comptoir.id) : undefined,
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
      const name = this.runtime.content.factions[factionId]?.name ?? factionId;
      this.logger.info(`[game] humeur de ${name} : ${next.mood}`);
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
    const def = this.runtime.content.factions[factionId];
    if (!def) return;
    const consumed = Object.keys(def.consumes) as MarketResource[];
    if (consumed.length === 0) return;
    const alreadyOpen = [...this.runtime.contractMap.values()].some(
      (c) => c.issuerId === factionId && c.status === "open",
    );
    if (alreadyOpen) return;
    const comptoir = [...this.runtime.tradingPostsById.values()].find((s) => s.factionId === factionId);
    if (!comptoir) return;

    const resource = consumed[Math.floor(rng() * consumed.length)]!;
    const stocks = this.runtime.marketMap.get(comptoir.id);
    const price =
      Math.round(
        tradingPostPrice(
          resource,
          stocks?.[resource] ?? TARGET_STOCK,
          this.priceContextOf(comptoir.id),
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
      colonyId: comptoir.id,
      colonyName: comptoir.name,
      systemId: comptoir.systemId,
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
   * Dote de stocks les comptoirs qui n'en ont pas encore. Appelé à la création d'une
   * partie et après chaque extension de l'univers (les galaxies neuves arrivent avec
   * leurs comptoirs) — d'où l'idempotence.
   */
  initMarkets(): void {
    for (const comptoir of this.runtime.tradingPostsById.values()) {
      if (this.runtime.marketMap.has(comptoir.id)) continue;
      const stocks = initialStocks(createRng(`${this.runtime.clock.seed}-comptoir-${comptoir.id}`));
      this.runtime.marketMap.set(comptoir.id, stocks);
      this.repo.insert(comptoir.id, stocks);
    }
  }

  async loadMarkets(): Promise<void> {
    for (const { tradingPostId, stocks } of await this.repo.loadAll()) {
      this.runtime.marketMap.set(tradingPostId, stocks);
    }
  }

  persistMarket(tradingPostId: string): void {
    const stocks = this.runtime.marketMap.get(tradingPostId);
    if (!stocks) return;
    this.repo.save(tradingPostId, stocks);
  }

  /** Tick économique : les stocks PNJ de chaque comptoir évoluent selon leur faction. */
  economyTick(tickNumber: number): void {
    for (const comptoir of this.runtime.tradingPostsById.values()) {
      const stocks = this.runtime.marketMap.get(comptoir.id);
      if (!stocks) continue;
      const faction = this.runtime.content.factions[comptoir.factionId];
      if (!faction) continue;
      const rng = createRng(`${this.runtime.clock.seed}-mkt-${comptoir.id}-${tickNumber}`);
      this.runtime.marketMap.set(comptoir.id, marketTick(stocks, faction, rng));
      this.persistMarket(comptoir.id);
    }
  }

  /** Résout un achat au spot (mission "buy") — factorisé pour `resolveMissions` (Logistics). */
  resolvePurchaseAt(
    tradingPostId: string,
    resource: MarketResource,
    budget: number,
    capacity: number,
  ): { bought: number; spent: number } | null {
    const stocks = this.runtime.marketMap.get(tradingPostId);
    if (!stocks) return null;
    const result = resolvePurchase(
      stocks,
      resource,
      budget,
      capacity,
      this.priceContextOf(tradingPostId),
    );
    this.runtime.marketMap.set(tradingPostId, result.stocks);
    this.persistMarket(tradingPostId);
    return { bought: result.bought, spent: result.spent };
  }

  /** Résout une vente au marché (missions "sell"/"deliver_contract") — même logique factorisée. */
  resolveSaleAt(
    tradingPostId: string,
    cargo: Partial<Record<ResourceId, number>>,
  ): { revenue: number } | null {
    const stocks = this.runtime.marketMap.get(tradingPostId);
    if (!stocks) return null;
    const result = resolveSale(stocks, cargo, this.priceContextOf(tradingPostId));
    this.runtime.marketMap.set(tradingPostId, result.stocks);
    this.persistMarket(tradingPostId);
    return { revenue: result.revenue };
  }
}
