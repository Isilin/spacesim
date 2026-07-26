import type { Rng } from "../../rng.js";
import type { FactionMood, FactionState } from "../../model/social.js";

/** Chance qu'une faction neutre bascule d'humeur, à chaque tick économique. */
export const FACTION_MOOD_SHIFT_CHANCE = 0.08;

/** Durée d'une humeur non neutre avant retour au calme. */
export const FACTION_MOOD_DURATION_MS = 1_800_000;

/**
 * Remise additionnelle sur les achats du joueur pendant un boom — vient s'ajouter à la
 * remise de réputation existante (`repBonus`), même mécanique (`stationRepBonus`), pour ne
 * jamais dépasser le budget réellement payé (juste plus de retour dessus).
 */
export const FACTION_BOOM_REBATE = 0.15;

/** Sous ce standing, un embargo ferme le commerce — les partenaires établis y échappent. */
export const FACTION_EMBARGO_STANDING_THRESHOLD = 100;

const TRIGGERABLE_MOODS: readonly FactionMood[] = ["boom", "shortage", "embargo"];

/**
 * Fait évoluer l'humeur d'une faction à un tick économique : neutre → bascule aléatoire
 * vers boom/pénurie/embargo pour une durée fixe, puis retour à neutre à l'échéance. Pur et
 * déterministe pour un rng donné (dérivé du tick côté serveur, comme les repaires pirates).
 */
export function factionTick(state: FactionState, rng: Rng, now: number): FactionState {
  if (state.mood !== "neutral") {
    if (state.moodUntil !== null && now >= state.moodUntil) {
      return { ...state, mood: "neutral", moodUntil: null };
    }
    return state;
  }
  if (rng() > FACTION_MOOD_SHIFT_CHANCE) return state;
  const mood = TRIGGERABLE_MOODS[Math.floor(rng() * TRIGGERABLE_MOODS.length)]!;
  return { ...state, mood, moodUntil: now + FACTION_MOOD_DURATION_MS };
}

/** Bonus de remise (fraction) dû à l'humeur — s'ajoute à la remise de réputation. */
export function moodRebateBonus(mood: FactionMood): number {
  return mood === "boom" ? FACTION_BOOM_REBATE : 0;
}

/** Un embargo ferme le commerce aux empires qui n'ont pas encore fait leurs preuves. */
export function embargoBlocks(mood: FactionMood, standing: number): boolean {
  return mood === "embargo" && standing < FACTION_EMBARGO_STANDING_THRESHOLD;
}

/**
 * Contrat publié par une faction en pénurie (chantier 15) : au-dessus du spot pour
 * inciter à livrer, borné dans le temps comme l'humeur qui l'a déclenché.
 */
export const FACTION_CONTRACT_PRICE_MULT = 1.25;
export const FACTION_CONTRACT_DURATION_MS = FACTION_MOOD_DURATION_MS;
export const FACTION_CONTRACT_QUANTITY_MIN = 40;
export const FACTION_CONTRACT_QUANTITY_MAX = 120;
