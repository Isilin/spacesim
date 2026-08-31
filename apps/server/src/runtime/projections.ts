import {
  EMPIRE_EVENT_PAGE,
  findGalaxyOfSystem,
  hasBlueprintMarket,
  hasResourceMarket,
  MARKET_RESOURCES,
  redactUniverse,
  relationKey,
  sitesOfSystem,
  type EmpireEvent,
  type ForeignColony,
  type ForeignFleet,
  type ForeignStation,
  type LeaderboardEntry,
  type MarketResource,
  type Objective,
  type PirateLair,
  type Relation,
  type RelationProposal,
  type RelationState,
  type ResourceId,
  type Station,
  type TradingPostMarket,
  type Territory,
  type Universe,
} from "@spacesim/shared";
import type { EmpireSnapshot } from "@spacesim/protocol";
import type { Empire } from "../empire.js";
import { installationDefsFromContent } from "./content/content-service.js";
import type { GameRuntime } from "./game-runtime.js";

/** Stock d'une station restreint aux ressources échangeables (chantier 25) — jamais le
 *  reste (matériaux de construction du propriétaire, non exposés à un visiteur). */
function tradableStocksOf(
  station: Station,
): Partial<Record<ResourceId, number>> {
  const stocks: Partial<Record<MarketResource, number>> = {};
  for (const res of MARKET_RESOURCES) stocks[res] = station.resources[res];
  return stocks;
}

/**
 * Vues en lecture seule d'un `GameRuntime`, redactées au brouillard d'un empire. Aucune
 * mutation ici : ce module ne fait que composer l'état déjà tenu par `GameRuntime` et les
 * `Empire`, exactement comme le faisait `GameEngine` avant l'extraction.
 */

/** Univers redacté au brouillard de l'empire (planètes masquées hors systèmes explorés). */
export function clientUniverseForEmpire(
  runtime: GameRuntime,
  empire: Empire,
): Universe {
  return redactUniverse(runtime.universe, empire.explored);
}

/** Marchés des comptoirs situées dans les systèmes explorés par l'empire. */
export function marketsForEmpire(
  runtime: GameRuntime,
  empire: Empire,
): TradingPostMarket[] {
  const markets: TradingPostMarket[] = [];
  for (const [tradingPostId, stocks] of runtime.marketMap) {
    const comptoir = runtime.tradingPostsById.get(tradingPostId);
    if (comptoir && empire.explored.has(comptoir.systemId)) {
      markets.push({ tradingPostId, stocks });
    }
  }
  return markets;
}

/** Repaires PNJ visibles dans le brouillard de l'empire. */
export function pirateLairsForEmpire(
  runtime: GameRuntime,
  empire: Empire,
): PirateLair[] {
  return [...runtime.lairMap.values()].filter((l) =>
    empire.explored.has(l.systemId),
  );
}

/** Relations impliquant l'empire (chantier 16) — jamais celles entre deux tiers. */
export function relationsForEmpire(
  runtime: GameRuntime,
  empire: Empire,
): Relation[] {
  return [...runtime.relationMap.values()].filter(
    (r) => r.empireA === empire.id || r.empireB === empire.id,
  );
}

/** Propositions en attente où l'empire est émetteur ou destinataire (chantier 16). */
export function proposalsForEmpire(
  runtime: GameRuntime,
  empire: Empire,
): RelationProposal[] {
  return [...runtime.proposalMap.values()].filter(
    (p) => p.fromEmpireId === empire.id || p.toEmpireId === empire.id,
  );
}

/** Objectifs éphémères personnels de l'empire (chantier 17). */
export function objectivesForEmpire(
  runtime: GameRuntime,
  empire: Empire,
): Objective[] {
  return [...runtime.objectiveMap.values()].filter(
    (o) => o.empireId === empire.id,
  );
}

/**
 * Systèmes revendiqués visibles d'un empire (chantier 7e) : ses propres claims + ceux
 * des autres empires situés dans son brouillard, colorés par propriétaire.
 */
