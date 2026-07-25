import type { Rng } from "../rng.js";
import type { WorldEventKind } from "../types.js";

export const WORLD_EVENT_KINDS: readonly WorldEventKind[] = [
  "economic_crisis",
  "gold_rush",
  "pirate_surge",
  "faction_boom",
];

/** Durée d'un événement de monde — comparable à une humeur de faction prolongée. */
export const WORLD_EVENT_DURATION_MS = 1_800_000;

/** Chance qu'un nouvel événement se déclenche à un tick économique donné. */
export const WORLD_EVENT_TRIGGER_CHANCE = 0.05;

/** economic_crisis / gold_rush : effet sur les prix en station de la galaxie touchée. */
export const WORLD_EVENT_PRICE_PENALTY = 0.15;
export const WORLD_EVENT_PRICE_BONUS = 0.2;

/** pirate_surge : multiplicateur de la chance de spawn de repaire dans la galaxie touchée. */
export const WORLD_EVENT_PIRATE_MULT = 3;

/**
 * Tire le prochain événement de monde à un tick économique, ou aucun. Pur et
 * déterministe pour un rng donné — même mécanique que les humeurs de faction et les
 * repaires pirates (rng dérivé du tick côté serveur).
 */
export function rollWorldEvent(rng: Rng): WorldEventKind | null {
  if (rng() > WORLD_EVENT_TRIGGER_CHANCE) return null;
  return WORLD_EVENT_KINDS[Math.floor(rng() * WORLD_EVENT_KINDS.length)]!;
}

/** Bonus/malus de prix en station dû aux événements de monde actifs sur une galaxie. */
export function worldEventPriceBonus(kinds: readonly WorldEventKind[]): number {
  let bonus = 0;
  for (const kind of kinds) {
    if (kind === "gold_rush") bonus += WORLD_EVENT_PRICE_BONUS;
    if (kind === "economic_crisis") bonus -= WORLD_EVENT_PRICE_PENALTY;
  }
  return bonus;
}
