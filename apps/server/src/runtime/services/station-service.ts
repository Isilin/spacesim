import {
  applyStationCredits,
  applyStationTick,
  canFoundStation,
  canTradeAtStation,
  enqueueInstallation,
  enqueueZone,
  gatewayLinks,
  hasBlueprintMarket,
  hasResourceMarket,
  jumpDistanceInUniverse,
  MARKET_RESOURCES,
  relationKey,
  resolveInstallQueue,
  resolveStationPurchase,
  resolveStationSale,
  resolveZoneQueue,
  stationShipDurationMs,
  STATION_SHIP_COST,
  takeFromOrbit,
  transferCostCredits,
  transferDurationMs,
  type BalanceConstants,
  type Colony,
  type InstallationDef,
  type MarketResource,
  type Mission,
  type PriceContext,
  type ResourceId,
  type Station,
  type StationMarketAccess,
  type ZoneTypeDef,
} from "@spacesim/shared";
import type { Empire } from "../../empire.js";
import {
  balanceFromContent,
  installationDefsFromContent,
  zoneTypeDefsFromContent,
} from "../content/content-service.js";
import type { GameRuntime } from "../game-runtime.js";
import type { Logger } from "../logger.js";
import { StationRepository } from "../repositories/station-repository.js";

/** Résultat de la validation d'accès à un marché de station (chantier 25) — partagé
 *  par le commerce de ressources (ci-dessous) et de plans/vaisseaux (`IndustryService`,
 *  injecté). Volontairement maigre : ni la station ni l'empire propriétaire n'y
 *  transitent, un blueprint n'a besoin que de la portée et de la taxe. */
export type StationTradeAccess =
  | {
      ok: true;
      jumps: number;
      taxRate: number;
      hasResourceMarket: boolean;
      hasBlueprintMarket: boolean;
    }
  | { ok: false; reason: string };

/**
 * Stations orbitales (chantier 24) : fondation (mission avec trajet réel, sur le
 * modèle de `ExplorationService.colonize`), construction de zones/installations et
 * tick de production. Service dédié, sur le modèle de `GatewayService` — une station
 * est une entité de premier rang distincte d'une colonie, pas une extension
 * d'`IndustryService`. `persistColony`/`insertMission` restent la propriété
 * d'Industry/Logistics — injectés ici comme callbacks étroits, à l'identique du
 * patron déjà en place pour les autres services.
 *
 * Chantier 25 (marché de station) : `sellToStation`/`buyFromStation` mirroirent
 * `MarketService.sellToTradingPost`/`buyFromTradingPost`, mais la station visée peut
 * appartenir à un AUTRE empire — `findOwnedStation` scanne `runtime.empires` (même
 * choix de simplicité que `foreignPresenceForEmpire`, pas de nouvel index à
 * synchroniser). `resolveTradeAccess` est le point de validation partagé, réutilisé
 * tel quel par `IndustryService` pour le marché de plans/vaisseaux (callback injecté).
 */
export class StationService {
  private readonly repo: StationRepository;

  constructor(
    private readonly runtime: GameRuntime,
    private readonly notify: () => void,
    private readonly logger: Logger,
    private readonly persistColony: (colony: Colony) => void,
    private readonly reserveShip: (
      empire: Empire,
      colony: Colony,
      busyUntil: number,
    ) => { colony: Colony; shipId: string; capacity: number } | null,
    private readonly insertMission: (
      empire: Empire,
      kind: Mission["kind"],
      fromColonyId: string,
      targetId: string,
      durationMs: number,
      extras?: Pick<
        Mission,
        "cargo" | "budget" | "buyResource" | "capacity" | "venueKind"
      >,
    ) => void,
  ) {
    this.repo = new StationRepository(runtime.clock.id, runtime.writeSet);
  }

  private get portalLinks(): [string, string][] {
    return gatewayLinks(this.runtime.universe, [
      ...this.runtime.gatewayMap.values(),
    ]);
  }

