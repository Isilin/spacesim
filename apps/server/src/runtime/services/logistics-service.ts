import {
  beltRichness,
  convoyCapacity,
  convoyDurationMs,
  convoyFees,
  convoyFuel,
  deliverToOrbit,
  emptyOrbital,
  emptyResources,
  fleetCapacity,
  gatewayCost,
  GATEWAY_BUILD_MS,
  gatewayCovered,
  gatewayLinks,
  idleShips,
  jumpDistanceInUniverse,
  legacyCapacity,
  legacyConvoyStat,
  MARKET_RESOURCES,
  NEW_COLONY_ORBITAL,
  NEW_COLONY_RESOURCES,
  OUTPOST_COST,
  OUTPOST_UPKEEP_CREDITS,
  outpostTick,
  pickShip,
  contractPayout,
  RESOURCES,
  routeCargoQuantity,
  takeFromOrbit,
  transferCostCredits,
  transferDurationMs,
  type BalanceConstants,
  type Colony,
  type Contract,
  type ConvoyStat,
  type Gateway,
  type LiftRule,
  type MarketResource,
  type MiningOutpost,
  type Mission,
  type ResourceId,
  type Route,
  type RouteRule,
  type ShipDef,
  type ShipId,
  type Station,
  type Transfer,
  emptyStationResources,
} from "@spacesim/shared";
import { randomUUID } from "node:crypto";
import type { Empire } from "../../empire.js";
import {
  balanceFromContent,
  shipDefsFromContent,
} from "../content/content-service.js";
import type { GameRuntime } from "../game-runtime.js";
import type { Logger } from "../logger.js";
import { LogisticsRepository } from "../repositories/logistics-repository.js";

/**
 * Logistique : convois manuels, ascenseur orbital, routes automatiques, avant-postes
 * miniers, et la propriété des missions (insertion + résolution). Le commerce en
 * comptoir (joueur/PNJ, prix, réputation) vit dans `MarketService`, les contrats de
 * fourniture dans `ContractService`, les portails dans `GatewayService` — tous
 * injectés ici en callbacks étroits pour les missions qui traversent leur domaine
 * (sell/buy/deliver_contract/contribute_gateway).
 */
export class LogisticsService {
  private readonly repo: LogisticsRepository;

  constructor(
    private readonly runtime: GameRuntime,
    private readonly notify: () => void,
    private readonly logger: Logger,
    private readonly persistColony: (colony: Colony) => void,
    private readonly insertColony: (empire: Empire, colony: Colony) => void,
    private readonly markExplored: (empire: Empire, systemId: string) => void,
    private readonly empireOfColony: (colonyId: string) => Empire,
    private readonly market: {
      resolveSaleAt: (
        tradingPostId: string,
        cargo: Partial<Record<ResourceId, number>>,
      ) => { revenue: number } | null;
      resolvePurchaseAt: (
        tradingPostId: string,
        resource: MarketResource,
        budget: number,
        capacity: number,
      ) => { bought: number; spent: number } | null;
      tradingPostRepBonus: (empire: Empire, tradingPostId: string) => number;
      addFactionRep: (
        empire: Empire,
        tradingPostId: string,
        creditsExchanged: number,
      ) => void;
    },
    private readonly persistGateway: (gateway: Gateway) => void,
    private readonly insertStation: (empire: Empire, station: Station) => void,
  ) {
    this.repo = new LogisticsRepository(runtime.clock.id, runtime.writeSet);
  }

  private get portalLinks(): [string, string][] {
    return gatewayLinks(this.runtime.universe, [
      ...this.runtime.gatewayMap.values(),
    ]);
  }

  /** Classes civiles (DB-backed, chantier 23.8) — remplace `SHIPS` dans tout ce service. */
  private get shipDefs(): Record<string, ShipDef> {
    return shipDefsFromContent(this.runtime.content.ships);
  }

  private get capacityOf(): (id: string) => number {
    const defs = this.shipDefs;
    return (id) => legacyCapacity(id, defs);
  }

  private get statsOf(): (id: string) => ConvoyStat {
    const defs = this.shipDefs;
    return (id) => legacyConvoyStat(id, defs);
  }

  /** Scalaires d'équilibrage (DB-backed, chantier 23.8). */
  private get balance(): BalanceConstants {
    return balanceFromContent(this.runtime.content.constants);
  }

