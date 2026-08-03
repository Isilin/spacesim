import {
  CHASSIS,
  type ChassisDef,
  type ShipDomain,
} from "../../content/chassis.js";
import {
  MODULES,
  SLOT_TYPES,
  type ModuleDef,
  type ModuleId,
  type SlotType,
} from "../../content/modules.js";
import {
  COMBAT_PHASES,
  type CombatCategory,
  type CombatPhase,
} from "../../content/warships.js";
import type { Blueprint } from "../../model/industry.js";
import type { ResourceId } from "../../model/resources.js";
import type { EmpireEffects } from "../empire/research.js";

/** Marché des plans en comptoir (chantier 13) : marge à l'achat, décote à la revente. */
export const BLUEPRINT_BUY_MARKUP = 1.4;
export const BLUEPRINT_SELL_FRACTION = 0.5;

/** Un plan « nu » : la partie d'un Blueprint que le résolveur lit. */
export interface BlueprintShape {
  chassisId: string;
  modules: string[];
}

/** Stats effectives d'un vaisseau, dérivées d'un plan (châssis + modules). */
export interface ShipStats {
  domain: ShipDomain;
  hull: number;
  shield: number;
  weapons: Record<CombatPhase, number>;
  initiative: number;
  capacity: number;
  speedMult: number;
  fuelPerJump: number;
  miningYield: number;
  colonizer: boolean;
  fleetDamageBonus: number;
  /** Catégorie de combat (triangle de forces) dérivée du plan. */
  category: CombatCategory;
  cost: Partial<Record<ResourceId, number>>;
  buildMs: number;
}

/** Catégorie de combat déduite des stats résolues (coque, soutien, armement). */
export function categoryOf(stats: {
  hull: number;
  fleetDamageBonus: number;
  weapons: Record<CombatPhase, number>;
}): CombatCategory {
  const firepower =
    stats.weapons.long + stats.weapons.medium + stats.weapons.short;
  if (stats.fleetDamageBonus > 0 && firepower < 20) return "support";
  if (stats.hull >= 350) return "capital";
  if (stats.hull >= 140) return "line";
  return "skirmisher";
}

/**
 * Résout un plan en stats effectives : base du châssis + somme des effets de modules,
 * chaque effet majoré par le `roleBonus` du châssis pour son rôle. Purement déterministe.
 * Les ids inconnus sont ignorés (la validation les signale par ailleurs).
 */
export function resolveBlueprint(
  bp: BlueprintShape,
  chassisTable: Record<string, ChassisDef> = CHASSIS,
  moduleTable: Record<string, ModuleDef> = MODULES,
): ShipStats {
  const chassis = chassisTable[bp.chassisId];
  const weapons: Record<CombatPhase, number> = { long: 0, medium: 0, short: 0 };
  if (!chassis) {
    return {
      domain: "fleet",
      hull: 0,
      shield: 0,
      weapons,
      initiative: 0,
      capacity: 0,
      speedMult: 1,
      fuelPerJump: 0,
      miningYield: 0,
      colonizer: false,
      fleetDamageBonus: 0,
      category: "skirmisher",
      cost: {},
      buildMs: 0,
    };
  }

  const cost: Partial<Record<ResourceId, number>> = { ...chassis.cost };
  const stats: ShipStats = {
    domain: chassis.domain,
    hull: chassis.hull,
    shield: 0,
    weapons,
    initiative: chassis.baseInitiative,
    capacity: 0,
    speedMult: chassis.baseSpeedMult,
    fuelPerJump: chassis.baseFuelPerJump,
    miningYield: 0,
    colonizer: false,
    fleetDamageBonus: 0,
    category: "skirmisher",
    cost,
    buildMs: chassis.buildMs,
  };

  for (const modId of bp.modules) {
    const mod = moduleTable[modId];
    if (!mod) continue;
    const bonus = chassis.roleBonus?.[mod.role] ?? 1;
    const e = mod.effects;
    if (e.weapons) {
      for (const phase of COMBAT_PHASES)
        weapons[phase] += (e.weapons[phase] ?? 0) * bonus;
    }
    stats.shield += (e.shield ?? 0) * bonus;
    stats.hull += (e.hullBonus ?? 0) * bonus;
    stats.initiative += e.initiative ?? 0;
    stats.capacity += (e.capacity ?? 0) * bonus;
    stats.speedMult += e.speedMult ?? 0;
    stats.fuelPerJump += e.fuelDelta ?? 0;
    stats.miningYield += (e.miningYield ?? 0) * bonus;
    if (e.colonizer) stats.colonizer = true;
    stats.fleetDamageBonus += (e.fleetDamageBonus ?? 0) * bonus;
    for (const [res, amount] of Object.entries(mod.cost) as [
      ResourceId,
      number,
    ][]) {
      cost[res] = (cost[res] ?? 0) + amount;
    }
    stats.buildMs += mod.buildMs;
  }

  stats.fuelPerJump = Math.max(0, stats.fuelPerJump);
  stats.speedMult = Math.max(0.1, stats.speedMult);
  stats.category = categoryOf(stats);
  return stats;
}