  /** Scalaires d'équilibrage (DB-backed, chantier 23.8). */
  private get balance(): BalanceConstants {
    return balanceFromContent(this.runtime.content.constants);
  }

  /** Types de zone/installations (DB-backed, chantier 24). */
  private get zoneTypeDefs(): Record<string, ZoneTypeDef> {
    return zoneTypeDefsFromContent(this.runtime.content.zoneTypes);
  }

  private get installationDefs(): Record<string, InstallationDef> {
    return installationDefsFromContent(this.runtime.content.installations);
  }

  /**
   * Action joueur : envoyer un vaisseau de construction fonder une station en orbite
   * d'un corps. Sur le modèle exact de `colonize` (coût débité + mission avec trajet
   * réel), sans exclusion géante gazeuse (une station est en orbite, pas en surface)
   * et sans coût d'influence (une station ne revendique rien, contrairement à
   * `colonize` — ça reste le rôle des claims). Ne vérifie que les stations de CET
   * empire au corps visé (même choix que `colonize`, qui n'empêche pas deux empires
   * de coloniser la même planète).
   */
  foundStation(
    empire: Empire,
    colonyId: string,
    bodyId: string,
  ): string | null {
    if (!canFoundStation(empire.effects)) {
      return "Aucun type de zone débloqué — technologie requise non recherchée";
    }
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    const target = this.runtime.planetsById.get(bodyId);
    if (!target) return "Corps inconnu";
    if (!empire.explored.has(target.systemId)) return "Système non exploré";
    if ([...empire.stationMap.values()].some((s) => s.bodyId === bodyId)) {
      return "Une station orbite déjà ce corps";
    }
    if (
      [...empire.missionMap.values()].some(
        (m) => m.kind === "found_station" && m.targetId === bodyId,
      )
    ) {
      return "Un vaisseau de construction est déjà en route";
    }
    const fromPlanet = this.runtime.planetsById.get(colony.planetId);
    if (!fromPlanet) return "Planète inconnue";
    const jumps = jumpDistanceInUniverse(
      this.runtime.universe,
      fromPlanet.systemId,
      target.systemId,
      this.portalLinks,
    );
    if (jumps < 0) return "Système inaccessible";

    const resources = { ...colony.resources };
    for (const [res, amount] of Object.entries(STATION_SHIP_COST) as [
      ResourceId,
      number,
    ][]) {
      if (resources[res] < amount) {
        return `Ressources insuffisantes pour le vaisseau de construction (${amount} ${res})`;
      }
    }
    for (const [res, amount] of Object.entries(STATION_SHIP_COST) as [
      ResourceId,
      number,
    ][]) {
      resources[res] -= amount;
    }
    empire.colonyMap.set(colony.id, { ...colony, resources });
    this.persistColony(empire.colonyMap.get(colony.id)!);
    this.insertMission(
      empire,
      "found_station",
      colonyId,
      bodyId,
      stationShipDurationMs(jumps, this.balance),
    );
    this.notify();
    return null;
  }

  /** Action joueur : construire une zone sur une station possédée. */
  buildZone(
    empire: Empire,
    stationId: string,
    zoneTypeId: string,
  ): string | null {
    const station = empire.stationMap.get(stationId);
    if (!station) return "Station inconnue";
    const result = enqueueZone(
      station,
      zoneTypeId,
      Date.now(),
      empire.effects,
      this.zoneTypeDefs,
      this.balance,
    );
    if (!result.ok) return result.reason;
    empire.stationMap.set(stationId, result.station);
    this.persistStation(result.station);
    this.notify();
    return null;
  }

  /** Action joueur : construire une installation sur une station possédée. */
  buildInstallation(
    empire: Empire,
    stationId: string,
    installationId: string,
  ): string | null {
    const station = empire.stationMap.get(stationId);
    if (!station) return "Station inconnue";
    const result = enqueueInstallation(
      station,
      installationId,
      Date.now(),
      empire.effects,
      this.installationDefs,
      this.balance,
    );
    if (!result.ok) return result.reason;
    empire.stationMap.set(stationId, result.station);
    this.persistStation(result.station);
    this.notify();
    return null;
  }

