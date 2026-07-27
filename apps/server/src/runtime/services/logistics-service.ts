import {
  beltRichness,
  clampContractDuration,
  contractAcceptable,
  contractEscrow,
  contractPayout,
  convoyCapacity,
  convoyDurationMs,
  convoyFees,
  convoyFuel,
  createRng,
  decideColonyEconomy,
  deliverToOrbit,
  embargoBlocks,
  emptyOrbital,
  emptyResources,
  FACTION_CONTRACT_DURATION_MS,
  FACTION_CONTRACT_PRICE_MULT,
  FACTION_CONTRACT_QUANTITY_MAX,
  FACTION_CONTRACT_QUANTITY_MIN,
  FACTIONS,
  factionTick,
  fleetCapacity,
  gatewayCost,
  GATEWAY_BUILD_MS,
  GATEWAY_COST,
  gatewayCovered,
  gatewayLinks,
  gatewayRemaining,
  galaxyParentIndex,
  idleShips,
  isContractExpired,
  jumpDistanceInUniverse,
  legacyCapacity,
  MARKET_RESOURCES,
  marketTick,
  initialStocks,
  MAX_OPEN_CONTRACTS_PER_EMPIRE,
  moodRebateBonus,
  NEW_COLONY_ORBITAL,
  NEW_COLONY_POPULATION,
  NEW_COLONY_RESOURCES,
  NPC_CONTRACT_DURATION_MS,
  NPC_CONTRACT_PRICE_MULT,
  OUTPOST_COST,
  OUTPOST_UPKEEP_CREDITS,
  outpostTick,
  pickShip,
  randInt,
  REP_PER_CREDIT,
  repBonus,
  resolvePurchase,
  resolveSale,
  RESOURCES,
  routeCargoQuantity,
  SHIPS,
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
  type Gateway,
  type LegacyShipId,
  type LiftRule,
  type MarketResource,
  type MiningOutpost,
  type Mission,
  type PriceContext,
  type ResourceId,
  type Rng,
  type Route,
  type RouteRule,
  type ShipId,
  type TradeStation,
  type Transfer,
  type WorldEventKind,
} from "@spacesim/shared";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, schema } from "../../db/index.js";
import type { Empire } from "../../empire.js";
import type { GameRuntime } from "../game-runtime.js";
import type { Logger } from "../logger.js";

/**
 * Logistique, marché, contrats et portails : convois manuels, routes automatiques,
 * commerce en station (joueur et PNJ), contrats de fourniture et chantiers de portail.
 * Les dépendances vers d'autres domaines (colonie, faction, colonisation, exploration)
 * sont injectées comme callbacks étroits fournis par `GameEngine` — pas de référence
 * directe à un autre service, pour ne pas figer l'ordre d'extraction.
 */
export class LogisticsService {
  constructor(
    private readonly runtime: GameRuntime,
    private readonly notify: () => void,
    private readonly logger: Logger,
    private readonly persistColony: (colony: Colony) => void,
    private readonly persistFactionState: (state: FactionState) => void,
    private readonly worldEventKindsOnGalaxy: (galaxyId: string) => WorldEventKind[],
    private readonly insertColony: (empire: Empire, colony: Colony) => void,
    private readonly markExplored: (empire: Empire, systemId: string) => void,
    private readonly empireOfColony: (colonyId: string) => Empire,
  ) {}