/**
 * Contrôle un plan : châssis/modules connus et débloqués, emplacements respectés,
 * budgets (énergie/tonnage/calcul) non dépassés. Retourne la liste des problèmes
 * (vide = plan constructible). Autoritaire côté serveur.
 */
export function validateBlueprint(
  bp: BlueprintShape,
  effects: EmpireEffects,
  chassisTable: Record<string, ChassisDef> = CHASSIS,
  moduleTable: Record<string, ModuleDef> = MODULES,
): string[] {
  const problems: string[] = [];
  const chassis = chassisTable[bp.chassisId];
  if (!chassis) return [`Châssis inconnu : ${bp.chassisId}`];
  if (!effects.unlockedChassis.has(bp.chassisId)) {
    problems.push("Châssis non débloqué");
  }

  const slotUsed: Record<SlotType, number> = {
    weapon: 0,
    defense: 0,
    propulsion: 0,
    utility: 0,
  };
  let power = 0;
  let tonnage = 0;
  let calc = 0;

  for (const modId of bp.modules) {
    const mod = moduleTable[modId];
    if (!mod) {
      problems.push(`Module inconnu : ${modId}`);
      continue;
    }
    if (!effects.unlockedModules.has(modId)) {
      problems.push(`Module non débloqué : ${modId}`);
    }
    slotUsed[mod.slot] += 1;
    power += mod.power;
    tonnage += mod.tonnage;
    calc += mod.calc;
  }

  for (const slot of SLOT_TYPES) {
    const offered = chassis.slots[slot] ?? 0;
    if (slotUsed[slot] > offered) {
      problems.push(`Trop de modules ${slot} (${slotUsed[slot]}/${offered})`);
    }
  }
  if (power > chassis.power)
    problems.push(`Énergie insuffisante (${power}/${chassis.power})`);
  if (tonnage > chassis.tonnage)
    problems.push(`Tonnage dépassé (${tonnage}/${chassis.tonnage})`);
  if (calc > chassis.calc)
    problems.push(`Calcul dépassé (${calc}/${chassis.calc})`);

  return problems;
}

/** Budgets consommés par un plan (pour les jauges de l'UI). */
export function blueprintLoad(bp: BlueprintShape): {
  power: number;
  tonnage: number;
  calc: number;
} {
  let power = 0;
  let tonnage = 0;
  let calc = 0;
  for (const modId of bp.modules) {
    const mod = MODULES[modId as ModuleId];
    if (!mod) continue;
    power += mod.power;
    tonnage += mod.tonnage;
    calc += mod.calc;
  }
  return { power, tonnage, calc };
}

/**
 * Rôle dominant d'un plan (le type de slot le plus rempli, arme prioritaire) — sert au
 * triangle de forces du combat quand les vaisseaux ne sont plus des classes figées.
 */
export function dominantSlot(bp: BlueprintShape): SlotType {
  const count: Record<SlotType, number> = {
    weapon: 0,
    defense: 0,
    propulsion: 0,
    utility: 0,
  };
  for (const modId of bp.modules) {
    const mod = MODULES[modId as ModuleId];
    if (mod) count[mod.slot] += 1;
  }
  return SLOT_TYPES.reduce(
    (best, slot) => (count[slot] > count[best] ? slot : best),
    "weapon",
  );
}

/** Convertit un plan complet (Blueprint) en sa forme nue pour le résolveur. */
export function shapeOf(bp: Blueprint): BlueprintShape {
  return { chassisId: bp.chassisId, modules: bp.modules };
}
