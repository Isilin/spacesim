import {
  redactUniverse,
  relationKey,
  type ForeignColony,
  type ForeignFleet,
  type LeaderboardEntry,
  type Objective,
  type PirateLair,
  type Relation,
  type RelationProposal,
  type RelationState,
  type TradingPostMarket,
  type Territory,
  type Universe,
} from "@spacesim/shared";
import type { EmpireSnapshot } from "@spacesim/protocol";
import type { Empire } from "../empire.js";
import type { GameRuntime } from "./game-runtime.js";

/**
 * Vues en lecture seule d'un `GameRuntime`, redactées au brouillard d'un empire. Aucune
 * mutation ici : ce module ne fait que composer l'état déjà tenu par `GameRuntime` et les
 * `Empire`, exactement comme le faisait `GameEngine` avant l'extraction.
 */

/** Univers redacté au brouillard de l'empire (planètes masquées hors systèmes explorés). */
export function clientUniverseForEmpire(runtime: GameRuntime, empire: Empire): Universe {
  return redactUniverse(runtime.universe, empire.explored);
}

/** Marchés des comptoirs situées dans les systèmes explorés par l'empire. */
export function marketsForEmpire(runtime: GameRuntime, empire: Empire): TradingPostMarket[] {
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
export function pirateLairsForEmpire(runtime: GameRuntime, empire: Empire): PirateLair[] {
  return [...runtime.lairMap.values()].filter((l) => empire.explored.has(l.systemId));
}

/** Relations impliquant l'empire (chantier 16) — jamais celles entre deux tiers. */
export function relationsForEmpire(runtime: GameRuntime, empire: Empire): Relation[] {
  return [...runtime.relationMap.values()].filter(
    (r) => r.empireA === empire.id || r.empireB === empire.id,
  );
}

/** Propositions en attente où l'empire est émetteur ou destinataire (chantier 16). */
export function proposalsForEmpire(runtime: GameRuntime, empire: Empire): RelationProposal[] {
  return [...runtime.proposalMap.values()].filter(
    (p) => p.fromEmpireId === empire.id || p.toEmpireId === empire.id,
  );
}

/** Objectifs éphémères personnels de l'empire (chantier 17). */
export function objectivesForEmpire(runtime: GameRuntime, empire: Empire): Objective[] {
  return [...runtime.objectiveMap.values()].filter((o) => o.empireId === empire.id);
}

/**
 * Systèmes revendiqués visibles d'un empire (chantier 7e) : ses propres claims + ceux
 * des autres empires situés dans son brouillard, colorés par propriétaire.
 */
export function territoriesForEmpire(runtime: GameRuntime, empire: Empire): Territory[] {
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
function relationStateBetween(runtime: GameRuntime, a: string, b: string): RelationState {
  return runtime.relationMap.get(relationKey(a, b))?.state ?? "neutral";
}

/** Classement public de tous les empires, trié par score composite décroissant. */
export function leaderboardForEmpire(runtime: GameRuntime, viewer: Empire): LeaderboardEntry[] {
  const rows: LeaderboardEntry[] = [];
  for (const empire of runtime.empires.values()) {
    const colonies = [...empire.colonyMap.values()];
    const population = colonies.reduce((s, c) => s + c.population, 0);
    const claimed = empire.claimedSystemIds.length;
    const score =
      colonies.length * 100 + claimed * 40 + Math.floor(population) + empire.influence / 10;
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
        empire.id === viewer.id ? "neutral" : relationStateBetween(runtime, viewer.id, empire.id),
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
): { foreignFleets: ForeignFleet[]; foreignColonies: ForeignColony[] } {
  const foreignFleets: ForeignFleet[] = [];
  const foreignColonies: ForeignColony[] = [];
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
  }
  return { foreignFleets, foreignColonies };
}

/**
 * Compose le snapshot (forme externe WS, `EmpireSnapshot`) d'un empire : ses entités,
 * l'horloge et les PNJ partagés, redactés à son brouillard.
 */
export function snapshotForEmpire(runtime: GameRuntime, empire: Empire): EmpireSnapshot {
  const { foreignFleets, foreignColonies } = foreignPresenceForEmpire(runtime, empire);
  return {
    game: empire.toGameState(runtime.clock),
    colonies: [...empire.colonyMap.values()],
    transfers: [...empire.transferMap.values()],
    missions: [...empire.missionMap.values()],
    exploredSystemIds: [...empire.explored],
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
    leaderboard: leaderboardForEmpire(runtime, empire),
    territories: territoriesForEmpire(runtime, empire),
    contracts: [...runtime.contractMap.values()],
    factionStates: [...runtime.factionStateMap.values()],
    relations: relationsForEmpire(runtime, empire),
    proposals: proposalsForEmpire(runtime, empire),
    objectives: objectivesForEmpire(runtime, empire),
    worldEvents: [...runtime.worldEventMap.values()],
    // L'univers n'est réémis qu'en cas de changement : nouvelle exploration (brouillard
    // levé) ou extension de l'univers (galaxies apparues).
    ...(empire.explorationDirty || empire.universeDirty
      ? { universe: clientUniverseForEmpire(runtime, empire) }
      : {}),
  };
}
