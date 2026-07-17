import type { BuildingId, ResourceId } from "../types.js";

export interface BuildingDef {
  id: BuildingId;
  /** Coût d'une instance (plat : pas de niveaux, on multiplie les instances). */
  cost: Partial<Record<ResourceId, number>>;
  /** Durée de construction d'une instance, en ms. */
  buildMs: number;
  /** Production par tick et par instance. */
  outputs?: Partial<Record<ResourceId, number>>;
  /** Consommation par tick et par instance ; si le stock manque, l'instance tourne à vide. */
  inputs?: Partial<Record<ResourceId, number>>;
  /** La production de cette ressource est multipliée par le gisement de la planète. */
  depositScaled?: ResourceId;
  /** Emplois par instance ; un bâtiment sous-employé produit au prorata. */
  jobsPerInstance?: number;
}

/**
 * Équilibrage : boucle fermée sur le minerai (miner → construire plus).
 * Coûts plats, la contrainte vient des emplacements de la planète et de la main-d'œuvre.
 * Rythme "sessions longues" : constructions de l'ordre de la minute.
 */
export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  mine: {
    id: "mine",
    cost: { ore: 80, energy: 25 },
    buildMs: 25_000,
    outputs: { ore: 2 },
    depositScaled: "ore",
    jobsPerInstance: 5,
  },
  power_plant: {
    id: "power_plant",
    cost: { ore: 100 },
    buildMs: 30_000,
    outputs: { energy: 3 },
    depositScaled: "energy",
    jobsPerInstance: 5,
  },
  farm: {
    id: "farm",
    cost: { ore: 65, energy: 20 },
    buildMs: 22_000,
    outputs: { food: 2 },
    depositScaled: "food",
    jobsPerInstance: 5,
  },
  habitat: {
    id: "habitat",
    cost: { ore: 110, energy: 40 },
    buildMs: 35_000,
    // Logements par instance : voir HOUSING_PER_HABITAT.
  },
  storage_depot: {
    id: "storage_depot",
    cost: { ore: 130 },
    buildMs: 40_000,
  },
  laboratory: {
    id: "laboratory",
    cost: { ore: 160, energy: 80 },
    buildMs: 50_000,
    outputs: { science: 0.5 },
    inputs: { energy: 1 },
    jobsPerInstance: 8,
  },
  smelter: {
    id: "smelter",
    cost: { ore: 250, energy: 100 },
    buildMs: 55_000,
    inputs: { ore: 3, energy: 2 },
    outputs: { metals: 1.5 },
    jobsPerInstance: 6,
  },
  component_factory: {
    id: "component_factory",
    cost: { ore: 400, metals: 150 },
    buildMs: 75_000,
    inputs: { metals: 1.5, energy: 2 },
    outputs: { components: 0.5 },
    jobsPerInstance: 8,
  },
  goods_factory: {
    id: "goods_factory",
    cost: { ore: 300, metals: 100 },
    buildMs: 65_000,
    inputs: { metals: 1, energy: 1 },
    outputs: { goods: 1 },
    jobsPerInstance: 6,
  },
  shipyard: {
    id: "shipyard",
    cost: { ore: 300, metals: 100 },
    buildMs: 70_000,
    jobsPerInstance: 5,
    // Produit les vaisseaux civils (content/ships.ts) via la file navale.
  },
  monument: {
    id: "monument",
    cost: { ore: 400, metals: 150, goods: 50 },
    buildMs: 90_000,
    jobsPerInstance: 4,
    // Génère de l'influence (sim/influence.ts), pas de production matérielle.
  },
};