  /** Trouve une station possédée par N'IMPORTE QUEL empire (chantier 25) — un visiteur
   *  vise la station d'un autre empire, contrairement à `buildZone`/`buildInstallation`
   *  qui n'opèrent que sur `empire.stationMap`. Même choix de simplicité que
   *  `foreignPresenceForEmpire` (scan complet), pas de nouvel index à synchroniser en
   *  parallèle de `stationMap`. */
  private findOwnedStation(
    stationId: string,
  ): { empire: Empire; station: Station } | undefined {
    for (const empire of this.runtime.empires.values()) {
      const station = empire.stationMap.get(stationId);
      if (station) return { empire, station };
    }
    return undefined;
  }

  /** Contexte de prix d'une station (chantier 25) : même mécanique que le comptoir PNJ
   *  (biais déterministe par venueId + éloignement de galaxie), sans `factionId` — une
   *  station de joueur n'a pas de faction. */
  private stationPriceContext(station: Station): PriceContext {
    return {
      venueId: station.id,
      galaxyIndex: this.runtime.galaxyIndexOfSystem.get(station.systemId) ?? 0,
    };
  }

  /**
   * Validation partagée d'un accès au marché d'une station (chantier 25) : existe,
   * découverte, atteignable, autorisée par la politique du propriétaire (paliers
   * diplomatiques, `sim/economy/station-market.ts`). Réutilisé tel quel par
   * `IndustryService` (marché de plans/vaisseaux, callback injecté) — ni la station ni
   * l'empire propriétaire n'y transitent, un appelant n'a besoin que du résultat.
   */
  resolveTradeAccess(
    visitorEmpire: Empire,
    fromColonyId: string,
    stationId: string,
  ): StationTradeAccess {
    const colony = visitorEmpire.colonyMap.get(fromColonyId);
    if (!colony) return { ok: false, reason: "Colonie inconnue" };
    const found = this.findOwnedStation(stationId);
    if (!found) return { ok: false, reason: "Station inconnue" };
    const { empire: owner, station } = found;
    if (!visitorEmpire.explored.has(station.systemId)) {
      return { ok: false, reason: "Station non découverte" };
    }
    const fromPlanet = this.runtime.planetsById.get(colony.planetId);
    if (!fromPlanet) return { ok: false, reason: "Planète inconnue" };
    const jumps = jumpDistanceInUniverse(
      this.runtime.universe,
      fromPlanet.systemId,
      station.systemId,
      this.portalLinks,
    );
    if (jumps < 0) return { ok: false, reason: "Station inaccessible" };
    const relation =
      this.runtime.relationMap.get(relationKey(visitorEmpire.id, owner.id))
        ?.state ?? "neutral";
    if (
      !canTradeAtStation(owner.id, visitorEmpire.id, station.marketAccess, relation)
    ) {
      return {
        ok: false,
        reason: "Accès refusé — politique de marché de la station",
      };
    }
    const installations = this.installationDefs;
    return {
      ok: true,
      jumps,
      taxRate: station.marketTaxRate,
      hasResourceMarket: hasResourceMarket(station, installations),
      hasBlueprintMarket: hasBlueprintMarket(station, installations),
    };
  }

  /** Action joueur (propriétaire) : accès et taxe appliqués aux visiteurs. */
  setMarketPolicy(
    empire: Empire,
    stationId: string,
    marketAccess: StationMarketAccess,
    marketTaxRate: number,
  ): string | null {
    const station = empire.stationMap.get(stationId);
    if (!station) return "Station inconnue";
    if (marketTaxRate < 0 || marketTaxRate > 1) return "Taxe invalide (0–1)";
    const next: Station = { ...station, marketAccess, marketTaxRate };
    empire.stationMap.set(stationId, next);
    this.persistStation(next);
    this.notify();
    return null;
  }

