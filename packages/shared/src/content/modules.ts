import type { CombatPhase } from "./warships.js";
import type { TechId } from "./techs.js";
import type { ResourceId } from "../types.js";

/**
 * Conception de vaisseaux (chantier 13). Un vaisseau = un **châssis** (content/chassis)
 * garni de **modules**. Chaque module occupe un emplacement typé et consomme des budgets
 * (énergie / tonnage / calcul) — modèle EVE-like : slots fixes + budgets partagés.
 */
export const SLOT_TYPES = ["weapon", "defense", "propulsion", "utility"] as const;

export type SlotType = (typeof SLOT_TYPES)[number];

/**
 * Rôle fonctionnel d'un module. Le châssis peut majorer un rôle (bonus de spécialisation) ;
 * tous les rôles restent montables sur n'importe quel châssis compatible en slots.
 */
export const MODULE_ROLES = [
  "weapon",
  "defense",
  "propulsion",
  "cargo",
  "mining",
  "habitat",
  "support",
  "sensor",
] as const;

export type ModuleRole = (typeof MODULE_ROLES)[number];

/** Effets cumulables d'un module (sommés par le résolveur, cf. sim/design). */
export interface ModuleEffects {
  /** Puissance de feu ajoutée par phase de portée. */
  weapons?: Partial<Record<CombatPhase, number>>;
  /** Boucliers ajoutés. */
  shield?: number;
  /** Points de coque ajoutés. */
  hullBonus?: number;
  /** Initiative ajoutée. */
  initiative?: number;
  /** Soute ajoutée (unités de ressources). */
  capacity?: number;
  /** Delta additif au multiplicateur de vitesse du châssis. */
  speedMult?: number;
  /** Delta (négatif = plus sobre) au carburant par saut. */
  fuelDelta?: number;
  /** Rendement d'extraction ajouté (avant-postes/minage). */
  miningYield?: number;
  /** Rend le vaisseau capable de fonder une colonie. */
  colonizer?: boolean;
  /** Bonus de dégâts de flotte (soutien). */
  fleetDamageBonus?: number;
}

export const MODULE_IDS = [
  // Armes (slot weapon)
  "laser_pulse",
  "autocannon",
  "railgun",
  "missile_battery",
  // Défenses (slot defense)
  "armor_plating",
  "deflector_shield",
  "aegis_shield",
  // Propulsion (slot propulsion)
  "ion_thruster",
  "warp_drive",
  "ramscoop",
  // Utilitaires (slot utility)
  "cargo_pod",
  "cargo_hold_xl",
  "mining_laser",
  "habitat_pod",
  "fleet_uplink",
  "sensor_array",
  // Conception de vaisseaux (chantier 13) : techs dédiées.
  "plasma_cannon",
  "reactive_plating",
  "graviton_engine",
  "deep_core_drill",
] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

export interface ModuleDef {
  id: ModuleId;
  slot: SlotType;
  role: ModuleRole;
  /** Budgets consommés. */
  power: number;
  tonnage: number;
  calc: number;
  /** Coût ajouté à la construction du vaisseau. */
  cost: Partial<Record<ResourceId, number>>;
  /** Temps de production ajouté au châssis (ms). */
  buildMs: number;
  /** Tech requise ; absente = disponible d'emblée (voir BASE_MODULES). */
  requiresTech?: TechId;
  effects: ModuleEffects;
}