  private get portalLinks(): [string, string][] {
    return gatewayLinks(this.runtime.universe, [...this.runtime.gatewayMap.values()]);
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

  /**
   * Réserve le plus gros cargo disponible de la colonie jusqu'à `busyUntil`.
   * Retourne null si aucun vaisseau libre.
   */
  reserveShip(
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
      capacity: legacyCapacity(shipId),
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
      if (!SHIPS[shipId as LegacyShipId]) return null;
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
    if (!(RESOURCES as readonly string[]).includes(resource))
      return `Ressource inconnue : ${resource}`;
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
    const reserved = convoy
      ? this.reserveConvoy(
          empire,
          loaded,
          convoy,
          now + 2 * convoyDurationMs(jumps, convoy) * speed,
        )
      : (() => {
          const one = this.reserveShip(empire, loaded, now + 2 * transferDurationMs(jumps) * speed);
          return one
            ? { colony: one.colony, ships: { [one.shipId]: 1 }, capacity: one.capacity }
            : null;
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
        gameId: this.runtime.clock.id,
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

  /** Action joueur : fonder un avant-poste minier sur une ceinture. */
  buildOutpost(empire: Empire, colonyId: string, beltId: string): string | null {
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
  outpostsTick(empire: Empire): void {
    for (const [id, outpost] of empire.outpostMap) {
      const belt = this.runtime.beltsById.get(outpost.beltId);
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
      fromSystemId = this.runtime.planetsById.get(from.planetId)?.systemId ?? "";
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
      if (fromKind === "colony" && to.id === fromId) return "Origine et destination identiques";
      if (!(RESOURCES as readonly string[]).includes(resource)) return "Ressource inconnue";
      toSystemId = this.runtime.planetsById.get(to.planetId)?.systemId ?? "";
    } else {
      const station = this.runtime.stationsById.get(toId);
      if (!station) return "Station inconnue";
      if (!empire.explored.has(station.systemId)) return "Station non découverte";
      if (!(MARKET_RESOURCES as readonly string[]).includes(resource)) {
        return "Ressource non échangeable en station";
      }
      toSystemId = station.systemId;
    }

    if (
      jumpDistanceInUniverse(this.runtime.universe, fromSystemId, toSystemId, this.portalLinks) < 0
    ) {
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
      if (!SHIPS[shipId as LegacyShipId]) return `Vaisseau inconnu : ${shipId}`;
      if ((idle[shipId] ?? 0) < count) return `Vaisseaux indisponibles : ${shipId}`;
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
        gameId: this.runtime.clock.id,
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
          ? this.runtime.planetsById.get(empire.colonyMap.get(current.toId)?.planetId ?? "")
              ?.systemId
          : this.runtime.stationsById.get(current.toId)?.systemId;
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
        current.toKind === "colony" ? empire.colonyMap.get(current.toId) : undefined;
      const destStock = destColony
        ? (destColony.resources[current.resource] ?? 0) +
          (destColony.orbitalResources[current.resource] ?? 0)
        : 0;
      const qty = routeCargoQuantity(
        current.rule,
        sourceStock,
        destStock,
        fleetCapacity(current.ships),
      );
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

  /** Livre la cargaison d'un cycle : stock colonie ou vente au spot en station. */
  private deliverRouteCargo(empire: Empire, route: Route, carrying: number): void {
    if (route.toKind === "colony") {
      const to = empire.colonyMap.get(route.toId);
      if (!to) return;
      // Livraison en orbite : l'ascenseur de la destination fera descendre au sol.
      empire.colonyMap.set(
        to.id,
        deliverToOrbit(to, { [route.resource]: carrying }, empire.effects),
      );
      this.persistColony(empire.colonyMap.get(to.id)!);
    } else {
      const stocks = this.runtime.marketMap.get(route.toId);
      const owner = empire.colonyMap.get(route.ownerColonyId);
      if (!stocks || !owner) return;
      const result = resolveSale(
        stocks,
        { [route.resource]: carrying },
        this.priceContextOf(route.toId),
      );
      this.runtime.marketMap.set(route.toId, result.stocks);
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
    const station = this.runtime.stationsById.get(stationId);
    if (!station) return undefined;
    return {
      stationId,
      galaxyIndex: this.runtime.galaxyIndexOfSystem.get(station.systemId) ?? 0,
      factionId: station.factionId,
    };
  }

  /** Réputation gagnée auprès de la faction de la station, au volume de crédits échangé. */
  private addFactionRep(empire: Empire, stationId: string, creditsExchanged: number): void {
    const station = this.runtime.stationsById.get(stationId);
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
   * Bonus commercial appliqué en station : remise de réputation + marge des chartes
   * commerciales (chantier 12) + bonus d'humeur de faction (chantier 15, boom) + effet
   * d'un événement de monde régional (chantier 17, crise/ruée). Majore les ventes,
   * réduit les achats.
   */
  private stationRepBonus(empire: Empire, stationId: string): number {
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
  private stationEmbargoed(empire: Empire, stationId: string): boolean {
    const station = this.runtime.stationsById.get(stationId);
    if (!station) return false;
    const mood = this.runtime.factionStateMap.get(station.factionId)?.mood ?? "neutral";
    return embargoBlocks(mood, empire.factionRep[station.factionId] ?? 0);
  }

  loadRoutes(): void {
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

  loadOutposts(): void {
    for (const row of db.select().from(schema.outposts).all()) {
      this.empireOfColony(row.ownerColonyId).outpostMap.set(row.id, {
        id: row.id,
        beltId: row.beltId,
        ownerColonyId: row.ownerColonyId,
        oreStock: row.oreStock,
      });
    }
  }

  persistOutposts(empire: Empire): void {
    for (const outpost of empire.outpostMap.values()) {
      db.update(schema.outposts)
        .set({ oreStock: outpost.oreStock })
        .where(eq(schema.outposts.id, outpost.id))
        .run();
    }
  }

  persistRoute(route: Route): void {
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
    const gateway = this.runtime.gatewayMap.get(galaxyId);
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

    const fromPlanet = this.runtime.planetsById.get(colony.planetId);
    if (!fromPlanet) return "Planète inconnue";
    // Le chantier se mène depuis l'ancrage de la galaxie PARENTE (le versant proche du
    // trou de ver) : on ne peut donc financer un portail que si l'on atteint déjà sa
    // voisine — l'expansion se fait de proche en proche.
    const childIndex = this.runtime.universe.galaxies.findIndex((g) => g.id === galaxyId);
    const parentIndex = galaxyParentIndex(this.runtime.universe, childIndex);
    const anchorId =
      parentIndex === null
        ? this.runtime.universe.galaxies[0]!.anchorSystemId
        : this.runtime.universe.galaxies[parentIndex]!.anchorSystemId;
    const jumps = jumpDistanceInUniverse(
      this.runtime.universe,
      fromPlanet.systemId,
      anchorId,
      this.portalLinks,
    );
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

    const openCount = [...this.runtime.contractMap.values()].filter(
      (c) => c.issuerId === empire.id && c.status === "open",
    ).length;
    if (openCount >= MAX_OPEN_CONTRACTS_PER_EMPIRE) return "Trop de contrats ouverts (dix au plus)";

    const escrow = contractEscrow(qty, price);
    if (colony.resources.credits < escrow) return `Crédits insuffisants (séquestre : ${escrow})`;

    const planet = this.runtime.planetsById.get(colony.planetId);
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
    this.runtime.contractMap.set(contract.id, contract);
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
    const contract = this.runtime.contractMap.get(contractId);
    if (!contract) return "Contrat inconnu";
    if (contract.issuerId === empire.id) return "Impossible d'accepter son propre contrat";

    const now = Date.now();
    const qty = Math.floor(Number(quantity));
    if (!contractAcceptable(contract, qty, now)) return "Contrat indisponible pour cette quantité";

    const fromPlanet = this.runtime.planetsById.get(colony.planetId);
    if (!fromPlanet) return "Planète inconnue";
    const jumps = jumpDistanceInUniverse(
      this.runtime.universe,
      fromPlanet.systemId,
      contract.systemId,
      this.portalLinks,
    );
    if (jumps < 0) return "Colonie destinataire inaccessible";
    const portals = this.portalsCrossed(fromPlanet.systemId, contract.systemId);

    const cargo: Partial<Record<ResourceId, number>> = { [contract.resource]: qty };
    const loaded = takeFromOrbit(colony, cargo);
    if (!loaded) return `Stock orbital insuffisant : ${contract.resource}`;

    const speed = empire.effects.transferSpeedMult;
    const one = this.reserveShip(empire, loaded, now + 2 * transferDurationMs(jumps) * speed);
    if (!one) return "Convoi indisponible : vaisseaux manquants";
    const reserved = { colony: one.colony, ships: { [one.shipId]: 1 }, capacity: one.capacity };
    if (qty > reserved.capacity)
      return `Cargaison trop lourde pour ce convoi (soute : ${reserved.capacity})`;

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
    this.runtime.contractMap.set(contract.id, nextContract);
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
    const contract = this.runtime.contractMap.get(contractId);
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
    this.runtime.contractMap.set(contract.id, next);
    this.persistContract(next);
    this.notify();
    return null;
  }

  /**
   * Ouvre un chantier de portail pour chaque galaxie lointaine qui n'en a pas encore.
   * Idempotent : rejoué après chaque extension de l'univers (chantier 9).
   */
  initGateways(): void {
    for (const galaxy of this.runtime.universe.galaxies.slice(1)) {
      if (this.runtime.gatewayMap.has(galaxy.id)) continue;
      const gateway: Gateway = {
        galaxyId: galaxy.id,
        progress: {},
        activatesAt: null,
        active: false,
      };
      this.runtime.gatewayMap.set(galaxy.id, gateway);
      db.insert(schema.gateways)
        .values({
          galaxyId: galaxy.id,
          gameId: this.runtime.clock.id,
          progress: "{}",
          activatesAt: null,
          active: 0,
        })
        .run();
    }
  }

  loadGateways(): void {
    for (const row of db.select().from(schema.gateways).all()) {
      this.runtime.gatewayMap.set(row.galaxyId, {
        galaxyId: row.galaxyId,
        progress: JSON.parse(row.progress),
        activatesAt: row.activatesAt,
        active: row.active === 1,
      });
    }
  }

  persistGateway(gateway: Gateway): void {
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
  resolveGateways(t: number): void {
    for (const [id, gateway] of this.runtime.gatewayMap) {
      if (gateway.active || !gateway.activatesAt || gateway.activatesAt > t) continue;
      this.runtime.gatewayMap.set(id, { ...gateway, active: true });
      this.persistGateway(this.runtime.gatewayMap.get(id)!);
      this.logger.info(`[game] portail actif vers ${id}`);
    }
  }

  loadContracts(): void {
    for (const row of db.select().from(schema.contracts).all()) {
      this.runtime.contractMap.set(row.id, {
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
        gameId: this.runtime.clock.id,
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
  persistContract(contract: Contract): void {
    db.update(schema.contracts)
      .set({ remaining: contract.remaining, status: contract.status, deadline: contract.deadline })
      .where(eq(schema.contracts.id, contract.id))
      .run();
  }

  /** Expire les contrats dépassés et rembourse le séquestre du reliquat non honoré. */
  resolveContracts(t: number): void {
    for (const [id, contract] of this.runtime.contractMap) {
      if (contract.status !== "open" || !isContractExpired(contract, t)) continue;
      const issuer = this.runtime.empires.get(contract.issuerId);
      const colony = issuer?.colonyMap.get(contract.colonyId);
      if (issuer && colony) {
        const refund = contractEscrow(contract.remaining, contract.pricePerUnit);
        const resources = { ...colony.resources, credits: colony.resources.credits + refund };
        issuer.colonyMap.set(colony.id, { ...colony, resources });
        this.persistColony(issuer.colonyMap.get(colony.id)!);
      }
      const next: Contract = { ...contract, status: "expired" };
      this.runtime.contractMap.set(id, next);
      this.persistContract(next);
    }
  }

  insertMission(
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
        gameId: this.runtime.clock.id,
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
              population: NEW_COLONY_POPULATION,
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
        case "sell": {
          const stocks = this.runtime.marketMap.get(mission.targetId);
          const colony = empire.colonyMap.get(mission.fromColonyId);
          if (stocks && colony && mission.cargo) {
            const result = resolveSale(
              stocks,
              mission.cargo,
              this.priceContextOf(mission.targetId),
            );
            this.runtime.marketMap.set(mission.targetId, result.stocks);
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
          const stocks = this.runtime.marketMap.get(mission.targetId);
          if (stocks && mission.buyResource && mission.budget) {
            const result = resolvePurchase(
              stocks,
              mission.buyResource as MarketResource,
              mission.budget,
              mission.capacity ?? Infinity,
              this.priceContextOf(mission.targetId),
            );
            this.runtime.marketMap.set(mission.targetId, result.stocks);
            this.persistMarket(mission.targetId);
            // Remise de réputation : une part du prix payé est restituée.
            const rebate = Math.floor(
              result.spent * this.stationRepBonus(empire, mission.targetId),
            );
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
          const gateway = this.runtime.gatewayMap.get(mission.targetId);
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
              this.logger.info(`[game] chantier final du portail vers ${next.galaxyId}`);
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
          const issuerEmpire = contract ? this.runtime.empires.get(contract.issuerId) : undefined;
          const cargoQty = Object.values(mission.cargo ?? {}).reduce((s, n) => s + (n ?? 0), 0);
          if (contract && issuerEmpire && mission.cargo) {
            const destColony = issuerEmpire.colonyMap.get(contract.colonyId);
            if (destColony) {
              const delivered = deliverToOrbit(destColony, mission.cargo, issuerEmpire.effects);
              issuerEmpire.colonyMap.set(destColony.id, delivered);
              this.persistColony(delivered);
            }
          } else if (contract && mission.cargo) {
            const stocks = this.runtime.marketMap.get(contract.colonyId);
            if (stocks) {
              // `resolveSale` ne sert ici qu'à faire bouger le stock/prix du comptoir —
              // sa recette est ignorée : l'accepteur est payé au prix FIXE du contrat.
              const result = resolveSale(
                stocks,
                mission.cargo,
                this.priceContextOf(contract.colonyId),
              );
              this.runtime.marketMap.set(contract.colonyId, result.stocks);
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
            db.insert(schema.outposts)
              .values({ ...outpost, gameId: this.runtime.clock.id, createdAt: Date.now() })
              .run();
            this.logger.info(`[game] avant-poste minier fondé sur ${belt.name}`);
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
  initMarkets(): void {
    for (const station of this.runtime.stationsById.values()) {
      if (this.runtime.marketMap.has(station.id)) continue;
      const stocks = initialStocks(createRng(`${this.runtime.clock.seed}-station-${station.id}`));
      this.runtime.marketMap.set(station.id, stocks);
      db.insert(schema.stationStates)
        .values({
          stationId: station.id,
          gameId: this.runtime.clock.id,
          stocks: JSON.stringify(stocks),
        })
        .run();
    }
  }

  loadMarkets(): void {
    for (const row of db.select().from(schema.stationStates).all()) {
      this.runtime.marketMap.set(row.stationId, JSON.parse(row.stocks));
    }
  }

  private persistMarket(stationId: string): void {
    const stocks = this.runtime.marketMap.get(stationId);
    if (!stocks) return;
    db.update(schema.stationStates)
      .set({ stocks: JSON.stringify(stocks) })
      .where(eq(schema.stationStates.stationId, stationId))
      .run();
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

  /** Livre les convois arrivés à l'instant `t` (surplus au-delà du stockage perdu). */
  deliverTransfers(empire: Empire, t: number): void {
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

  loadTransfers(): void {
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

  loadMissions(): void {
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
}
