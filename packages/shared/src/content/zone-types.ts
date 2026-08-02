import type { ResourceId } from "../model/resources.js";
import type { TechId } from "./techs.js";

/**
 * Type de zone d'une station orbitale (chantier 24) : l'unité que le joueur ajoute une
 * à une pour agrandir sa station. Une zone construite ajoute +1 emplacement de son type
 * (voir `Station.zones`) ; chaque emplacement accueille ensuite une installation de ce
 * type (`InstallationDef.zoneType`). Contrairement à un `ChassisDef.slots` (emplacements
 * fixés à la définition du châssis), le nombre d'emplacements d'une station grandit par
 * l'action du joueur — mécanisme neuf, sans précédent direct.
 */
export interface ZoneTypeDef {
  id: ZoneTypeId;
  cost: Partial<Record<ResourceId, number>>;
  buildMs: number;
  /** Tech requise ; absente = disponible d'emblée (voir BASE_ZONE_TYPES, vide ici). */
  requiresTech?: TechId;
}

export const ZONE_TYPE_IDS = [
  "industrial_zone",
  "science_zone",
  "military_zone",
  "commercial_zone",
] as const;

export type ZoneTypeId = (typeof ZONE_TYPE_IDS)[number];

export const ZONE_TYPES: Record<ZoneTypeId, ZoneTypeDef> = {
  industrial_zone: {
    id: "industrial_zone",
    cost: { metals: 150, components: 60 },
    buildMs: 60_000,
    requiresTech: "orbital_engineering",
  },
  science_zone: {
    id: "science_zone",
    cost: { metals: 120, components: 80 },
    buildMs: 75_000,
    requiresTech: "orbital_astrophysics",
  },
  military_zone: {
    id: "military_zone",
    cost: { metals: 200, components: 100 },
    buildMs: 90_000,
    requiresTech: "orbital_armaments",
  },
  /** Station commerciale (chantier 25) : accueille les installations de marché
   * (`grants: "resourceMarket" | "blueprintMarket"`, content/installations.ts). */
  commercial_zone: {
    id: "commercial_zone",
    cost: { metals: 180, components: 90 },
    buildMs: 80_000,
    requiresTech: "orbital_commerce",
  },
};

/**
 * Aucun type de zone disponible sans recherche (contrairement à `BASE_CHASSIS`/
 * `BASE_MODULES`, non vides) : fonder une station exige d'avoir débloqué au moins un
 * type de zone — voir `EmpireEffects.unlockedZoneTypes` et son usage dans
 * `sim/industry/station.ts` (`canFoundStation`).
 */
export const BASE_ZONE_TYPES: ZoneTypeId[] = [];