  /**
   * Action joueur : vendre une cargaison à une station (la sienne ou celle d'un autre
   * empire, selon sa politique de marché) — mirroir exact de
   * `MarketService.sellToTradingPost`, la validation d'accès en plus (`resolveTradeAccess`).
   */
  sellToStation(
    empire: Empire,
    colonyId: string,
    stationId: string,
    wanted: Partial<Record<ResourceId, number>>,
  ): string | null {
    const access = this.resolveTradeAccess(empire, colonyId, stationId);
    if (!access.ok) return access.reason;
    if (!access.hasResourceMarket) {
      return "Cette station n'a pas de marché de ressources";
    }
    const colony = empire.colonyMap.get(colonyId)!;

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

    const balance = this.balance;
    const fee = transferCostCredits(access.jumps, balance);

    const loaded = takeFromOrbit(colony, cargo);
    if (!loaded) {
      const missing = (Object.entries(cargo) as [ResourceId, number][]).find(
        ([res, amount]) => (colony.orbitalResources[res] ?? 0) < amount,
      );
      return `Stock orbital insuffisant : ${missing?.[0] ?? "cargaison"}`;
    }
    const resources = { ...loaded.resources };
    if (resources.credits < fee) return `Crédits insuffisants (frais : ${fee})`;

    const duration =
      transferDurationMs(access.jumps, balance) * empire.effects.transferSpeedMult;
    const reserved = this.reserveShip(empire, loaded, Date.now() + 2 * duration);
    if (!reserved) return "Aucun cargo disponible";
    const total = Object.values(cargo).reduce((s, n) => s + n, 0);
    if (total > reserved.capacity) {
      return `Cargaison trop lourde (soute : ${reserved.capacity})`;
    }

    resources.credits -= fee;
    empire.colonyMap.set(colony.id, { ...reserved.colony, resources });
    this.persistColony(empire.colonyMap.get(colony.id)!);
    this.insertMission(empire, "sell", colonyId, stationId, duration, {
      cargo,
      venueKind: "station",
    });
    this.notify();
    return null;
  }

  /** Action joueur : acheter au spot à une station — mirroir exact de
   *  `MarketService.buyFromTradingPost`. */
  buyFromStation(
    empire: Empire,
    colonyId: string,
    stationId: string,
    resource: ResourceId,
    budgetRaw: number,
  ): string | null {
    const access = this.resolveTradeAccess(empire, colonyId, stationId);
    if (!access.ok) return access.reason;
    if (!access.hasResourceMarket) {
      return "Cette station n'a pas de marché de ressources";
    }
    if (!(MARKET_RESOURCES as readonly string[]).includes(resource)) {
      return `Ressource non échangeable : ${resource}`;
    }
    const budget = Math.floor(Number(budgetRaw));
    if (!Number.isFinite(budget) || budget <= 0) return "Budget invalide";

    const colony = empire.colonyMap.get(colonyId)!;
    const balance = this.balance;
    const fee = transferCostCredits(access.jumps, balance);
    if (colony.resources.credits < budget + fee) {
      return `Crédits insuffisants (budget ${budget} + frais ${fee})`;
    }

    const duration =
      transferDurationMs(access.jumps, balance) * empire.effects.transferSpeedMult;
    const reserved = this.reserveShip(empire, colony, Date.now() + 2 * duration);
    if (!reserved) return "Aucun cargo disponible";

    const resources = {
      ...colony.resources,
      credits: colony.resources.credits - budget - fee,
    };
    empire.colonyMap.set(colony.id, { ...reserved.colony, resources });
    this.persistColony(empire.colonyMap.get(colony.id)!);
    this.insertMission(empire, "buy", colonyId, stationId, duration, {
      budget,
      buyResource: resource,
      capacity: reserved.capacity,
      venueKind: "station",
    });
    this.notify();
    return null;
  }

