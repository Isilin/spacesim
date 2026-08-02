import {
  BASE_STORAGE,
  COLONY_SHIP_BASE_MS,
  COLONY_SHIP_MS_PER_JUMP,
  CREDITS_PER_COLONIST,
  FOOD_PER_COLONIST,
  FUEL_PER_MASS_JUMP,
  GATEWAY_TOLL_CREDITS,
  GOODS_PER_COLONIST,
  HOUSING_PER_HABITAT,
  LIFT_ENERGY_PER_UNIT,
  LIFT_PER_DOCK,
  MAX_QUEUE_LENGTH,
  NEW_COLONY_POPULATION,
  NO_DEPOSIT_MODIFIER,
  ORBITAL_CAP_PER_DOCK,
  POP_GROWTH_BASE,
  PROBE_BASE_MS,
  PROBE_COST_CREDITS,
  PROBE_MS_PER_JUMP,
  RAID_FRACTION,
  SATISFACTION_GROWTH_THRESHOLD,
  STATION_SHIP_BASE_MS,
  STATION_SHIP_MS_PER_JUMP,
  STORAGE_PER_DEPOT,
  TRANSFER_BASE_CREDITS,
  TRANSFER_BASE_MS,
  TRANSFER_CREDITS_PER_JUMP,
  TRANSFER_MS_PER_JUMP,
} from "./constants.js";

/**
 * Scalaires d'équilibrage réel (chantier 23.8) — un seul bundle injecté plutôt que 26
 * paramètres individuels : chaque fonction pure qui en a besoin reçoit ce bundle en
 * dernier paramètre, défaut `DEFAULT_BALANCE` (les valeurs historiques de
 * `constants.ts`). Exclut volontairement les constantes structurelles à fort rayon
 * d'impact (`TICK_MS`, `GALAXY_SPACING`, `MAX_GALAXIES`...) et les constantes composites
 * (`COLONY_SHIP_COST`, `NEW_COLONY_RESOURCES`...) qui ne sont pas de simples scalaires.
 */
export interface BalanceConstants {
  baseStorage: number;
  storagePerDepot: number;
  maxQueueLength: number;
  noDepositModifier: number;
  foodPerColonist: number;
  housingPerHabitat: number;
  creditsPerColonist: number;
  popGrowthBase: number;
  satisfactionGrowthThreshold: number;
  goodsPerColonist: number;
  raidFraction: number;
  transferBaseMs: number;
  transferMsPerJump: number;
  transferBaseCredits: number;
  transferCreditsPerJump: number;
  fuelPerMassJump: number;
  gatewayTollCredits: number;
  probeCostCredits: number;
  probeBaseMs: number;
  probeMsPerJump: number;
  colonyShipBaseMs: number;
  colonyShipMsPerJump: number;
  stationShipBaseMs: number;
  stationShipMsPerJump: number;
  newColonyPopulation: number;
  orbitalCapPerDock: number;
  liftPerDock: number;
  liftEnergyPerUnit: number;
}

export const DEFAULT_BALANCE: BalanceConstants = {
  baseStorage: BASE_STORAGE,
  storagePerDepot: STORAGE_PER_DEPOT,
  maxQueueLength: MAX_QUEUE_LENGTH,
  noDepositModifier: NO_DEPOSIT_MODIFIER,
  foodPerColonist: FOOD_PER_COLONIST,
  housingPerHabitat: HOUSING_PER_HABITAT,
  creditsPerColonist: CREDITS_PER_COLONIST,
  popGrowthBase: POP_GROWTH_BASE,
  satisfactionGrowthThreshold: SATISFACTION_GROWTH_THRESHOLD,
  goodsPerColonist: GOODS_PER_COLONIST,
  raidFraction: RAID_FRACTION,
  transferBaseMs: TRANSFER_BASE_MS,
  transferMsPerJump: TRANSFER_MS_PER_JUMP,
  transferBaseCredits: TRANSFER_BASE_CREDITS,
  transferCreditsPerJump: TRANSFER_CREDITS_PER_JUMP,
  fuelPerMassJump: FUEL_PER_MASS_JUMP,
  gatewayTollCredits: GATEWAY_TOLL_CREDITS,
  probeCostCredits: PROBE_COST_CREDITS,
  probeBaseMs: PROBE_BASE_MS,
  probeMsPerJump: PROBE_MS_PER_JUMP,
  colonyShipBaseMs: COLONY_SHIP_BASE_MS,
  colonyShipMsPerJump: COLONY_SHIP_MS_PER_JUMP,
  stationShipBaseMs: STATION_SHIP_BASE_MS,
  stationShipMsPerJump: STATION_SHIP_MS_PER_JUMP,
  newColonyPopulation: NEW_COLONY_POPULATION,
  orbitalCapPerDock: ORBITAL_CAP_PER_DOCK,
  liftPerDock: LIFT_PER_DOCK,
  liftEnergyPerUnit: LIFT_ENERGY_PER_UNIT,
};
