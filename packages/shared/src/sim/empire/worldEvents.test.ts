import { describe, expect, it } from "vitest";
import type { Rng } from "../../rng.js";
import {
  rollWorldEvent,
  worldEventPriceBonus,
  WORLD_EVENT_KINDS,
  WORLD_EVENT_PRICE_BONUS,
  WORLD_EVENT_PRICE_PENALTY,
  WORLD_EVENT_TRIGGER_CHANCE,
} from "./worldEvents.js";

/** Rng jouet : rejoue une séquence fixe, boucle si épuisée. */
function fakeRng(values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe("rollWorldEvent", () => {
  it("ne déclenche rien si le tirage dépasse la chance de déclenchement", () => {
    expect(
      rollWorldEvent(fakeRng([WORLD_EVENT_TRIGGER_CHANCE + 0.01])),
    ).toBeNull();
  });

  it("déclenche un des types connus si le tirage passe sous la chance", () => {
    const kind = rollWorldEvent(fakeRng([0, 0.1]));
    expect(kind).not.toBeNull();
    expect(WORLD_EVENT_KINDS).toContain(kind);
  });

  it("déterministe : même rng = même résultat", () => {
    expect(rollWorldEvent(fakeRng([0.01, 0.5]))).toBe(
      rollWorldEvent(fakeRng([0.01, 0.5])),
    );
  });
});

describe("worldEventPriceBonus", () => {
  it("nul sans événement actif", () => {
    expect(worldEventPriceBonus([])).toBe(0);
  });

  it("positif sous une ruée, négatif sous une crise", () => {
    expect(worldEventPriceBonus(["gold_rush"])).toBe(WORLD_EVENT_PRICE_BONUS);
    expect(worldEventPriceBonus(["economic_crisis"])).toBe(
      -WORLD_EVENT_PRICE_PENALTY,
    );
  });

  it("les autres types n'affectent pas les prix", () => {
    expect(worldEventPriceBonus(["pirate_surge"])).toBe(0);
    expect(worldEventPriceBonus(["faction_boom"])).toBe(0);
  });

  it("cumule plusieurs événements simultanés", () => {
    expect(worldEventPriceBonus(["gold_rush", "gold_rush"])).toBe(
      2 * WORLD_EVENT_PRICE_BONUS,
    );
  });
});
