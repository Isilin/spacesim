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
/** Capacité spéciale conférée par une installation (chantier 25), au-delà de la
 * simple conversion inputs/outputs par tick — voir `hasResourceMarket`/
 * `hasBlueprintMarket` (sim/industry/station.ts). Absent = comportement actuel. */
export type InstallationGrant = "resourceMarket" | "blueprintMarket";

export interface InstallationDef {
  id: InstallationId;
  zoneType: ZoneTypeId;
  cost: Partial<Record<ResourceId, number>>;
  buildMs: number;
  inputs?: Partial<Record<ResourceId, number>>;
  outputs?: Partial<Record<ResourceId, number>>;
  /** Tech requise ; absente = disponible d'emblée (voir BASE_INSTALLATIONS, vide ici). */
  requiresTech?: TechId;
  grants?: InstallationGrant;
}

export const INSTALLATION_IDS = [
  "orbital_solar_array",
  "orbital_smelter_module",
  "orbital_observatory",
  "orbital_research_lab",
  "orbital_armory",
  "orbital_shipyard_annex",
  "orbital_trade_exchange",
  "orbital_brokerage_house",
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
  // ─── commercial_zone (chantier 25) ───
  /** Entretien pur (pas d'outputs) : le marché lui-même n'est pas une conversion
   * inputs/outputs par tick, c'est une capacité (`grants`) exploitée par les actions
   * d'achat/vente — voir sim/economy/station-market.ts. */
  orbital_trade_exchange: {
    id: "orbital_trade_exchange",
    zoneType: "commercial_zone",
    cost: { metals: 140, components: 70 },
    buildMs: 55_000,
    inputs: { energy: 3, credits: 0.5 },
    requiresTech: "orbital_commerce",
    grants: "resourceMarket",
  },
  orbital_brokerage_house: {
    id: "orbital_brokerage_house",
    zoneType: "commercial_zone",
    cost: { metals: 200, components: 130 },
    buildMs: 75_000,
    inputs: { energy: 3, credits: 1 },
    requiresTech: "orbital_brokerage",
    grants: "blueprintMarket",
  },
};

/** Aucune installation disponible sans recherche — voir BASE_ZONE_TYPES (même choix). */
export const BASE_INSTALLATIONS: InstallationId[] = [];
