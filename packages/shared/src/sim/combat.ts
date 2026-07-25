import {
  CATEGORY_ADVANTAGE,
  COMBAT_PHASES,
  COUNTER_BONUS,
  DIRECTIVE_COUNTER,
  DIRECTIVES,
  WARSHIP_CATEGORY,
  WARSHIP_IDS,
  WARSHIPS,
  type CombatCategory,
  type CombatDirective,
  type CombatPhase,
} from "../content/warships.js";
import type { ShipStats } from "./design.js";

/** Salves de tir par phase : les boucliers ne régénèrent qu'en début de phase. */
export const ROUNDS_PER_PHASE = 3;

/** Composition d'une flotte : nombre de vaisseaux par id (classe historique ou plan). */
export type FleetComposition = Partial<Record<string, number>>;

/** Directive choisie par phase (long / medium / short). */
export type Directives = Record<CombatPhase, CombatDirective>;

/**
 * Stats de combat d'un type de vaisseau, indépendantes de sa provenance (classe figée
 * ou plan conçu). Le combat n'a besoin que de ce sous-ensemble.
 */
export interface CombatDef {
  hull: number;
  shield: number;
  weapons: Record<CombatPhase, number>;
  initiative: number;
  fleetDamageBonus: number;
  category: CombatCategory;
}

/** Table de combat des classes historiques : sert de défaut et couvre les PNJ pirates. */
export const WARSHIP_COMBAT_DEFS: Record<string, CombatDef> = Object.fromEntries(
  WARSHIP_IDS.map((id) => {
    const def = WARSHIPS[id];
    return [
      id,
      {
        hull: def.hull,
        shield: def.shield,
        weapons: def.weapons,
        initiative: def.initiative,
        fleetDamageBonus: def.fleetDamageBonus ?? 0,
        category: WARSHIP_CATEGORY[id],
      } satisfies CombatDef,
    ];
  }),
);

/** Convertit des stats de plan (sim/design) en définition de combat. */
export function combatDefFromStats(stats: ShipStats): CombatDef {
  return {
    hull: stats.hull,
    shield: stats.shield,
    weapons: stats.weapons,
    initiative: stats.initiative,
    fleetDamageBonus: stats.fleetDamageBonus,
    category: stats.category,
  };
}

/** Un vaisseau individuel pendant la bataille. */
interface ShipInstance {
  id: string;
  hull: number;
  maxShield: number;
  shield: number;
}

export interface PhaseReport {
  phase: CombatPhase;
  attackerDirective: CombatDirective;
  defenderDirective: CombatDirective;
  attackerDamageDealt: number;
  defenderDamageDealt: number;
  attackerLosses: FleetComposition;
  defenderLosses: FleetComposition;
}

export interface BattleReport {
  winner: "attacker" | "defender" | "draw";
  phases: PhaseReport[];
  /** Vaisseaux survivants de chaque camp. */
  attackerSurvivors: FleetComposition;
  defenderSurvivors: FleetComposition;
  attackerLosses: FleetComposition;
  defenderLosses: FleetComposition;
}

function expand(composition: FleetComposition, defs: Record<string, CombatDef>): ShipInstance[] {
  const ships: ShipInstance[] = [];
  for (const [id, count] of Object.entries(composition)) {
    const def = defs[id];
    if (!def) continue;
    for (let i = 0; i < (count ?? 0); i++) {
      ships.push({ id, hull: def.hull, maxShield: def.shield, shield: def.shield });
    }
  }
  return ships;
}

function collapse(ships: ShipInstance[]): FleetComposition {
  const composition: FleetComposition = {};
  for (const ship of ships) {
    composition[ship.id] = (composition[ship.id] ?? 0) + 1;
  }
  return composition;
}

/** Somme des bonus de dégâts de flotte apportés par les vaisseaux de soutien vivants. */
function supportBonus(ships: ShipInstance[], defs: Record<string, CombatDef>): number {
  let bonus = 0;
  for (const ship of ships) {
    if (ship.hull > 0) bonus += defs[ship.id]?.fleetDamageBonus ?? 0;
  }
  return 1 + bonus;
}

