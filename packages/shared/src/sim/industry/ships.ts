import {
  MAX_SHIP_QUEUE_LENGTH,
  SHIPS,
  type ShipDef,
} from "../../content/ships.js";
import { type Colony, type ShipId } from "../../model/industry.js";
import type { ResourceId } from "../../model/resources.js";
import type { Route } from "../../model/transport.js";
import { NO_EFFECTS, type EmpireEffects } from "../empire/research.js";
import { canAfford } from "./colony.js";
import type { ShipStats } from "./design.js";

/** Soute d'un id de vaisseau selon les classes historiques (défaut des providers). */
export function legacyCapacity(
  id: string,
  ships: Record<string, ShipDef> = SHIPS,
): number {
  return ships[id]?.capacity ?? 0;
}

/**
 * Vaisseaux disponibles à la colonie : possédés − occupés − réservés aux routes.
 * Les clés sont dérivées des données de la colonie → compatible avec les ids de plan.
 */
export function idleShips(
  colony: Colony,
  routes: readonly Route[],
): Record<string, number> {
  const idle: Record<string, number> = {};
  for (const [shipId, count] of Object.entries(colony.ships)) {
    idle[shipId] = (idle[shipId] ?? 0) + (count ?? 0);
  }
  for (const busy of colony.shipsBusy) {
    idle[busy.shipId] = (idle[busy.shipId] ?? 0) - 1;
  }
  for (const route of routes) {
    if (route.ownerColonyId !== colony.id) continue;
    for (const [shipId, count] of Object.entries(route.ships)) {
      idle[shipId] = (idle[shipId] ?? 0) - (count ?? 0);
    }
  }
  for (const shipId of Object.keys(idle)) {
    idle[shipId] = Math.max(0, idle[shipId] ?? 0);
  }
  return idle;
}

/** Capacité de soute totale d'un lot de vaisseaux. */
export function fleetCapacity(
  ships: Partial<Record<string, number>>,
  capacityOf: (id: string) => number = legacyCapacity,
): number {
  let capacity = 0;
  for (const [shipId, count] of Object.entries(ships)) {
    capacity += capacityOf(shipId) * (count ?? 0);
  }
  return capacity;
}

/** Le plus gros vaisseau disponible (repli quand aucun convoi n'est précisé). */
export function pickShip(
  idle: Partial<Record<string, number>>,
  capacityOf: (id: string) => number = legacyCapacity,
): string | null {
  const available = Object.keys(idle).filter((id) => (idle[id] ?? 0) > 0);
  if (available.length === 0) return null;
  return available.reduce((best, id) =>
    capacityOf(id) > capacityOf(best) ? id : best,
  );
}

/** Soute du plus gros cargo disponible (0 si aucun) — borne des convois manuels. */
export function maxConvoyCapacity(
  colony: Colony,
  routes: readonly Route[],
  capacityOf: (id: string) => number = legacyCapacity,
): number {
  const ship = pickShip(idleShips(colony, routes), capacityOf);
  return ship ? capacityOf(ship) : 0;
}

export type ShipEnqueueResult =
  | { ok: true; colony: Colony }
  | { ok: false; reason: string };

/** Valide et paie la production d'un vaisseau au chantier naval (classes historiques). */
export function enqueueShip(
  colony: Colony,
  shipId: ShipId,
  now: number,
  researched: readonly string[],
  effects: EmpireEffects = NO_EFFECTS,
  ships: Record<string, ShipDef> = SHIPS,
): ShipEnqueueResult {
  const def = ships[shipId];
  if (!def) return { ok: false, reason: `Vaisseau inconnu : ${shipId}` };
  if (def.requiresTech && !researched.includes(def.requiresTech)) {
    return { ok: false, reason: "Technologie requise non recherchée" };
  }
  return enqueueBuild(colony, shipId, def.cost, def.buildMs, now, effects);
}

/**
 * Valide et paie la production d'un vaisseau **depuis un plan** (chantier 13) : coût et
 * durée viennent des stats résolues. La validation du plan (slots/budgets/déblocages)
 * incombe à l'appelant (serveur autoritaire).
 */
export function enqueueShipFromStats(
  colony: Colony,
  blueprintId: string,
  stats: ShipStats,
  now: number,
  effects: EmpireEffects = NO_EFFECTS,
): ShipEnqueueResult {
  if (stats.domain !== "colony") {
    return {
      ok: false,
      reason: "Ce plan se produit en flotte, pas au chantier civil",
    };
  }
  return enqueueBuild(
    colony,
    blueprintId,
    stats.cost,
    stats.buildMs,
    now,
    effects,
  );
}

/** Cœur commun : chantier naval requis, file, coût, timer. */
function enqueueBuild(
  colony: Colony,
  shipId: string,
  cost: Partial<Record<ResourceId, number>>,
  buildMs: number,
  now: number,
  effects: EmpireEffects,
): ShipEnqueueResult {
  if ((colony.buildings.shipyard ?? 0) < 1) {
    return { ok: false, reason: "Chantier naval requis" };
  }
  if (colony.shipQueue.length >= MAX_SHIP_QUEUE_LENGTH) {
    return { ok: false, reason: "File navale pleine" };
  }
  if (!canAfford(colony, cost))
    return { ok: false, reason: "Ressources insuffisantes" };

  const resources = { ...colony.resources };
  for (const [res, amount] of Object.entries(cost) as [ResourceId, number][]) {
    resources[res] -= amount;
  }
  const lastFinish = colony.shipQueue.at(-1)?.finishesAt ?? now;
  const startedAt = Math.max(now, lastFinish);
  const finishesAt =
    startedAt + Math.round(buildMs * effects.shipBuildSpeedMult);
  return {
    ok: true,
    colony: {
      ...colony,
      resources,
      shipQueue: [...colony.shipQueue, { shipId, startedAt, finishesAt }],
    },
  };
}

/** Livre les vaisseaux produits et libère ceux revenus de convoi à l'instant `now`. */
export function resolveShips(colony: Colony, now: number): Colony {
  const doneBuilds = colony.shipQueue.filter((q) => q.finishesAt <= now);
  const freed = colony.shipsBusy.filter((b) => b.freeAt <= now);
  if (doneBuilds.length === 0 && freed.length === 0) return colony;
  const ships = { ...colony.ships };
  for (const item of doneBuilds) {
    ships[item.shipId] = (ships[item.shipId] ?? 0) + 1;
  }
  return {
    ...colony,
    ships,
    shipQueue: colony.shipQueue.filter((q) => q.finishesAt > now),
    shipsBusy: colony.shipsBusy.filter((b) => b.freeAt > now),
  };
}