export const MODULES: Record<ModuleId, ModuleDef> = {
  // ─── Armes ───
  laser_pulse: {
    id: "laser_pulse",
    slot: "weapon",
    role: "weapon",
    power: 10,
    tonnage: 5,
    calc: 4,
    cost: { metals: 20, components: 8 },
    buildMs: 8_000,
    effects: { weapons: { long: 2, medium: 4, short: 8 }, initiative: 2 },
  },
  autocannon: {
    id: "autocannon",
    slot: "weapon",
    role: "weapon",
    power: 8,
    tonnage: 6,
    calc: 3,
    cost: { metals: 18, components: 6 },
    buildMs: 8_000,
    requiresTech: "point_defense",
    effects: { weapons: { long: 1, medium: 5, short: 7 } },
  },
  railgun: {
    id: "railgun",
    slot: "weapon",
    role: "weapon",
    power: 14,
    tonnage: 8,
    calc: 6,
    cost: { metals: 30, components: 12 },
    buildMs: 12_000,
    requiresTech: "capital_ships",
    effects: { weapons: { long: 8, medium: 5, short: 2 } },
  },
  missile_battery: {
    id: "missile_battery",
    slot: "weapon",
    role: "weapon",
    power: 12,
    tonnage: 10,
    calc: 5,
    cost: { metals: 25, components: 10 },
    buildMs: 12_000,
    requiresTech: "strike_doctrine",
    effects: { weapons: { long: 6, medium: 4, short: 1 } },
  },
  // ─── Défenses ───
  armor_plating: {
    id: "armor_plating",
    slot: "defense",
    role: "defense",
    power: 2,
    tonnage: 12,
    calc: 1,
    cost: { metals: 40, components: 5 },
    buildMs: 6_000,
    effects: { hullBonus: 60 },
  },
  deflector_shield: {
    id: "deflector_shield",
    slot: "defense",
    role: "defense",
    power: 12,
    tonnage: 4,
    calc: 6,
    cost: { metals: 15, components: 10 },
    buildMs: 8_000,
    requiresTech: "military_doctrine",
    effects: { shield: 30 },
  },
  aegis_shield: {
    id: "aegis_shield",
    slot: "defense",
    role: "defense",
    power: 20,
    tonnage: 8,
    calc: 10,
    cost: { metals: 40, components: 25 },
    buildMs: 12_000,
    requiresTech: "capital_ships",
    effects: { shield: 70 },
  },
  // ─── Propulsion ───
  ion_thruster: {
    id: "ion_thruster",
    slot: "propulsion",
    role: "propulsion",
    power: 8,
    tonnage: 4,
    calc: 3,
    cost: { metals: 15 },
    buildMs: 5_000,
    effects: { speedMult: 0.3, fuelDelta: 4 },
  },
  warp_drive: {
    id: "warp_drive",
    slot: "propulsion",
    role: "propulsion",
    power: 14,
    tonnage: 6,
    calc: 6,
    cost: { metals: 40, components: 15 },
    buildMs: 9_000,
    requiresTech: "fusion_power",
    effects: { speedMult: 0.6, fuelDelta: 10 },
  },
  ramscoop: {
    id: "ramscoop",
    slot: "propulsion",
    role: "propulsion",
    power: 6,
    tonnage: 4,
    calc: 4,
    cost: { metals: 25, components: 8 },
    buildMs: 7_000,
    requiresTech: "space_elevator",
    effects: { speedMult: 0.1, fuelDelta: -5 },
  },
  // ─── Utilitaires ───
  cargo_pod: {
    id: "cargo_pod",
    slot: "utility",
    role: "cargo",
    power: 1,
    tonnage: 8,
    calc: 1,
    cost: { metals: 20, components: 5 },
    buildMs: 6_000,
    effects: { capacity: 150 },
  },
  cargo_hold_xl: {
    id: "cargo_hold_xl",
    slot: "utility",
    role: "cargo",
    power: 2,
    tonnage: 20,
    calc: 2,
    cost: { metals: 45, components: 12 },
    buildMs: 12_000,
    requiresTech: "space_elevator",
    effects: { capacity: 450 },
  },
  mining_laser: {
    id: "mining_laser",
    slot: "utility",
    role: "mining",
    power: 6,
    tonnage: 6,
    calc: 4,
    cost: { metals: 25, components: 10 },
    buildMs: 9_000,
    requiresTech: "advanced_mining",
    effects: { miningYield: 40 },
  },
  habitat_pod: {
    id: "habitat_pod",
    slot: "utility",
    role: "habitat",
    power: 4,
    tonnage: 15,
    calc: 3,
    cost: { metals: 60, components: 20 },
    buildMs: 14_000,
    requiresTech: "colonial_engineering",
    effects: { colonizer: true },
  },
  fleet_uplink: {
    id: "fleet_uplink",
    slot: "utility",
    role: "support",
    power: 8,
    tonnage: 5,
    calc: 8,
    cost: { metals: 30, components: 20 },
    buildMs: 10_000,
    requiresTech: "fleet_logistics",
    effects: { fleetDamageBonus: 0.12 },
  },
  sensor_array: {
    id: "sensor_array",
    slot: "utility",
    role: "sensor",
    power: 4,
    tonnage: 3,
    calc: 6,
    cost: { metals: 20, components: 8 },
    buildMs: 7_000,
    requiresTech: "astro_cartography",
    effects: { initiative: 4 },
  },
  // ─── Conception de vaisseaux (chantier 13) : techs dédiées ───
  plasma_cannon: {
    id: "plasma_cannon",
    slot: "weapon",
    role: "weapon",
    power: 18,
    tonnage: 10,
    calc: 8,
    cost: { metals: 50, components: 20 },
    buildMs: 14_000,
    requiresTech: "plasma_weapons",
    effects: { weapons: { long: 20, medium: 20, short: 20 } },
  },
  reactive_plating: {
    id: "reactive_plating",
    slot: "defense",
    role: "defense",
    power: 6,
    tonnage: 20,
    calc: 2,
    cost: { metals: 80, components: 15 },
    buildMs: 11_000,
    requiresTech: "reactive_armor",
    effects: { hullBonus: 120 },
  },
  graviton_engine: {
    id: "graviton_engine",
    slot: "propulsion",
    role: "propulsion",
    power: 20,
    tonnage: 8,
    calc: 10,
    cost: { metals: 60, components: 30 },
    buildMs: 13_000,
    requiresTech: "graviton_thrusters",
    effects: { speedMult: 0.9, fuelDelta: 6 },
  },
  deep_core_drill: {
    id: "deep_core_drill",
    slot: "utility",
    role: "mining",
    power: 10,
    tonnage: 10,
    calc: 6,
    cost: { metals: 40, components: 15 },
    buildMs: 12_000,
    requiresTech: "xeno_survey",
    effects: { miningYield: 80 },
  },
};

/** Modules disponibles sans recherche (le reste est débloqué par sa `requiresTech`). */
export const BASE_MODULES: ModuleId[] = [
  "laser_pulse",
  "armor_plating",
  "ion_thruster",
  "cargo_pod",
];