/**
 * Journal d'un empire, du plus RÉCENT au plus ancien et tronqué à `EMPIRE_EVENT_PAGE`
 * (chantier 32.3). L'ordre est inversé ici et pas au stockage : la RAM garde l'ordre
 * chronologique, seul naturel pour l'ajout et la purge, alors que la lecture veut
 * toujours les dernières nouvelles d'abord.
 */
export function eventsForEmpire(
  runtime: GameRuntime,
  empire: Empire,
): EmpireEvent[] {
  const list = runtime.eventsByEmpire.get(empire.id) ?? [];
  return list.slice(-EMPIRE_EVENT_PAGE).reverse();
}

/** Non-lus sur le TOTAL et non sur la page transmise — c'est le digest d'absence. */
export function unreadEventCount(runtime: GameRuntime, empire: Empire): number {
  const list = runtime.eventsByEmpire.get(empire.id) ?? [];
  let count = 0;
  for (const event of list) if (event.readAt === null) count++;
  return count;
}

export function territoriesForEmpire(
  runtime: GameRuntime,
  empire: Empire,
): Territory[] {
  const out: Territory[] = [];
  for (const other of runtime.empires.values()) {
    const own = other.id === empire.id;
    for (const systemId of other.claimedSystemIds) {
      if (!own && !empire.explored.has(systemId)) continue;
      out.push({ systemId, ownerId: other.id, ownerColor: other.color });
    }
  }
  return out;
}

/** Lecture directe de `relationMap` (neutre par défaut) — pas de règle de jeu ici. */
function relationStateBetween(
  runtime: GameRuntime,
  a: string,
  b: string,
): RelationState {
  return runtime.relationMap.get(relationKey(a, b))?.state ?? "neutral";
}

/** Classement public de tous les empires, trié par score composite décroissant. */
export function leaderboardForEmpire(
  runtime: GameRuntime,
  viewer: Empire,
): LeaderboardEntry[] {
  const rows: LeaderboardEntry[] = [];
  for (const empire of runtime.empires.values()) {
    const colonies = [...empire.colonyMap.values()];
    const population = colonies.reduce((s, c) => s + c.population, 0);
    const claimed = empire.claimedSystemIds.length;
    const score =
      colonies.length * 100 +
      claimed * 40 +
      Math.floor(population) +
      empire.influence / 10;
    rows.push({
      id: empire.id,
      name: empire.name,
      color: empire.color,
      colonies: colonies.length,
      population: Math.floor(population),
      claimed,
      influence: Math.floor(empire.influence),
      score: Math.round(score),
      relation:
        empire.id === viewer.id
          ? "neutral"
          : relationStateBetween(runtime, viewer.id, empire.id),
    });
  }
  return rows.sort((a, b) => b.score - a.score);
}

/**
 * Présence étrangère visible d'un empire : flottes et colonies des AUTRES empires
 * situées dans un système de son brouillard (chantier 7d — cible PvP potentielle).
 */
