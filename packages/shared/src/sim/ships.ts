import { MAX_SHIP_QUEUE_LENGTH, SHIPS } from "../content/ships.js";
import type { TechId } from "../content/techs.js";
import { canAfford } from "./colony.js";
import { NO_EFFECTS, type EmpireEffects } from "./research.js";
import type { Colony, ResourceId, Route, ShipId } from "../types.js";

/** Vaisseaux disponibles à la colonie : possédés − occupés − réservés aux routes. */
export function idleShips(colony: Colony, routes: readonly Route[]): Record<ShipId, number> {
  const idle: Record<ShipId, number> = { cargo_small: 0, cargo_large: 0 };
  for (const [shipId, count] of Object.entries(colony.ships) as [ShipId, number][]) {
    idle[shipId] = count ?? 0;
  }
  for (const busy of colony.shipsBusy) {
    idle[busy.shipId] -= 1;
  }
  for (const route of routes) {
    if (route.ownerColonyId !== colony.id) continue;
    for (const [shipId, count] of Object.entries(route.ships) as [ShipId, number][]) {
      idle[shipId] -= count ?? 0;
    }
  }
  for (const shipId of Object.keys(idle) as ShipId[]) {
    idle[shipId] = Math.max(0, idle[shipId]);
  }
  return idle;
}

/** Capacité de soute totale d'un lot de vaisseaux. */
export function fleetCapacity(ships: Partial<Record<ShipId, number>>): number {
  let capacity = 0;
  for (const [shipId, count] of Object.entries(ships) as [ShipId, number][]) {
    capacity += SHIPS[shipId].capacity * (count ?? 0);
  }
  return capacity;
}

/** Le plus gros vaisseau disponible (pour les convois manuels : un vaisseau par convoi). */
export function pickShip(idle: Record<ShipId, number>): ShipId | null {
  if (idle.cargo_large > 0) return "cargo_large";
  if (idle.cargo_small > 0) return "cargo_small";
  return null;
}

/** Soute du plus gros cargo disponible (0 si aucun) — borne des convois manuels. */
export function maxConvoyCapacity(colony: Colony, routes: readonly Route[]): number {
  const ship = pickShip(idleShips(colony, routes));
  return ship ? SHIPS[ship].capacity : 0;
}

export type ShipEnqueueResult = { ok: true; colony: Colony } | { ok: false; reason: string };

/** Valide et paie la production d'un vaisseau au chantier naval. */
export function enqueueShip(
  colony: Colony,
  shipId: ShipId,
  now: number,
  researched: readonly TechId[],
  effects: EmpireEffects = NO_EFFECTS,
): ShipEnqueueResult {
  const def = SHIPS[shipId];
  if (!def) return { ok: false, reason: `Vaisseau inconnu : ${shipId}` };
  if ((colony.buildings.shipyard ?? 0) < 1) {
    return { ok: false, reason: "Chantier naval requis" };
  }
  if (def.requiresTech && !researched.includes(def.requiresTech)) {
    return { ok: false, reason: "Technologie requise non recherchée" };
  }
  if (colony.shipQueue.length >= MAX_SHIP_QUEUE_LENGTH) {
    return { ok: false, reason: "File navale pleine" };
  }
  if (!canAfford(colony, def.cost)) return { ok: false, reason: "Ressources insuffisantes" };

  const resources = { ...colony.resources };
  for (const [res, amount] of Object.entries(def.cost) as [ResourceId, number][]) {
    resources[res] -= amount;
  }
  const lastFinish = colony.shipQueue.at(-1)?.finishesAt ?? now;
  const startedAt = Math.max(now, lastFinish);
  const finishesAt = startedAt + Math.round(def.buildMs * effects.shipBuildSpeedMult);
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
