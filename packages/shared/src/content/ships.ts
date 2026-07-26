import type { TechId } from "./techs.js";
import { SHIP_IDS } from "../model/industry.js";
import type { ResourceId } from "../model/resources.js";

/** Ids concrets des classes civiles historiques (clés connues, cf. types `ShipId = string`). */
export type LegacyShipId = (typeof SHIP_IDS)[number];

export interface ShipDef {
  id: LegacyShipId;
  /** Capacité de soute (unités de ressources). */
  capacity: number;
  cost: Partial<Record<ResourceId, number>>;
  buildMs: number;
  /** Tech requise pour la production (en plus du chantier naval). */
  requiresTech?: TechId;
  /**
   * Durée de trajet relative (chantier 12) : < 1 = plus rapide. Un convoi avance à
   * l'allure de son vaisseau le plus lent.
   */
  speedMult: number;
  /** Énergie brûlée par saut, prélevée en orbite au départ. */
  fuelPerJump: number;
}

export const SHIPS: Record<LegacyShipId, ShipDef> = {
  cargo_small: {
    id: "cargo_small",
    capacity: 200,
    cost: { metals: 60, components: 10 },
    buildMs: 45_000,
    speedMult: 1,
    fuelPerJump: 8,
  },
  cargo_large: {
    id: "cargo_large",
    capacity: 600,
    cost: { metals: 180, components: 40 },
    buildMs: 120_000,
    requiresTech: "orbital_logistics",
    speedMult: 1.25,
    fuelPerJump: 20,
  },
  // ── Classes du chantier 12 : arbitrer entre volume, vitesse et carburant ──
  hauler: {
    id: "hauler",
    capacity: 1800,
    cost: { metals: 520, components: 140 },
    buildMs: 240_000,
    requiresTech: "space_elevator",
    speedMult: 1.7,
    fuelPerJump: 45,
  },
  courier: {
    id: "courier",
    capacity: 80,
    cost: { metals: 90, components: 30 },
    buildMs: 60_000,
    requiresTech: "orbital_logistics",
    speedMult: 0.55,
    fuelPerJump: 5,
  },
};

/** Taille max de la file de production navale. */
export const MAX_SHIP_QUEUE_LENGTH = 3;
