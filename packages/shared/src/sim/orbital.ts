import { LIFT_ENERGY_PER_UNIT, LIFT_PER_DOCK, ORBITAL_CAP_PER_DOCK } from "../constants.js";
import type { Colony } from "../model/industry.js";
import { RESOURCES, type ResourceId } from "../model/resources.js";
import { NO_EFFECTS, type EmpireEffects } from "./research.js";

/** Stock orbital vide (toutes ressources à zéro). */
export function emptyOrbital(): Record<ResourceId, number> {
  return Object.fromEntries(RESOURCES.map((r) => [r, 0])) as Record<ResourceId, number>;
}

/** Capacité d'entreposage en orbite : nulle sans dock — donc rien à charger. */
export function orbitalCap(colony: Colony, effects: EmpireEffects = NO_EFFECTS): number {
  return (colony.buildings.orbital_dock ?? 0) * ORBITAL_CAP_PER_DOCK * effects.liftCapacityMult;
}

/** Unités déplaçables entre sol et orbite par tick (l'ascenseur est partagé). */
export function liftThroughput(colony: Colony, effects: EmpireEffects = NO_EFFECTS): number {
  return (colony.buildings.orbital_dock ?? 0) * LIFT_PER_DOCK * effects.liftThroughputMult;
}

/** Total actuellement entreposé en orbite. */
export function orbitalUsed(colony: Colony): number {
  return RESOURCES.reduce((sum, res) => sum + (colony.orbitalResources[res] ?? 0), 0);
}

/**
 * Applique un tick d'ascenseur orbital.
 *
 * Le débit est **partagé** entre les ressources (un seul ascenseur) et servi dans
 * l'ordre de `RESOURCES` ; monter consomme de l'énergie au sol, redescendre est
 * gratuit. Sans dock, rien ne bouge : c'est ce qui rend l'infrastructure orbitale
 * indispensable à toute exportation.
 */
export function applyLift(colony: Colony, effects: EmpireEffects = NO_EFFECTS): Colony {
  let budget = liftThroughput(colony, effects);
  if (budget <= 0) return colony;
  const cap = orbitalCap(colony, effects);

  const ground = { ...colony.resources };
  const orbit = { ...colony.orbitalResources };
  let free = Math.max(0, cap - orbitalUsed(colony));
  let moved = false;

  for (const res of RESOURCES) {
    if (budget <= 0) break;
    const rule = colony.liftRules[res];
    if (!rule) continue;

    if (rule.direction === "up") {
      const surplus = (ground[res] ?? 0) - rule.keepGround;
      if (surplus <= 0) continue;
      // L'énergie du voyage se prend au sol : hisser de l'énergie en consomme aussi.
      const perUnit = res === "energy" ? 1 + LIFT_ENERGY_PER_UNIT : LIFT_ENERGY_PER_UNIT;
      const affordable =
        LIFT_ENERGY_PER_UNIT <= 0 ? Infinity : Math.floor((ground.energy ?? 0) / perUnit);
      const amount = Math.floor(Math.min(surplus, budget, free, affordable));
      if (amount <= 0) continue;
      ground[res] -= amount;
      ground.energy -= amount * LIFT_ENERGY_PER_UNIT;
      orbit[res] = (orbit[res] ?? 0) + amount;
      budget -= amount;
      free -= amount;
      moved = true;
    } else {
      const missing = rule.keepGround - (ground[res] ?? 0);
      if (missing <= 0) continue;
      const amount = Math.floor(Math.min(missing, budget, orbit[res] ?? 0));
      if (amount <= 0) continue;
      orbit[res] -= amount;
      ground[res] = (ground[res] ?? 0) + amount;
      budget -= amount;
      free += amount;
      moved = true;
    }
  }

  if (!moved) return colony;
  return { ...colony, resources: ground, orbitalResources: orbit };
}

/**
 * Retire `amount` d'une ressource du stock orbital (chargement d'un vaisseau).
 * Retourne null si l'orbite n'en a pas assez — le sol ne peut pas se substituer.
 */
export function takeFromOrbit(
  colony: Colony,
  cargo: Partial<Record<ResourceId, number>>,
): Colony | null {
  const orbit = { ...colony.orbitalResources };
  for (const [res, amount] of Object.entries(cargo) as [ResourceId, number][]) {
    if ((orbit[res] ?? 0) < amount) return null;
    orbit[res] = (orbit[res] ?? 0) - amount;
  }
  return { ...colony, orbitalResources: orbit };
}

/** Livre une cargaison en orbite, dans la limite de la capacité (le surplus est perdu). */
export function deliverToOrbit(
  colony: Colony,
  cargo: Partial<Record<ResourceId, number>>,
  effects: EmpireEffects = NO_EFFECTS,
): Colony {
  const orbit = { ...colony.orbitalResources };
  let free = Math.max(0, orbitalCap(colony, effects) - orbitalUsed(colony));
  for (const [res, amount] of Object.entries(cargo) as [ResourceId, number][]) {
    const accepted = Math.min(amount, free);
    if (accepted <= 0) continue;
    orbit[res] = (orbit[res] ?? 0) + accepted;
    free -= accepted;
  }
  return { ...colony, orbitalResources: orbit };
}