/** Puissance de feu brute d'une flotte pour une phase, avant directives. */
function firepower(
  ships: ShipInstance[],
  phase: CombatPhase,
  defs: Record<string, CombatDef>,
): number {
  let power = 0;
  for (const ship of ships) {
    if (ship.hull > 0) power += defs[ship.id]?.weapons[phase] ?? 0;
  }
  return power * supportBonus(ships, defs);
}

/** Multiplicateur de dégâts de la directive attaquante face à la directive adverse. */
function directiveMultiplier(own: CombatDirective, enemy: CombatDirective): number {
  const base = DIRECTIVES[own].damageMult;
  return DIRECTIVE_COUNTER[own] === enemy ? base * COUNTER_BONUS : base;
}

/**
 * Distribue un pool de `damage` sur la flotte cible. `focus` concentre le feu
 * sur les plus gros vaisseaux (coque max décroissante) ; sinon, cibles par
 * initiative croissante (les plus fragiles d'abord). Boucliers avant la coque.
 * `mult` par cible = avantage de triangle (catégories) × défense adverse.
 */
function applyDamage(
  targets: ShipInstance[],
  damage: number,
  incomingMult: number,
  focus: boolean,
  attackerMix: FleetComposition,
  defs: Record<string, CombatDef>,
): void {
  const order = [...targets]
    .filter((s) => s.hull > 0)
    .sort((a, b) =>
      focus
        ? (defs[b.id]?.hull ?? 0) - (defs[a.id]?.hull ?? 0)
        : (defs[a.id]?.initiative ?? 0) - (defs[b.id]?.initiative ?? 0),
    );
  if (order.length === 0) return;

  // Avantage de triangle moyen de la flotte attaquante contre cette cible (par catégorie).
  const advantageAgainst = (targetId: string): number => {
    const targetCat = defs[targetId]?.category;
    if (!targetCat) return 1;
    let weighted = 0;
    let total = 0;
    for (const [atkId, count] of Object.entries(attackerMix)) {
      const n = count ?? 0;
      const atkCat = defs[atkId]?.category;
      total += n;
      weighted += n * (atkCat ? (CATEGORY_ADVANTAGE[atkCat]?.[targetCat] ?? 1) : 1);
    }
    return total > 0 ? weighted / total : 1;
  };

  let pool = damage;
  for (const ship of order) {
    if (pool <= 0) break;
    const mult = advantageAgainst(ship.id) * incomingMult;
    if (mult <= 0) continue;
    const pvRemaining = ship.shield + ship.hull;
    const poolToKill = pvRemaining / mult;
    const poolUsed = Math.min(pool, poolToKill);
    let pvRemoved = poolUsed * mult;
    pool -= poolUsed;
    // Boucliers d'abord, puis coque.
    const toShield = Math.min(ship.shield, pvRemoved);
    ship.shield -= toShield;
    pvRemoved -= toShield;
    ship.hull -= pvRemoved;
    if (ship.hull < 0) ship.hull = 0;
  }
}

/**
 * Résout une bataille en 3 phases. Purement déterministe : mêmes flottes +
 * mêmes directives → même issue. `defs` fournit les stats de chaque id présent
 * (défaut : classes historiques ; le serveur y injecte les plans conçus).
 */
