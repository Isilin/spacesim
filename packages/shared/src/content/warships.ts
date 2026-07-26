import type { TechId } from "./techs.js";
import type { ResourceId } from "../model/resources.js";

export const WARSHIP_IDS = [
  "fighter",
  "frigate",
  "cruiser",
  "support",
  "corvette",
  "bomber",
  "dreadnought",
] as const;

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
  // ── Classes avancées (chantier 11) : chacune prolonge un rôle existant ──
  corvette: {
    id: "corvette",
    hull: 60,
    shield: 30,
    weapons: { long: 6, medium: 12, short: 14 },
    initiative: 26,
    cost: { metals: 90, components: 25 },
    buildMs: 55_000,
    requiresTech: "point_defense",
  },
  bomber: {
    id: "bomber",
    hull: 110,
    shield: 20,
    weapons: { long: 30, medium: 12, short: 4 },
    initiative: 8,
    cost: { metals: 220, components: 80 },
    buildMs: 110_000,
    requiresTech: "strike_doctrine",
  },
  dreadnought: {
    id: "dreadnought",
    hull: 480,
    shield: 140,
    weapons: { long: 44, medium: 34, short: 20 },
    initiative: 10,
    cost: { metals: 700, components: 220 },
    buildMs: 260_000,
    requiresTech: "dreadnoughts",
  },
};

/**
 * Catégorie de rôle d'un vaisseau au combat. Depuis le chantier 13, les vaisseaux ne sont
 * plus des classes figées mais des plans ; le triangle de forces s'exprime donc entre
 * **catégories** (dérivées du plan, cf. sim/design) plutôt qu'entre ids précis.
 */
export const COMBAT_CATEGORIES = ["skirmisher", "line", "capital", "support"] as const;

export type CombatCategory = (typeof COMBAT_CATEGORIES)[number];

/**
 * Triangle de forces (à la Endless Space) : escarmoucheur > capital > ligne > escarmoucheur.
 * Le soutien est neutre. Multiplicateur des dégâts infligés par [attaquant][défenseur].
 */
export const CATEGORY_ADVANTAGE: Record<CombatCategory, Partial<Record<CombatCategory, number>>> = {
  skirmisher: { capital: 1.5, line: 0.7 },
  line: { skirmisher: 1.5, capital: 0.7 },
  capital: { line: 1.5, skirmisher: 0.7 },
  support: {},
};

/** Catégorie des classes historiques (presets/PNJ), conservée pour la compat. */
export const WARSHIP_CATEGORY: Record<WarshipId, CombatCategory> = {
  fighter: "skirmisher",
  corvette: "skirmisher",
  frigate: "line",
  bomber: "line",
  cruiser: "capital",
  dreadnought: "capital",
  support: "support",
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