export function foreignPresenceForEmpire(
  runtime: GameRuntime,
  empire: Empire,
): {
  foreignFleets: ForeignFleet[];
  foreignColonies: ForeignColony[];
  foreignStations: ForeignStation[];
} {
  const foreignFleets: ForeignFleet[] = [];
  const foreignColonies: ForeignColony[] = [];
  const foreignStations: ForeignStation[] = [];
  const installations = installationDefsFromContent(
    runtime.content.installations,
  );
  for (const other of runtime.empires.values()) {
    if (other.id === empire.id) continue;
    for (const fleet of other.fleetMap.values()) {
      if (!empire.explored.has(fleet.systemId)) continue;
      foreignFleets.push({
        id: fleet.id,
        ownerId: other.id,
        ownerName: other.name,
        ownerColor: other.color,
        name: fleet.name,
        systemId: fleet.systemId,
        ships: fleet.ships,
      });
    }
    for (const colony of other.colonyMap.values()) {
      const systemId = runtime.planetsById.get(colony.planetId)?.systemId;
      if (!systemId || !empire.explored.has(systemId)) continue;
      foreignColonies.push({
        id: colony.id,
        ownerId: other.id,
        ownerName: other.name,
        ownerColor: other.color,
        name: colony.name,
        systemId,
        planetId: colony.planetId,
      });
    }
    for (const station of other.stationMap.values()) {
      if (!empire.explored.has(station.systemId)) continue;
      const resourceMarket = hasResourceMarket(station, installations);
      const blueprintMarket = hasBlueprintMarket(station, installations);
      foreignStations.push({
        id: station.id,
        ownerId: other.id,
        ownerName: other.name,
        ownerColor: other.color,
        name: station.name,
        systemId: station.systemId,
        bodyId: station.bodyId,
        ...((resourceMarket || blueprintMarket) && {
          market: {
            hasResourceMarket: resourceMarket,
            hasBlueprintMarket: blueprintMarket,
            access: station.marketAccess,
            taxRate: station.marketTaxRate,
            tradableStocks: tradableStocksOf(station),
          },
        }),
      });
    }
  }
  return { foreignFleets, foreignColonies, foreignStations };
}

/**
 * Compose le snapshot (forme externe WS, `EmpireSnapshot`) d'un empire : ses entités,
 * l'horloge et les PNJ partagés, redactés à son brouillard.
 */
export function snapshotForEmpire(
  runtime: GameRuntime,
  empire: Empire,
): EmpireSnapshot {
  const { foreignFleets, foreignColonies, foreignStations } =
    foreignPresenceForEmpire(runtime, empire);
  return {
    game: empire.toGameState(runtime.clock),
    colonies: [...empire.colonyMap.values()],
    stations: [...empire.stationMap.values()],
    transfers: [...empire.transferMap.values()],
    missions: [...empire.missionMap.values()],
    exploredSystemIds: [...empire.explored],
    scannedSystemIds: [...empire.scanned],
    // Seuls les sites des systèmes scannés : un site non découvert n'existe pas encore
    // pour cet empire, et le fuir dans le snapshot le rendrait visible sans le scan.
    sites: [...empire.scanned].flatMap((systemId) => {
      const system = runtime.systemsById.get(systemId);
      if (!system) return [];
      const galaxy = findGalaxyOfSystem(runtime.universe, systemId);
      return sitesOfSystem(
        runtime.clock.seed,
        system,
        galaxy?.depositBonus ?? 1,
      );
    }),
    markets: marketsForEmpire(runtime, empire),
    routes: [...empire.routeMap.values()],
    outposts: [...empire.outpostMap.values()],
    gateways: [...runtime.gatewayMap.values()],
    fleets: [...empire.fleetMap.values()],
    blueprints: [...empire.blueprintMap.values()],
    pirateLairs: pirateLairsForEmpire(runtime, empire),
    battles: runtime.battleLog,
    foreignFleets,
    foreignColonies,
    foreignStations,
    leaderboard: leaderboardForEmpire(runtime, empire),
    territories: territoriesForEmpire(runtime, empire),
    contracts: [...runtime.contractMap.values()],
    factionStates: [...runtime.factionStateMap.values()],
    relations: relationsForEmpire(runtime, empire),
    proposals: proposalsForEmpire(runtime, empire),
    objectives: objectivesForEmpire(runtime, empire),
    events: eventsForEmpire(runtime, empire),
    unreadEventCount: unreadEventCount(runtime, empire),
    worldEvents: [...runtime.worldEventMap.values()],
    // L'univers n'est réémis qu'en cas de changement : nouvelle exploration (brouillard
    // levé) ou extension de l'univers (galaxies apparues).
    ...(empire.explorationDirty || empire.universeDirty
      ? { universe: clientUniverseForEmpire(runtime, empire) }
      : {}),
  };
}