export function resolveBattle(
  attacker: FleetComposition,
  defender: FleetComposition,
  attackerDirectives: Directives,
  defenderDirectives: Directives,
  defs: Record<string, CombatDef> = WARSHIP_COMBAT_DEFS,
): BattleReport {
  const atk = expand(attacker, defs);
  const def = expand(defender, defs);
  const phases: PhaseReport[] = [];

  const alive = (ships: ShipInstance[]) => ships.filter((s) => s.hull > 0);

  for (const phase of COMBAT_PHASES) {
    if (alive(atk).length === 0 || alive(def).length === 0) break;

    // Régénération des boucliers (modulée par la directive).
    for (const ship of atk) {
      if (ship.hull > 0)
        ship.shield = ship.maxShield * DIRECTIVES[attackerDirectives[phase]].shieldMult;
    }
    for (const ship of def) {
      if (ship.hull > 0)
        ship.shield = ship.maxShield * DIRECTIVES[defenderDirectives[phase]].shieldMult;
    }

    const atkDir = attackerDirectives[phase];
    const defDir = defenderDirectives[phase];
    const atkBefore = collapse(alive(atk));
    const defBefore = collapse(alive(def));
    let atkDamageTotal = 0;
    let defDamageTotal = 0;

    // Plusieurs salves : les boucliers ne régénèrent pas entre les salves.
    for (let round = 0; round < ROUNDS_PER_PHASE; round++) {
      if (alive(atk).length === 0 || alive(def).length === 0) break;
      const atkMix = collapse(alive(atk));
      const defMix = collapse(alive(def));
      const atkDamage = firepower(atk, phase, defs) * directiveMultiplier(atkDir, defDir);
      const defDamage = firepower(def, phase, defs) * directiveMultiplier(defDir, atkDir);
      atkDamageTotal += atkDamage;
      defDamageTotal += defDamage;
      // Tirs simultanés : on fige les compositions avant d'appliquer.
      applyDamage(
        def,
        atkDamage,
        DIRECTIVES[defDir].incomingMult,
        atkDir === "focus_fire",
        atkMix,
        defs,
      );
      applyDamage(
        atk,
        defDamage,
        DIRECTIVES[atkDir].incomingMult,
        defDir === "focus_fire",
        defMix,
        defs,
      );
    }

    const atkAfter = collapse(alive(atk));
    const defAfter = collapse(alive(def));
    phases.push({
      phase,
      attackerDirective: atkDir,
      defenderDirective: defDir,
      attackerDamageDealt: Math.round(atkDamageTotal),
      defenderDamageDealt: Math.round(defDamageTotal),
      attackerLosses: diff(atkBefore, atkAfter),
      defenderLosses: diff(defBefore, defAfter),
    });
  }

  const atkSurv = collapse(alive(atk));
  const defSurv = collapse(alive(def));
  const atkAlive = alive(atk).length;
  const defAlive = alive(def).length;
  const winner: BattleReport["winner"] =
    atkAlive > 0 && defAlive === 0
      ? "attacker"
      : defAlive > 0 && atkAlive === 0
        ? "defender"
        : atkAlive === 0 && defAlive === 0
          ? "draw"
          : // Les deux survivent (rare, phases épuisées) : au plus de coque restante.
            totalHull(atk) >= totalHull(def)
            ? "attacker"
            : "defender";

  return {
    winner,
    phases,
    attackerSurvivors: atkSurv,
    defenderSurvivors: defSurv,
    attackerLosses: diff(collapse(expand(attacker, defs)), atkSurv),
    defenderLosses: diff(collapse(expand(defender, defs)), defSurv),
  };
}

function totalHull(ships: ShipInstance[]): number {
  return ships.reduce((s, ship) => s + Math.max(0, ship.hull), 0);
}

function diff(before: FleetComposition, after: FleetComposition): FleetComposition {
  const losses: FleetComposition = {};
  for (const id of Object.keys(before)) {
    const lost = (before[id] ?? 0) - (after[id] ?? 0);
    if (lost > 0) losses[id] = lost;
  }
  return losses;
}

/** Puissance indicative d'une flotte (pour l'UI et l'équilibrage des pirates). */
export function fleetPower(
  composition: FleetComposition,
  defs: Record<string, CombatDef> = WARSHIP_COMBAT_DEFS,
): number {
  let power = 0;
  for (const [id, count] of Object.entries(composition)) {
    const def = defs[id];
    if (!def) continue;
    const avgWeapon = (def.weapons.long + def.weapons.medium + def.weapons.short) / 3;
    power += (count ?? 0) * (def.hull + def.shield + avgWeapon * 4);
  }
  return Math.round(power);
}

export function fleetIsEmpty(composition: FleetComposition): boolean {
  return Object.values(composition).every((n) => !n);
}
