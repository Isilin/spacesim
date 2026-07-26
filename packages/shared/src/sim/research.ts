import { BASE_BUILDINGS, TECHS, type TechId } from "../content/techs.js";
import { BASE_CHASSIS, CHASSIS, CHASSIS_IDS, type ChassisId } from "../content/chassis.js";
import { BASE_MODULES, MODULES, MODULE_IDS, type ModuleId } from "../content/modules.js";
import type { BuildingId } from "../model/industry.js";

/** Effets d'empire agrégés depuis les techs recherchées. */
export interface EmpireEffects {
  unlockedBuildings: Set<BuildingId>;
  outputMult: Partial<Record<BuildingId, number>>;
  outputMultAll: number;
  housingMult: number;
  habitabilityBonus: number;
  queueBonus: number;
  probeSpeedMult: number;
  probeCostMult: number;
  colonyShipSpeedMult: number;
  transferSpeedMult: number;
  satisfactionBonus: number;
  popGrowthMult: number;
  goodsNeedMult: number;
  creditsMult: number;
  foodNeedMult: number;
  storageMult: number;
  buildSpeedMult: number;
  shipBuildSpeedMult: number;
  outpostYieldMult: number;
  influenceMult: number;
  /** Capacité du stock orbital (chantier 12). */
  liftCapacityMult: number;
  /** Débit de l'ascenseur orbital. */
  liftThroughputMult: number;
  /** Carburant des convois (chantier 12). */
  fuelMult: number;
  /** Marge commerciale en station : ventes majorées, achats minorés. */
  tradeMargin: number;
  /** Châssis débloqués pour le concepteur (chantier 13). */
  unlockedChassis: Set<ChassisId>;
  /** Modules débloqués pour le concepteur (chantier 13). */
  unlockedModules: Set<ModuleId>;
}

export function computeEffects(researched: readonly TechId[]): EmpireEffects {
  const effects: EmpireEffects = {
    unlockedBuildings: new Set(BASE_BUILDINGS),
    outputMult: {},
    outputMultAll: 1,
    housingMult: 1,
    habitabilityBonus: 0,
    queueBonus: 0,
    probeSpeedMult: 1,
    probeCostMult: 1,
    colonyShipSpeedMult: 1,
    transferSpeedMult: 1,
    satisfactionBonus: 0,
    popGrowthMult: 1,
    goodsNeedMult: 1,
    creditsMult: 1,
    foodNeedMult: 1,
    storageMult: 1,
    buildSpeedMult: 1,
    shipBuildSpeedMult: 1,
    outpostYieldMult: 1,
    influenceMult: 1,
    liftCapacityMult: 1,
    liftThroughputMult: 1,
    fuelMult: 1,
    tradeMargin: 0,
    unlockedChassis: new Set(BASE_CHASSIS),
    unlockedModules: new Set(BASE_MODULES),
  };
  for (const id of researched) {
    const tech = TECHS[id];
    if (!tech) continue;
    // Déblocages de conception (chantier 13) : source unique = `requiresTech` des défs.
    for (const cid of CHASSIS_IDS) {
      if (CHASSIS[cid].requiresTech === id) effects.unlockedChassis.add(cid);
    }
    for (const mid of MODULE_IDS) {
      if (MODULES[mid].requiresTech === id) effects.unlockedModules.add(mid);
    }
    const e = tech.effects;
    for (const b of e.unlockBuildings ?? []) effects.unlockedBuildings.add(b);
    for (const [building, mult] of Object.entries(e.outputMult ?? {}) as [BuildingId, number][]) {
      effects.outputMult[building] = (effects.outputMult[building] ?? 1) * mult;
    }
    effects.outputMultAll *= e.outputMultAll ?? 1;
    effects.housingMult *= e.housingMult ?? 1;
    effects.habitabilityBonus += e.habitabilityBonus ?? 0;
    effects.queueBonus += e.queueBonus ?? 0;
    effects.probeSpeedMult *= e.probeSpeedMult ?? 1;
    effects.probeCostMult *= e.probeCostMult ?? 1;
    effects.colonyShipSpeedMult *= e.colonyShipSpeedMult ?? 1;
    effects.transferSpeedMult *= e.transferSpeedMult ?? 1;
    effects.satisfactionBonus += e.satisfactionBonus ?? 0;
    effects.popGrowthMult *= e.popGrowthMult ?? 1;
    effects.goodsNeedMult *= e.goodsNeedMult ?? 1;
    effects.creditsMult *= e.creditsMult ?? 1;
    effects.foodNeedMult *= e.foodNeedMult ?? 1;
    effects.storageMult *= e.storageMult ?? 1;
    effects.buildSpeedMult *= e.buildSpeedMult ?? 1;
    effects.shipBuildSpeedMult *= e.shipBuildSpeedMult ?? 1;
    effects.outpostYieldMult *= e.outpostYieldMult ?? 1;
    effects.influenceMult *= e.influenceMult ?? 1;
    effects.liftCapacityMult *= e.liftCapacityMult ?? 1;
    effects.liftThroughputMult *= e.liftThroughputMult ?? 1;
    effects.fuelMult *= e.fuelMult ?? 1;
    effects.tradeMargin += e.tradeMargin ?? 0;
  }
  return effects;
}

export const NO_EFFECTS: EmpireEffects = computeEffects([]);

/** Une tech est-elle recherchable (prérequis satisfaits, pas déjà connue) ? */
export function canResearch(techId: TechId, researched: readonly TechId[]): boolean {
  const tech = TECHS[techId];
  if (!tech) return false;
  if (researched.includes(techId)) return false;
  return tech.requires.every((req) => researched.includes(req));
}