  /**
   * Réserve le plus gros cargo disponible de la colonie jusqu'à `busyUntil`.
   * Retourne null si aucun vaisseau libre. Public : injecté dans Gateway/Contract/Market.
   */
  reserveShip(
    empire: Empire,
    colony: Colony,
    busyUntil: number,
  ): { colony: Colony; shipId: ShipId; capacity: number } | null {
    const idle = idleShips(colony, [...empire.routeMap.values()]);
    const shipId = pickShip(idle, this.capacityOf);
    if (!shipId) return null;
    return {
      colony: {
        ...colony,
        shipsBusy: [...colony.shipsBusy, { shipId, freeAt: busyUntil }],
      },
      shipId,
      capacity: this.capacityOf(shipId),
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
  ): {
    colony: Colony;
    ships: Partial<Record<ShipId, number>>;
    capacity: number;
  } | null {
    const idle = idleShips(colony, [...empire.routeMap.values()]);
    const defs = this.shipDefs;
    const wanted: Partial<Record<ShipId, number>> = {};
    for (const [shipId, raw] of Object.entries(ships) as [ShipId, number][]) {
      const count = Math.floor(Number(raw));
      if (!Number.isFinite(count) || count <= 0) continue;
      if (!defs[shipId]) return null;
      if ((idle[shipId] ?? 0) < count) return null;
      wanted[shipId] = count;
    }
    if (Object.keys(wanted).length === 0) return null;

    const busy = [...colony.shipsBusy];
    for (const [shipId, count] of Object.entries(wanted) as [
      ShipId,
      number,
    ][]) {
      for (let i = 0; i < count; i++) busy.push({ shipId, freeAt: busyUntil });
    }
    return {
      colony: { ...colony, shipsBusy: busy },
      ships: wanted,
      capacity: convoyCapacity(wanted, this.statsOf),
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
    if (!(RESOURCES as readonly string[]).includes(resource))
      return `Ressource inconnue : ${resource}`;
    const liftRules = { ...colony.liftRules };
    if (rule === null) {
      delete liftRules[resource];
    } else {
      if (rule.direction !== "up" && rule.direction !== "down")
        return "Consigne invalide";
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
      if (!(RESOURCES as readonly string[]).includes(res))
        return `Ressource inconnue : ${res}`;
      cargo[res] = amount;
    }
    if (Object.keys(cargo).length === 0) return "Cargaison vide";

    const fromPlanet = this.runtime.planetsById.get(from.planetId);
    const toPlanet = this.runtime.planetsById.get(to.planetId);
    if (!fromPlanet || !toPlanet) return "Planète inconnue";
    const jumps = jumpDistanceInUniverse(
      this.runtime.universe,
      fromPlanet.systemId,
      toPlanet.systemId,
      this.portalLinks,
    );
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
    const balance = this.balance;
    const reserved = convoy
      ? this.reserveConvoy(
          empire,
          loaded,
          convoy,
          now +
            2 * convoyDurationMs(jumps, convoy, this.statsOf, balance) * speed,
        )
      : (() => {
          const one = this.reserveShip(
            empire,
            loaded,
            now + 2 * transferDurationMs(jumps, balance) * speed,
          );
          return one
            ? {
                colony: one.colony,
                ships: { [one.shipId]: 1 },
                capacity: one.capacity,
              }
            : null;
        })();
    if (!reserved) return "Convoi indisponible : vaisseaux manquants";
    if (total > reserved.capacity) {
      return `Cargaison trop lourde pour ce convoi (soute : ${reserved.capacity})`;
    }

    const duration =
      convoyDurationMs(jumps, reserved.ships, this.statsOf, balance) * speed;
    const cost = convoyFees(jumps, portals, balance);
    const fuel = Math.ceil(
      convoyFuel(jumps, reserved.ships, total, this.statsOf, balance) *
        empire.effects.fuelMult,
    );
    const resources = { ...reserved.colony.resources };
    if (resources.credits < cost)
      return `Crédits insuffisants (frais : ${cost})`;
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
    this.repo.insertTransfer(transfer);
    this.notify();
    return null;
  }

  /**
   * Nombre de portails empruntés entre deux systèmes (chantier 12). Tous les portails
   * partent de l'ancrage de la galaxie d'origine : rejoindre une galaxie lointaine en
   * traverse un, passer d'une lointaine à une autre en traverse deux.
   */
  private portalsCrossed(fromSystemId: string, toSystemId: string): number {
    const from = this.runtime.galaxyIndexOfSystem.get(fromSystemId);
    const to = this.runtime.galaxyIndexOfSystem.get(toSystemId);
    if (from === undefined || to === undefined || from === to) return 0;
    return from === 0 || to === 0 ? 1 : 2;
  }

  /** Action joueur : fonder un avant-poste minier sur une ceinture. */
  buildOutpost(
    empire: Empire,
    colonyId: string,
    beltId: string,
  ): string | null {
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    const belt = this.runtime.beltsById.get(beltId);
    if (!belt) return "Ceinture inconnue";
    if (!empire.explored.has(belt.systemId)) return "Système non exploré";
    if ([...empire.outpostMap.values()].some((o) => o.beltId === beltId)) {
      return "Ceinture déjà exploitée";
    }
    if (
      [...empire.missionMap.values()].some(
        (m) => m.kind === "build_outpost" && m.targetId === beltId,
      )
    ) {
      return "Un chantier est déjà en route";
    }
    const fromPlanet = this.runtime.planetsById.get(colony.planetId);
    if (!fromPlanet) return "Planète inconnue";
    const jumps = jumpDistanceInUniverse(
      this.runtime.universe,
      fromPlanet.systemId,
      belt.systemId,
      this.portalLinks,
    );
    if (jumps < 0) return "Ceinture inaccessible";

    const resources = { ...colony.resources };
    for (const [res, amount] of Object.entries(OUTPOST_COST) as [
      ResourceId,
      number,
    ][]) {
      if (resources[res] < amount)
        return `Ressources insuffisantes (${amount} ${res})`;
    }
    for (const [res, amount] of Object.entries(OUTPOST_COST) as [
      ResourceId,
      number,
    ][]) {
      resources[res] -= amount;
    }
    empire.colonyMap.set(colony.id, { ...colony, resources });
    this.persistColony(empire.colonyMap.get(colony.id)!);
    this.insertMission(
      empire,
      "build_outpost",
      colonyId,
      beltId,
      transferDurationMs(jumps, this.balance) *
        empire.effects.transferSpeedMult,
    );
    this.notify();
    return null;
  }

  /** Production des avant-postes + entretien payé par la colonie propriétaire. */
  outpostsTick(empire: Empire): void {
    for (const [id, outpost] of empire.outpostMap) {
      const belt = this.runtime.beltsById.get(outpost.beltId);
      if (!belt) continue;
      const owner = empire.colonyMap.get(outpost.ownerColonyId);
      const upkeepPaid =
        !!owner && owner.resources.credits >= OUTPOST_UPKEEP_CREDITS;
      if (upkeepPaid && owner) {
        empire.colonyMap.set(owner.id, {
          ...owner,
          resources: {
            ...owner.resources,
            credits: owner.resources.credits - OUTPOST_UPKEEP_CREDITS,
          },
        });
      }
      const oreStock = outpostTick(
        outpost.oreStock,
        beltRichness(belt),
        upkeepPaid,
        empire.effects.outpostYieldMult,
      );
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
    toKind: "colony" | "tradingPost",
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
      fromSystemId =
        this.runtime.planetsById.get(from.planetId)?.systemId ?? "";
    } else {
      const outpost = empire.outpostMap.get(fromId);
      if (!outpost) return "Avant-poste inconnu";
      if (resource !== "ore") return "Un avant-poste n'exporte que du minerai";
      fromSystemId = this.runtime.beltsById.get(outpost.beltId)?.systemId ?? "";
    }

    let toSystemId: string;
    if (toKind === "colony") {
      const to = empire.colonyMap.get(toId);
      if (!to) return "Colonie destination inconnue";
      if (fromKind === "colony" && to.id === fromId)
        return "Origine et destination identiques";
      if (!(RESOURCES as readonly string[]).includes(resource))
        return "Ressource inconnue";
      toSystemId = this.runtime.planetsById.get(to.planetId)?.systemId ?? "";
    } else {
      const comptoir = this.runtime.tradingPostsById.get(toId);
      if (!comptoir) return "Comptoir inconnu";
      if (!empire.explored.has(comptoir.systemId))
        return "Comptoir non découvert";
      if (!(MARKET_RESOURCES as readonly string[]).includes(resource)) {
        return "Ressource non échangeable en comptoir";
      }
      toSystemId = comptoir.systemId;
    }

    if (
      jumpDistanceInUniverse(
        this.runtime.universe,
        fromSystemId,
        toSystemId,
        this.portalLinks,
      ) < 0
    ) {
      return "Destination inaccessible";
    }

    // Validation de la règle.
    if (rule.type === "maintain") {
      if (toKind === "tradingPost")
        return "Règle « maintenir » impossible vers un comptoir";
      if (!(rule.minAtDestination > 0) || rule.keepAtSource < 0)
        return "Règle invalide";
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
    const shipDefs = this.shipDefs;
    for (const [shipId, raw] of Object.entries(ships) as [ShipId, number][]) {
      const count = Math.floor(Number(raw));
      if (!Number.isFinite(count) || count <= 0) continue;
      if (!shipDefs[shipId]) return `Vaisseau inconnu : ${shipId}`;
      if ((idle[shipId] ?? 0) < count)
        return `Vaisseaux indisponibles : ${shipId}`;
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
    this.repo.insertRoute(route);
    this.notify();
    return null;
  }

  /** Action joueur : suspendre/reprendre une route (le cycle en cours se termine). */
  setRoutePaused(
    empire: Empire,
    routeId: string,
    paused: boolean,
  ): string | null {
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
    if (route.activeCycle)
      return "Cycle en cours : suspendez la route et attendez le retour";
    empire.routeMap.delete(routeId);
    this.repo.removeRoute(routeId);
    this.notify();
    return null;
  }

  /** Ordonnanceur : départs et résolutions de cycles à l'instant `t`. */
  processRoutes(empire: Empire, t: number): void {
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
        fromSystemId = this.runtime.planetsById.get(from.planetId)?.systemId;
      } else {
        const outpost = empire.outpostMap.get(current.fromId);
        if (!outpost) continue;
        sourceStock = outpost.oreStock;
        fromSystemId = this.runtime.beltsById.get(outpost.beltId)?.systemId;
      }
      if (!fromSystemId) continue;

      const toSystemId =
        current.toKind === "colony"
          ? this.runtime.planetsById.get(
              empire.colonyMap.get(current.toId)?.planetId ?? "",
            )?.systemId
          : this.runtime.tradingPostsById.get(current.toId)?.systemId;
      if (!toSystemId) continue;
      const jumps = jumpDistanceInUniverse(
        this.runtime.universe,
        fromSystemId,
        toSystemId,
        this.portalLinks,
      );
      if (jumps < 0) continue;

      // La règle « maintain » vise le stock utile à destination : sol + orbite.
      const destColony =
        current.toKind === "colony"
          ? empire.colonyMap.get(current.toId)
          : undefined;
      const destStock = destColony
        ? (destColony.resources[current.resource] ?? 0) +
          (destColony.orbitalResources[current.resource] ?? 0)
        : 0;
      const qty = routeCargoQuantity(
        current.rule,
        sourceStock,
        destStock,
        fleetCapacity(current.ships, this.capacityOf),
      );
      if (qty <= 0) continue;
      const fee = transferCostCredits(jumps, this.balance);
      if (owner.resources.credits < fee) continue;

      // Frais payés par le propriétaire, cargaison retirée à la source.
      empire.colonyMap.set(owner.id, {
        ...owner,
        resources: {
          ...owner.resources,
          credits: owner.resources.credits - fee,
        },
      });
      if (current.fromKind === "colony") {
        const from = empire.colonyMap.get(current.fromId)!;
        const loaded = takeFromOrbit(from, { [current.resource]: qty });
        if (!loaded) continue;
        empire.colonyMap.set(from.id, loaded);
        this.persistColony(loaded);
      } else {
        const outpost = empire.outpostMap.get(current.fromId)!;
        empire.outpostMap.set(outpost.id, {
          ...outpost,
          oreStock: outpost.oreStock - qty,
        });
      }
      this.persistColony(empire.colonyMap.get(owner.id)!);

      const duration =
        transferDurationMs(jumps, this.balance) *
        empire.effects.transferSpeedMult;
      const next: Route = {
        ...current,
        activeCycle: {
          departedAt: t,
          arrivesAt: t + duration,
          backAt: t + 2 * duration,
          carrying: qty,
        },
      };
      empire.routeMap.set(id, next);
      this.persistRoute(next);
    }
  }

  /** Livre la cargaison d'un cycle : stock colonie ou vente au spot en comptoir. */
  private deliverRouteCargo(
    empire: Empire,
    route: Route,
    carrying: number,
  ): void {
    if (route.toKind === "colony") {
      const to = empire.colonyMap.get(route.toId);
      if (!to) return;
      // Livraison en orbite : l'ascenseur de la destination fera descendre au sol.
      empire.colonyMap.set(
        to.id,
        deliverToOrbit(
          to,
          { [route.resource]: carrying },
          empire.effects,
          this.balance,
        ),
      );
      this.persistColony(empire.colonyMap.get(to.id)!);
    } else {
      const owner = empire.colonyMap.get(route.ownerColonyId);
      const result = this.market.resolveSaleAt(route.toId, {
        [route.resource]: carrying,
      });
      if (!result || !owner) return;
      const revenue = Math.floor(
        result.revenue *
          (1 + this.market.tradingPostRepBonus(empire, route.toId)),
      );
      this.market.addFactionRep(empire, route.toId, result.revenue);
      const resources = {
        ...owner.resources,
        credits: owner.resources.credits + revenue,
      };
      empire.colonyMap.set(owner.id, { ...owner, resources });
      this.persistColony(empire.colonyMap.get(owner.id)!);
    }
  }

  async loadRoutes(): Promise<void> {
    for (const route of await this.repo.loadRoutes()) {
      this.empireOfColony(route.ownerColonyId).routeMap.set(route.id, route);
    }
  }

  async loadOutposts(): Promise<void> {
    for (const outpost of await this.repo.loadOutposts()) {
      this.empireOfColony(outpost.ownerColonyId).outpostMap.set(
        outpost.id,
        outpost,
      );
    }
  }

  persistOutposts(empire: Empire): void {
    for (const outpost of empire.outpostMap.values()) {
      this.repo.saveOutpostStock(outpost);
    }
  }

  persistRoute(route: Route): void {
    this.repo.saveRoute(route);
  }

  /** Propriété des missions : seul chemin d'écriture de la table `missions`. */
  insertMission(
    empire: Empire,
    kind: Mission["kind"],
    fromColonyId: string,
    targetId: string,
    durationMs: number,
    extras: Pick<
      Mission,
      "cargo" | "budget" | "buyResource" | "capacity" | "contractId"
    > = {},
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
    this.repo.insertMission(mission);
  }

  /**
   * Résout les missions de l'empire arrivées à l'instant `t` : révélation, fondation,
   * commerce, portails, contrats, avant-postes. Marchés et portails restent partagés
   * (univers) ; les cas "sell"/"buy"/"deliver_contract" délèguent le calcul de prix à
   * `MarketService` (injecté), "contribute_gateway" à `GatewayService` (persist injecté).
   */
  resolveMissions(empire: Empire, t: number): void {
    for (const [id, mission] of empire.missionMap) {
      if (mission.arrivesAt > t) continue;
      switch (mission.kind) {
        case "probe":
          this.markExplored(empire, mission.targetId);
          break;
        case "colonize": {
          const planet = this.runtime.planetsById.get(mission.targetId);
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
              population: this.balance.newColonyPopulation,
              satisfaction: 60,
              // Le vaisseau colonial est démantelé en navette cargo.
              ships: { cargo_small: 1 },
              shipsBusy: [],
              shipQueue: [],
            });
            this.logger.info(`[game] colonie fondée sur ${planet.name}`);
          }
          break;
        }
        case "found_station": {
          const body = this.runtime.planetsById.get(mission.targetId);
          const alreadyFounded = [...empire.stationMap.values()].some(
            (s) => s.bodyId === mission.targetId,
          );
          if (body && !alreadyFounded) {
            this.insertStation(empire, {
              id: randomUUID(),
              ownerId: empire.id,
              bodyId: body.id,
              systemId: body.systemId,
              name: `Station ${body.name}`,
              resources: emptyStationResources(),
              zones: {},
              zoneQueue: [],
              installations: {},
              installQueue: [],
            });
            this.logger.info(`[game] station fondée en orbite de ${body.name}`);
          }
          break;
        }
        case "sell": {
          const colony = empire.colonyMap.get(mission.fromColonyId);
          const result = mission.cargo
            ? this.market.resolveSaleAt(mission.targetId, mission.cargo)
            : null;
          if (result && colony) {
            // Bonus de réputation : la faction paie mieux ses partenaires.
            const revenue = Math.floor(
              result.revenue *
                (1 + this.market.tradingPostRepBonus(empire, mission.targetId)),
            );
            this.market.addFactionRep(empire, mission.targetId, result.revenue);
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
          if (mission.buyResource && mission.budget) {
            const result = this.market.resolvePurchaseAt(
              mission.targetId,
              mission.buyResource as MarketResource,
              mission.budget,
              mission.capacity ?? Infinity,
            );
            if (result) {
              // Remise de réputation : une part du prix payé est restituée.
              const rebate = Math.floor(
                result.spent *
                  this.market.tradingPostRepBonus(empire, mission.targetId),
              );
              this.market.addFactionRep(empire, mission.targetId, result.spent);
              // Trajet retour, chargé + reliquat de budget (et remise) à rembourser.
              this.insertMission(
                empire,
                "buy_return",
                mission.fromColonyId,
                mission.targetId,
                mission.arrivesAt - mission.departedAt,
                {
                  cargo:
                    result.bought > 0
                      ? { [mission.buyResource]: result.bought }
                      : {},
                  budget: mission.budget - result.spent + rebate,
                },
                mission.arrivesAt,
              );
            }
          }
          break;
        }
        case "contribute_gateway": {
          const gateway = this.runtime.gatewayMap.get(mission.targetId);
          if (gateway && !gateway.active && mission.cargo) {
            const progress = { ...gateway.progress };
            const cost = gatewayCost(gateway.galaxyId);
            for (const [res, amount] of Object.entries(mission.cargo) as [
              ResourceId,
              number,
            ][]) {
              const cap = cost[res] ?? 0;
              progress[res] = Math.min(cap, (progress[res] ?? 0) + amount);
            }
            let next: Gateway = { ...gateway, progress };
            if (!next.activatesAt && gatewayCovered(next)) {
              // Coût couvert : le chantier final démarre.
              next = {
                ...next,
                activatesAt: mission.arrivesAt + GATEWAY_BUILD_MS,
              };
              this.logger.info(
                `[game] chantier final du portail vers ${next.galaxyId}`,
              );
            }
            this.runtime.gatewayMap.set(gateway.galaxyId, next);
            this.persistGateway(next);
          }
          break;
        }
        case "deliver_contract": {
          // Livraison cross-empire (chantier 14) : le cargo appartient à `empire`, la
          // colonie destinataire à l'émetteur du contrat — deux empires distincts.
          // Livraison à une FACTION (chantier 15) : pas de colonie émettrice — `colonyId`
          // porte alors l'id d'un comptoir, honoré au marché, standing à la clé.
          const contract = mission.contractId
            ? this.runtime.contractMap.get(mission.contractId)
            : undefined;
          const issuerEmpire = contract
            ? this.runtime.empires.get(contract.issuerId)
            : undefined;
          const cargoQty = Object.values(mission.cargo ?? {}).reduce(
            (s, n) => s + (n ?? 0),
            0,
          );
          if (contract && issuerEmpire && mission.cargo) {
            const destColony = issuerEmpire.colonyMap.get(contract.colonyId);
            if (destColony) {
              const delivered = deliverToOrbit(
                destColony,
                mission.cargo,
                issuerEmpire.effects,
                this.balance,
              );
              issuerEmpire.colonyMap.set(destColony.id, delivered);
              this.persistColony(delivered);
            }
          } else if (contract && mission.cargo) {
            const result = this.market.resolveSaleAt(
              contract.colonyId,
              mission.cargo,
            );
            if (result) {
              // `resolveSaleAt` ne sert ici qu'à faire bouger le stock/prix du comptoir —
              // sa recette est ignorée : l'accepteur est payé au prix FIXE du contrat.
              this.market.addFactionRep(
                empire,
                contract.colonyId,
                cargoQty * contract.pricePerUnit,
              );
            }
          }
          const payer = empire.colonyMap.get(mission.fromColonyId);
          if (contract && payer) {
            const payout = contractPayout(contract, cargoQty);
            const resources = {
              ...payer.resources,
              credits: payer.resources.credits + payout,
            };
            empire.colonyMap.set(payer.id, { ...payer, resources });
            this.persistColony(empire.colonyMap.get(payer.id)!);
          }
          break;
        }
        case "build_outpost": {
          const belt = this.runtime.beltsById.get(mission.targetId);
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
            this.repo.insertOutpost(outpost);
            this.logger.info(
              `[game] avant-poste minier fondé sur ${belt.name}`,
            );
          }
          break;
        }
        case "buy_return": {
          const colony = empire.colonyMap.get(mission.fromColonyId);
          if (colony) {
            // L'achat revient en orbite ; seuls les crédits atterrissent directement.
            const delivered = deliverToOrbit(
              colony,
              mission.cargo ?? {},
              empire.effects,
              this.balance,
            );
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
      this.repo.removeMission(id);
    }
  }

  /** Livre les convois arrivés à l'instant `t` (surplus au-delà du stockage perdu). */
  deliverTransfers(empire: Empire, t: number): void {
    for (const [id, transfer] of empire.transferMap) {
      if (transfer.arrivesAt > t) continue;
      const to = empire.colonyMap.get(transfer.toColonyId);
      if (to) {
        // Le convoi débarque EN ORBITE ; l'ascenseur redescendra selon les règles locales.
        empire.colonyMap.set(
          to.id,
          deliverToOrbit(to, transfer.resources, empire.effects, this.balance),
        );
      }
      empire.transferMap.delete(id);
      this.repo.removeTransfer(id);
    }
  }

  async loadTransfers(): Promise<void> {
    for (const transfer of await this.repo.loadTransfers()) {
      this.empireOfColony(transfer.fromColonyId).transferMap.set(
        transfer.id,
        transfer,
      );
    }
  }

  async loadMissions(): Promise<void> {
    for (const mission of await this.repo.loadMissions()) {
      this.empireOfColony(mission.fromColonyId).missionMap.set(
        mission.id,
        mission,
      );
    }
  }

  /** Décalages d'horodatage (dev-fastforward) — les tables restent possédées ici. */
  persistTransferTimes(transfer: Transfer): void {
    this.repo.saveTransferTimes(transfer);
  }

  persistMissionTimes(mission: Mission): void {
    this.repo.saveMissionTimes(mission);
  }

  /**
   * Outil de dev uniquement : décale vers le passé les timers de son domaine — convois,
   * missions, routes automatiques, réservations de vaisseaux (`shipsBusy`) — pour qu'un
   * `devFastForward` les fasse arriver à échéance. Les colonies ne sont volontairement
   * pas persistées ici : `devFastForward` ne le faisait pas non plus avant l'extraction.
   */
  shiftTime(empire: Empire, deltaMs: number): void {
    for (const [id, colony] of empire.colonyMap) {
      if (colony.shipsBusy.length === 0) continue;
      empire.colonyMap.set(id, {
        ...colony,
        shipsBusy: colony.shipsBusy.map((b) => ({
          ...b,
          freeAt: b.freeAt - deltaMs,
        })),
      });
    }
    for (const [id, transfer] of empire.transferMap) {
      empire.transferMap.set(id, {
        ...transfer,
        departedAt: transfer.departedAt - deltaMs,
        arrivesAt: transfer.arrivesAt - deltaMs,
      });
    }
    for (const [id, mission] of empire.missionMap) {
      empire.missionMap.set(id, {
        ...mission,
        departedAt: mission.departedAt - deltaMs,
        arrivesAt: mission.arrivesAt - deltaMs,
      });
    }
    for (const [id, route] of empire.routeMap) {
      if (!route.activeCycle) continue;
      empire.routeMap.set(id, {
        ...route,
        activeCycle: {
          ...route.activeCycle,
          departedAt: route.activeCycle.departedAt - deltaMs,
          arrivesAt: route.activeCycle.arrivesAt - deltaMs,
          backAt: route.activeCycle.backAt - deltaMs,
        },
      });
      this.persistRoute(empire.routeMap.get(id)!);
    }
    for (const transfer of empire.transferMap.values()) {
      this.persistTransferTimes(transfer);
    }
    for (const mission of empire.missionMap.values()) {
      this.persistMissionTimes(mission);
    }
  }
}
