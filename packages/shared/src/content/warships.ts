import type { TechId } from "./techs.js";
import type { ResourceId } from "../types.js";

export const WARSHIP_IDS = ["fighter", "frigate", "cruiser", "support"] as const;

export type WarshipId = (typeof WARSHIP_IDS)[number];

/** Les trois phases d'une bataille, dans l'ordre de résolution. */
export const COMBAT_PHASES = ["long", "medium", "short"] as const;

export type CombatPhase = (typeof COMBAT_PHASES)[number];

export interface WarshipDef {
  id: WarshipId;
  /** Points de coque (détruit à 0). */
  hull: number;
  /** Boucliers régénérés au début de chaque phase (absorbent avant la coque). */
  shield: number;
  /** Puissance de feu par phase de portée. */
  weapons: Record<CombatPhase, number>;
  /** Initiative : ordre de tir dans une phase (le plus haut tire en premier). */
  initiative: number;
  cost: Partial<Record<ResourceId, number>>;
  buildMs: number;
  requiresTech: TechId;
  /** Bonus de flotte par vaisseau de soutien (dégâts alliés). */
  fleetDamageBonus?: number;
}

/**
 * Triangle de forces (à la Endless Space, simplifié) :
 * chasseur > croiseur > frégate > chasseur. Le soutien renforce la flotte.
 * Chaque classe brille à une portée : croiseur au long, frégate au moyen, chasseur en mêlée.
 */
export const WARSHIPS: Record<WarshipId, WarshipDef> = {
  fighter: {
    id: "fighter",
    hull: 40,
    shield: 10,
    weapons: { long: 4, medium: 8, short: 16 },
    initiative: 30,
    cost: { metals: 60, components: 15 },
    buildMs: 40_000,
    requiresTech: "military_doctrine",
  },
  frigate: {
    id: "frigate",
    hull: 90,
    shield: 25,
    weapons: { long: 10, medium: 16, short: 10 },
    initiative: 20,
    cost: { metals: 140, components: 35 },
    buildMs: 70_000,
    requiresTech: "military_doctrine",
  },
  cruiser: {
    id: "cruiser",
    hull: 200,
    shield: 60,
    weapons: { long: 26, medium: 16, short: 8 },
    initiative: 12,
    cost: { metals: 320, components: 90 },
    buildMs: 130_000,
    requiresTech: "capital_ships",
  },
  support: {
    id: "support",
    hull: 120,
    shield: 80,
    weapons: { long: 6, medium: 6, short: 6 },
    initiative: 15,
    cost: { metals: 180, components: 70 },
    buildMs: 100_000,
    requiresTech: "fleet_logistics",
    fleetDamageBonus: 0.12,
  },
};

/**
 * Matrice d'efficacité du triangle : multiplicateur des dégâts infligés
 * par [attaquant][défenseur]. > 1 = avantage.
 */
export const CLASS_ADVANTAGE: Record<WarshipId, Partial<Record<WarshipId, number>>> = {
  fighter: { cruiser: 1.5, frigate: 0.7 },
  frigate: { fighter: 1.5, cruiser: 0.7 },
  cruiser: { frigate: 1.5, fighter: 0.7 },
  support: {},
};

export const COMBAT_DIRECTIVES = ["barrage", "shields", "evasive", "focus_fire"] as const;

export type CombatDirective = (typeof COMBAT_DIRECTIVES)[number];

export interface DirectiveDef {
  /** Multiplicateur de dégâts infligés. */
  damageMult: number;
  /** Multiplicateur de dégâts subis (défense : < 1 = mieux protégé). */
  incomingMult: number;
  /** Bonus de boucliers en début de phase. */
  shieldMult: number;
}

export const DIRECTIVES: Record<CombatDirective, DirectiveDef> = {
  barrage: { damageMult: 1.35, incomingMult: 1.15, shieldMult: 1 },
  shields: { damageMult: 0.85, incomingMult: 0.7, shieldMult: 1.5 },
  evasive: { damageMult: 0.9, incomingMult: 0.8, shieldMult: 1 },
  focus_fire: { damageMult: 1.15, incomingMult: 1.05, shieldMult: 1 },
};

/**
 * Contre-triangle des directives (mind-game) : bonus de dégâts si votre directive
 * « contre » celle de l'adversaire. barrage < shields < evasive < barrage ;
 * focus_fire est neutre mais concentre le feu (voir sim/combat).
 */
export const DIRECTIVE_COUNTER: Record<CombatDirective, CombatDirective | null> = {
  barrage: "evasive", // le barrage écrase l'évitement
  evasive: "shields", // l'évitement déborde les boucliers
  shields: "barrage", // les boucliers encaissent le barrage
  focus_fire: null,
};

export const COUNTER_BONUS = 1.2;