  /** Résout une vente au spot à une station (mission "sell", venueKind "station") —
   *  appelé par `LogisticsService.resolveMissions`. Mute et persiste la station de son
   *  PROPRIÉTAIRE (potentiellement différent de l'empire agissant). */
  resolveStationSaleAt(
    stationId: string,
    cargo: Partial<Record<ResourceId, number>>,
  ): { revenue: number } | null {
    const found = this.findOwnedStation(stationId);
    if (!found) return null;
    const { empire: owner, station } = found;
    const { station: next, revenue } = resolveStationSale(
      station,
      cargo,
      station.marketTaxRate,
      this.stationPriceContext(station),
    );
    owner.stationMap.set(next.id, next);
    this.persistStation(next);
    return { revenue };
  }

  /** Résout un achat au spot à une station (mission "buy", venueKind "station"). */
  resolveStationPurchaseAt(
    stationId: string,
    resource: MarketResource,
    budget: number,
    capacity: number,
  ): { bought: number; spent: number } | null {
    const found = this.findOwnedStation(stationId);
    if (!found) return null;
    const { empire: owner, station } = found;
    const { station: next, bought, spent } = resolveStationPurchase(
      station,
      resource,
      budget,
      capacity,
      station.marketTaxRate,
      this.stationPriceContext(station),
    );
    owner.stationMap.set(next.id, next);
    this.persistStation(next);
    return { bought, spent };
  }

  /**
   * Applique un delta de crédits instantané au stock d'une station (chantier 25) —
   * commerce de plans/vaisseaux (`IndustryService`, instantané, pas de convoi).
   * Retourne le montant réellement appliqué (peut être moindre qu'un delta négatif
   * demandé si la station est à court de crédits — `applyStationCredits`).
   */
  applyStationTrade(stationId: string, creditDelta: number): number {
    const found = this.findOwnedStation(stationId);
    if (!found) return 0;
    const { empire: owner, station } = found;
    const { resources, applied } = applyStationCredits(
      station.resources,
      creditDelta,
    );
    const next: Station = { ...station, resources };
    owner.stationMap.set(next.id, next);
    this.persistStation(next);
    return applied;
  }

  /** Insère une station nouvellement fondée (appelé à la résolution de la mission de
   *  fondation, chantier 24.5 — `LogisticsService.resolveMissions`). */
  insertStation(empire: Empire, station: Station): void {
    empire.stationMap.set(station.id, station);
    this.repo.insert(station);
  }

  async loadStations(): Promise<void> {
    for (const station of await this.repo.loadAll()) {
      const empire = this.runtime.empires.get(station.ownerId);
      if (!empire) continue;
      empire.stationMap.set(station.id, station);
    }
  }

  persistStation(station: Station): void {
    this.repo.save(station);
  }

  /** Production/consommation par tick de chaque station possédée — après la production
   *  des colonies (même position relative que l'ascenseur orbital), sans bonus de
   *  territoire revendiqué : une station n'occupe pas de système au sens des claims. */
  stationProductionTick(empire: Empire, t: number): void {
    for (const [id, station] of empire.stationMap) {
      empire.stationMap.set(
        id,
        applyStationTick(
          resolveInstallQueue(resolveZoneQueue(station, t), t),
          this.installationDefs,
        ),
      );
    }
  }

  /** Outil de dev uniquement : décale les timers de construction (dev-fastforward). */
  shiftTime(empire: Empire, deltaMs: number): void {
    for (const [id, station] of empire.stationMap) {
      if (station.zoneQueue.length === 0 && station.installQueue.length === 0)
        continue;
      empire.stationMap.set(id, {
        ...station,
        zoneQueue: station.zoneQueue.map((q) => ({
          ...q,
          startedAt: q.startedAt - deltaMs,
          finishesAt: q.finishesAt - deltaMs,
        })),
        installQueue: station.installQueue.map((q) => ({
          ...q,
          startedAt: q.startedAt - deltaMs,
          finishesAt: q.finishesAt - deltaMs,
        })),
      });
    }
  }
}
