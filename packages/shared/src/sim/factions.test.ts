import { describe, expect, it } from "vitest";
import type { Rng } from "../rng.js";
import type { FactionState } from "../model/social.js";
import {
  embargoBlocks,
  FACTION_EMBARGO_STANDING_THRESHOLD,
  FACTION_MOOD_DURATION_MS,
  factionTick,
  moodRebateBonus,
} from "./factions.js";

/** Rng jouet : rejoue une séquence fixe, boucle si épuisée. */
function fakeRng(values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length]!;
}

function makeState(overrides: Partial<FactionState> = {}): FactionState {
  return { factionId: "ferride", mood: "neutral", moodUntil: null, ...overrides };
}

describe("factionTick", () => {
  it("reste neutre si le tirage dépasse la chance de bascule", () => {
    const state = makeState();
    const next = factionTick(state, fakeRng([0.5]), 0);
    expect(next).toEqual(state);
  });

  it("bascule vers une humeur non neutre si le tirage passe sous la chance", () => {
    const state = makeState();
    const next = factionTick(state, fakeRng([0.01, 0]), 1000);
    expect(next.mood).not.toBe("neutral");
    expect(next.moodUntil).toBe(1000 + FACTION_MOOD_DURATION_MS);
  });

  it("reste dans l'humeur courante tant que l'échéance n'est pas atteinte", () => {
    const state = makeState({ mood: "boom", moodUntil: 1000 });
    const next = factionTick(state, fakeRng([0]), 999);
    expect(next).toEqual(state);
  });

  it("revient à neutre une fois l'échéance dépassée", () => {
    const state = makeState({ mood: "boom", moodUntil: 1000 });
    const next = factionTick(state, fakeRng([0]), 1000);
    expect(next.mood).toBe("neutral");
    expect(next.moodUntil).toBeNull();
  });

  it("déterministe : même état + même rng + même instant = même résultat", () => {
    const state = makeState();
    const a = factionTick(state, fakeRng([0.01, 0.5]), 0);
    const b = factionTick(state, fakeRng([0.01, 0.5]), 0);
    expect(a).toEqual(b);
  });
});

describe("moodRebateBonus", () => {
  it("bonus positif en boom, nul sinon", () => {
    expect(moodRebateBonus("boom")).toBeGreaterThan(0);
    expect(moodRebateBonus("neutral")).toBe(0);
    expect(moodRebateBonus("shortage")).toBe(0);
    expect(moodRebateBonus("embargo")).toBe(0);
  });
});

describe("embargoBlocks", () => {
  it("bloque sous le seuil de standing pendant un embargo", () => {
    expect(embargoBlocks("embargo", FACTION_EMBARGO_STANDING_THRESHOLD - 1)).toBe(true);
  });
  it("laisse passer un partenaire établi malgré l'embargo", () => {
    expect(embargoBlocks("embargo", FACTION_EMBARGO_STANDING_THRESHOLD)).toBe(false);
  });
  it("ne bloque jamais hors embargo", () => {
    expect(embargoBlocks("neutral", 0)).toBe(false);
    expect(embargoBlocks("boom", 0)).toBe(false);
    expect(embargoBlocks("shortage", 0)).toBe(false);
  });
});
