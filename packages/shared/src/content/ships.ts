import type { TechId } from "./techs.js";
import type { ResourceId, ShipId } from "../types.js";

export interface ShipDef {
  id: ShipId;
  /** Capacité de soute (unités de ressources). */
  capacity: number;
  cost: Partial<Record<ResourceId, number>>;
  buildMs: number;
  /** Tech requise pour la production (en plus du chantier naval). */
  requiresTech?: TechId;
}

export const SHIPS: Record<ShipId, ShipDef> = {
  cargo_small: {
    id: "cargo_small",
    capacity: 200,
    cost: { metals: 60, components: 10 },
    buildMs: 45_000,
  },
  cargo_large: {
    id: "cargo_large",
    capacity: 600,
    cost: { metals: 180, components: 40 },
    buildMs: 120_000,
    requiresTech: "orbital_logistics",
  },
};

/** Taille max de la file de production navale. */
export const MAX_SHIP_QUEUE_LENGTH = 3;
