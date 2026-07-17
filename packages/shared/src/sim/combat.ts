import {
  CLASS_ADVANTAGE,
  COMBAT_PHASES,
  COUNTER_BONUS,
  DIRECTIVE_COUNTER,
  DIRECTIVES,
  WARSHIPS,
  type CombatDirective,
  type CombatPhase,
  type WarshipId,
} from "../content/warships.js";

/** Salves de tir par phase : les boucliers ne régénèrent qu'en début de phase. */
export const ROUNDS_PER_PHASE = 3;

/** Composition d'une flotte : nombre de vaisseaux par classe. */
export type FleetComposition = Partial<Record<WarshipId, number>>;

/** Directive choisie par phase (long / medium / short). */
export type Directives = Record<CombatPhase, CombatDirective>;

/** Un vaisseau individuel pendant la bataille. */
interface ShipInstance {
  id: WarshipId;
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

function expand(composition: FleetComposition): ShipInstance[] {
  const ships: ShipInstance[] = [];
  for (const [id, count] of Object.entries(composition) as [WarshipId, number][]) {
    const def = WARSHIPS[id];
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
function supportBonus(ships: ShipInstance[]): number {
  let bonus = 0;
  for (const ship of ships) {
    if (ship.hull > 0) bonus += WARSHIPS[ship.id].fleetDamageBonus ?? 0;
  }
  return 1 + bonus;
}

/** Puissance de feu brute d'une flotte pour une phase, avant directives. */
function firepower(ships: ShipInstance[], phase: CombatPhase): number {
  let power = 0;
  for (const ship of ships) {
    if (ship.hull > 0) power += WARSHIPS[ship.id].weapons[phase];
  }
  return power * supportBonus(ships);
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
 * `mult` par cible = avantage de triangle × défense adverse : PV retirés par
 * point de pool consommé.
 */
function applyDamage(
  targets: ShipInstance[],
  damage: number,
  incomingMult: number,
  focus: boolean,
  attackerMix: FleetComposition,
): void {
  const order = [...targets]
    .filter((s) => s.hull > 0)
    .sort((a, b) =>
      focus
        ? WARSHIPS[b.id].hull - WARSHIPS[a.id].hull
        : WARSHIPS[a.id].initiative - WARSHIPS[b.id].initiative,
    );
  if (order.length === 0) return;

  // Avantage de triangle moyen de la flotte attaquante contre cette cible.
  const advantageAgainst = (targetId: WarshipId): number => {
    let weighted = 0;
    let total = 0;
    for (const [atkId, count] of Object.entries(attackerMix) as [WarshipId, number][]) {
      const n = count ?? 0;
      total += n;
      weighted += n * (CLASS_ADVANTAGE[atkId]?.[targetId] ?? 1);
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
 * mêmes directives → même issue. Les deux camps choisissent une directive par
 * phase à l'avance.
 */
export function resolveBattle(
  attacker: FleetComposition,
  defender: FleetComposition,
  attackerDirectives: Directives,
  defenderDirectives: Directives,
): BattleReport {
  const atk = expand(attacker);
  const def = expand(defender);
  const phases: PhaseReport[] = [];

  const alive = (ships: ShipInstance[]) => ships.filter((s) => s.hull > 0);

  for (const phase of COMBAT_PHASES) {
    if (alive(atk).length === 0 || alive(def).length === 0) break;

    // Régénération des boucliers (modulée par la directive).
    for (const ship of atk) {
      if (ship.hull > 0) ship.shield = ship.maxShield * DIRECTIVES[attackerDirectives[phase]].shieldMult;
    }
    for (const ship of def) {
      if (ship.hull > 0) ship.shield = ship.maxShield * DIRECTIVES[defenderDirectives[phase]].shieldMult;
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
      const atkDamage = firepower(atk, phase) * directiveMultiplier(atkDir, defDir);
      const defDamage = firepower(def, phase) * directiveMultiplier(defDir, atkDir);
      atkDamageTotal += atkDamage;
      defDamageTotal += defDamage;
      // Tirs simultanés : on fige les compositions avant d'appliquer.
      applyDamage(def, atkDamage, DIRECTIVES[defDir].incomingMult, atkDir === "focus_fire", atkMix);
      applyDamage(atk, defDamage, DIRECTIVES[atkDir].incomingMult, defDir === "focus_fire", defMix);
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
    attackerLosses: diff(collapse(expand(attacker)), atkSurv),
    defenderLosses: diff(collapse(expand(defender)), defSurv),
  };
}

function totalHull(ships: ShipInstance[]): number {
  return ships.reduce((s, ship) => s + Math.max(0, ship.hull), 0);
}

function diff(before: FleetComposition, after: FleetComposition): FleetComposition {
  const losses: FleetComposition = {};
  for (const id of Object.keys(before) as WarshipId[]) {
    const lost = (before[id] ?? 0) - (after[id] ?? 0);
    if (lost > 0) losses[id] = lost;
  }
  return losses;
}

/** Puissance indicative d'une flotte (pour l'UI et l'équilibrage des pirates). */
export function fleetPower(composition: FleetComposition): number {
  let power = 0;
  for (const [id, count] of Object.entries(composition) as [WarshipId, number][]) {
    const def = WARSHIPS[id];
    const avgWeapon = (def.weapons.long + def.weapons.medium + def.weapons.short) / 3;
    power += (count ?? 0) * (def.hull + def.shield + avgWeapon * 4);
  }
  return Math.round(power);
}

export function fleetIsEmpty(composition: FleetComposition): boolean {
  return Object.values(composition).every((n) => !n);
}
