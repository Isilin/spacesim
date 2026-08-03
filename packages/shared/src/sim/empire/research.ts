import { BASE_BUILDINGS, TECHS, type TechDef } from "../../content/techs.js";
import {
  BASE_CHASSIS,
  CHASSIS,
  type ChassisDef,
} from "../../content/chassis.js";
import {
  BASE_MODULES,
  MODULES,
  type ModuleDef,
} from "../../content/modules.js";
import {
  BASE_INSTALLATIONS,
  INSTALLATIONS,
  type InstallationDef,
} from "../../content/installations.js";
import {
  BASE_ZONE_TYPES,
  ZONE_TYPES,
  type ZoneTypeDef,
} from "../../content/zone-types.js";
import { BUILDING_IDS, type BuildingId } from "../../model/industry.js";

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
  /** Marge commerciale en comptoir : ventes majorées, achats minorés. */
  tradeMargin: number;
  /** Châssis débloqués pour le concepteur (chantier 13). */
  unlockedChassis: Set<string>;
  /** Modules débloqués pour le concepteur (chantier 13). */
  unlockedModules: Set<string>;
  /**
   * Types de zone débloqués pour une station orbitale (chantier 24). Vide par défaut
   * (BASE_ZONE_TYPES) : fonder une station exige d'en avoir débloqué au moins un —
   * voir `sim/industry/station.ts` (`canFoundStation`).
   */
  unlockedZoneTypes: Set<string>;
  /** Installations débloquées pour une station orbitale (chantier 24). */
  unlockedInstallations: Set<string>;
}

export function computeEffects(
  researched: readonly string[],
  techs: Record<string, TechDef> = TECHS,
  chassisTable: Record<string, ChassisDef> = CHASSIS,
  moduleTable: Record<string, ModuleDef> = MODULES,
  zoneTypeTable: Record<string, ZoneTypeDef> = ZONE_TYPES,
  installationTable: Record<string, InstallationDef> = INSTALLATIONS,
): EmpireEffects {
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
    unlockedZoneTypes: new Set(BASE_ZONE_TYPES),
    unlockedInstallations: new Set(BASE_INSTALLATIONS),
  };
  for (const id of researched) {
    const tech = techs[id];
    if (!tech) continue;
    // Déblocages de conception (chantier 13) : source unique = `requiresTech` des défs.
    for (const cid of Object.keys(chassisTable)) {
      if (chassisTable[cid]!.requiresTech === id)
        effects.unlockedChassis.add(cid);
    }
    for (const mid of Object.keys(moduleTable)) {
      if (moduleTable[mid]!.requiresTech === id)
        effects.unlockedModules.add(mid);
    }
    // Déblocages de station orbitale (chantier 24) : même patron de parcours inverse.
    for (const zid of Object.keys(zoneTypeTable)) {
      if (zoneTypeTable[zid]!.requiresTech === id)
        effects.unlockedZoneTypes.add(zid);
    }
    for (const iid of Object.keys(installationTable)) {
      if (installationTable[iid]!.requiresTech === id)
        effects.unlockedInstallations.add(iid);
    }
    const e = tech.effects;
    for (const b of e.unlockBuildings ?? []) {
      if (BUILDING_IDS.includes(b as BuildingId)) {
        effects.unlockedBuildings.add(b as BuildingId);
      }
    }
    for (const [building, mult] of Object.entries(e.outputMult ?? {}) as [
      BuildingId,
      number,
    ][]) {
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
export function canResearch(
  techId: string,
  researched: readonly string[],
  techs: Record<string, TechDef> = TECHS,
): boolean {
  const tech = techs[techId];
  if (!tech) return false;
  if (researched.includes(techId)) return false;
  return tech.requires.every((req) => researched.includes(req));
}
