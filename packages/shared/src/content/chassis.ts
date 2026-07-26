import type { ModuleRole, SlotType } from "./modules.js";
import type { TechId } from "./techs.js";
import type { ResourceId } from "../model/resources.js";

/**
 * Châssis d'un vaisseau (chantier 13). Fournit la coque de base, des emplacements typés
 * en nombre fixe et des budgets (énergie/tonnage/calcul) que les modules consomment.
 *
 * Hybride : `kind` "generic" = polyvalent, sans bonus ; les autres sont spécialisés
 * (slots orientés + `roleBonus` sur leur rôle de prédilection).
 */
export type ChassisKind = "generic" | "military" | "freighter" | "miner" | "colonizer" | "explorer";

/** Où vit et se produit un vaisseau bâti : flotte (combat/mouvement) ou pool de colonie. */
export type ShipDomain = "fleet" | "colony";

export interface ChassisDef {
  id: ChassisId;
  kind: ChassisKind;
  domain: ShipDomain;
  /** Coque de base (avant modules). */
  hull: number;
  /** Initiative de base (les gros châssis tirent après les légers). */
  baseInitiative: number;
  /** Budgets partagés entre modules. */
  power: number;
  tonnage: number;
  calc: number;
  /** Emplacements offerts par type. */
  slots: Record<SlotType, number>;
  /** Vitesse et carburant de la coque nue (modules propulsion en dérivent). */
  baseSpeedMult: number;
  baseFuelPerJump: number;
  /** Majoration des effets d'un rôle de module (spécialisation). */
  roleBonus?: Partial<Record<ModuleRole, number>>;
  cost: Partial<Record<ResourceId, number>>;
  buildMs: number;
  /** Tech requise ; absente = disponible d'emblée (voir BASE_CHASSIS). */
  requiresTech?: TechId;
}

export const CHASSIS_IDS = [
  "scout_frame",
  "standard_hull",
  "warframe",
  "battlecruiser",
  "light_freighter",
  "heavy_freighter",
  "mining_barge",
  "colony_ark",
  "explorer_frame",
] as const;

export type ChassisId = (typeof CHASSIS_IDS)[number];

export const CHASSIS: Record<ChassisId, ChassisDef> = {
  // ─── Génériques ───
  scout_frame: {
    id: "scout_frame",
    kind: "generic",
    domain: "fleet",
    hull: 50,
    baseInitiative: 28,
    power: 30,
    tonnage: 30,
    calc: 20,
    slots: { weapon: 1, defense: 1, propulsion: 1, utility: 1 },
    baseSpeedMult: 1.4,
    baseFuelPerJump: 6,
    cost: { metals: 50 },
    buildMs: 45_000,
  },
  standard_hull: {
    id: "standard_hull",
    kind: "generic",
    domain: "fleet",
    hull: 120,
    baseInitiative: 18,
    power: 60,
    tonnage: 70,
    calc: 45,
    slots: { weapon: 2, defense: 2, propulsion: 1, utility: 2 },
    baseSpeedMult: 1.0,
    baseFuelPerJump: 12,
    cost: { metals: 120 },
    buildMs: 90_000,
  },
  // ─── Militaires spécialisés ───
  warframe: {
    id: "warframe",
    kind: "military",
    domain: "fleet",
    hull: 200,
    baseInitiative: 14,
    power: 110,
    tonnage: 130,
    calc: 90,
    slots: { weapon: 3, defense: 2, propulsion: 1, utility: 1 },
    baseSpeedMult: 1.0,
    baseFuelPerJump: 18,
    roleBonus: { weapon: 1.15 },
    cost: { metals: 300 },
    buildMs: 130_000,
    requiresTech: "military_doctrine",
  },
  battlecruiser: {
    id: "battlecruiser",
    kind: "military",
    domain: "fleet",
    hull: 480,
    baseInitiative: 10,
    power: 180,
    tonnage: 240,
    calc: 140,
    slots: { weapon: 4, defense: 3, propulsion: 1, utility: 2 },
    baseSpeedMult: 0.9,
    baseFuelPerJump: 30,
    roleBonus: { weapon: 1.2, defense: 1.1 },
    cost: { metals: 700 },
    buildMs: 260_000,
    requiresTech: "capital_ships",
  },
  // ─── Civils spécialisés (domain colony) ───
  light_freighter: {
    id: "light_freighter",
    kind: "freighter",
    domain: "colony",
    hull: 40,
    baseInitiative: 12,
    power: 25,
    tonnage: 60,
    calc: 20,
    slots: { weapon: 0, defense: 1, propulsion: 1, utility: 2 },
    baseSpeedMult: 1.0,
    baseFuelPerJump: 8,
    roleBonus: { cargo: 1.2 },
    cost: { metals: 40 },
    buildMs: 45_000,
  },
  heavy_freighter: {
    id: "heavy_freighter",
    kind: "freighter",
    domain: "colony",
    hull: 90,
    baseInitiative: 8,
    power: 40,
    tonnage: 200,
    calc: 40,
    slots: { weapon: 0, defense: 1, propulsion: 1, utility: 4 },
    baseSpeedMult: 1.4,
    baseFuelPerJump: 30,
    roleBonus: { cargo: 1.5 },
    cost: { metals: 400 },
    buildMs: 200_000,
    requiresTech: "space_elevator",
  },
  mining_barge: {
    id: "mining_barge",
    kind: "miner",
    domain: "colony",
    hull: 70,
    baseInitiative: 8,
    power: 40,
    tonnage: 120,
    calc: 40,
    slots: { weapon: 0, defense: 1, propulsion: 1, utility: 3 },
    baseSpeedMult: 0.8,
    baseFuelPerJump: 15,
    roleBonus: { mining: 1.6 },
    cost: { metals: 200 },
    buildMs: 120_000,
    requiresTech: "advanced_mining",
  },
  colony_ark: {
    id: "colony_ark",
    kind: "colonizer",
    domain: "colony",
    hull: 150,
    baseInitiative: 6,
    power: 50,
    tonnage: 160,
    calc: 40,
    slots: { weapon: 0, defense: 1, propulsion: 1, utility: 3 },
    baseSpeedMult: 0.7,
    baseFuelPerJump: 25,
    roleBonus: { habitat: 1.3 },
    cost: { metals: 300 },
    buildMs: 180_000,
    requiresTech: "colonial_engineering",
  },
  // ─── Éclaireur lointain (chantier 13) : prospection profonde, hors des sentiers battus ───
  explorer_frame: {
    id: "explorer_frame",
    kind: "explorer",
    domain: "colony",
    hull: 60,
    baseInitiative: 20,
    power: 45,
    tonnage: 50,
    calc: 35,
    slots: { weapon: 0, defense: 1, propulsion: 2, utility: 3 },
    baseSpeedMult: 1.6,
    baseFuelPerJump: 10,
    roleBonus: { sensor: 1.3, mining: 1.15 },
    cost: { metals: 150 },
    buildMs: 90_000,
    requiresTech: "xeno_survey",
  },
};

/** Châssis disponibles sans recherche (le reste est débloqué par sa `requiresTech`). */
export const BASE_CHASSIS: ChassisId[] = ["scout_frame", "standard_hull", "light_freighter"];
