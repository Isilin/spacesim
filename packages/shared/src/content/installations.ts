import type { ResourceId } from "../model/resources.js";
import type { TechId } from "./techs.js";
import type { ZoneTypeId } from "./zone-types.js";

/**
 * Installation d'une station orbitale (chantier 24) : occupe un emplacement d'un type
 * de zone précis (`zoneType`), comme un `ModuleDef` occupe un emplacement de châssis
 * d'un `SlotType` précis. Production par tick sur le même patron qu'un `BuildingDef`
 * (`inputs`/`outputs`), mais sans notion d'emploi/dotation : une station n'a pas de
 * population (voir `Station`, `model/industry.ts`).
 */
export interface InstallationDef {
  id: InstallationId;
  zoneType: ZoneTypeId;
  cost: Partial<Record<ResourceId, number>>;
  buildMs: number;
  inputs?: Partial<Record<ResourceId, number>>;
  outputs?: Partial<Record<ResourceId, number>>;
  /** Tech requise ; absente = disponible d'emblée (voir BASE_INSTALLATIONS, vide ici). */
  requiresTech?: TechId;
}

export const INSTALLATION_IDS = [
  "orbital_solar_array",
  "orbital_smelter_module",
  "orbital_observatory",
  "orbital_research_lab",
  "orbital_armory",
  "orbital_shipyard_annex",
] as const;

export type InstallationId = (typeof INSTALLATION_IDS)[number];

export const INSTALLATIONS: Record<InstallationId, InstallationDef> = {
  // ─── industrial_zone ───
  orbital_solar_array: {
    id: "orbital_solar_array",
    zoneType: "industrial_zone",
    cost: { metals: 80 },
    buildMs: 30_000,
    outputs: { energy: 4 },
    requiresTech: "orbital_engineering",
  },
  orbital_smelter_module: {
    id: "orbital_smelter_module",
    zoneType: "industrial_zone",
    cost: { metals: 120, energy: 40 },
    buildMs: 45_000,
    inputs: { ore: 3, energy: 2 },
    outputs: { metals: 1.5 },
    requiresTech: "heavy_industry",
  },
  // ─── science_zone ───
  orbital_observatory: {
    id: "orbital_observatory",
    zoneType: "science_zone",
    cost: { metals: 100, components: 40 },
    buildMs: 40_000,
    inputs: { energy: 2 },
    outputs: { science: 1 },
    requiresTech: "orbital_astrophysics",
  },
  orbital_research_lab: {
    id: "orbital_research_lab",
    zoneType: "science_zone",
    cost: { metals: 180, components: 90 },
    buildMs: 60_000,
    inputs: { energy: 4 },
    outputs: { science: 2.5 },
    requiresTech: "governance_ai",
  },
  // ─── military_zone ───
  orbital_armory: {
    id: "orbital_armory",
    zoneType: "military_zone",
    cost: { metals: 150, components: 60 },
    buildMs: 50_000,
    inputs: { components: 2, energy: 2 },
    outputs: { credits: 8 },
    requiresTech: "orbital_armaments",
  },
  orbital_shipyard_annex: {
    id: "orbital_shipyard_annex",
    zoneType: "military_zone",
    cost: { metals: 220, components: 120 },
    buildMs: 70_000,
    inputs: { metals: 2, energy: 3 },
    outputs: { components: 1.2 },
    requiresTech: "capital_ships",
  },
};

/** Aucune installation disponible sans recherche — voir BASE_ZONE_TYPES (même choix). */
export const BASE_INSTALLATIONS: InstallationId[] = [];
