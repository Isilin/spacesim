import { describe, expect, it } from "vitest";
import {
  breakRelationReason,
  declareWarReason,
  makePeaceReason,
  proposeRelationReason,
  relationKey,
  WAR_COOLDOWN_MS,
} from "./diplomacy.js";

describe("relationKey", () => {
  it("est stable quel que soit l'ordre des arguments", () => {
    expect(relationKey("a", "b")).toBe(relationKey("b", "a"));
  });
});

describe("declareWarReason", () => {
  it("autorise depuis neutre ou nap, sans cooldown actif", () => {
    expect(declareWarReason("neutral", 0, null)).toBeNull();
    expect(declareWarReason("nap", 0, null)).toBeNull();
  });
  it("refuse si déjà en guerre", () => {
    expect(declareWarReason("war", 0, null)).toMatch(/Déjà en guerre/);
  });
  it("refuse une alliance sans la rompre d'abord", () => {
    expect(declareWarReason("alliance", 0, null)).toMatch(/Rompez l'alliance/);
  });
  it("refuse pendant le cooldown, autorise une fois passé", () => {
    expect(declareWarReason("neutral", 100, 200)).toMatch(/Cooldown/);
    expect(declareWarReason("neutral", 200, 200)).toBeNull();
  });
});

describe("makePeaceReason", () => {
  it("autorise seulement depuis la guerre", () => {
    expect(makePeaceReason("war")).toBeNull();
    expect(makePeaceReason("neutral")).toMatch(/Pas en guerre/);
    expect(makePeaceReason("nap")).toMatch(/Pas en guerre/);
    expect(makePeaceReason("alliance")).toMatch(/Pas en guerre/);
  });
});

describe("proposeRelationReason", () => {
  it("refuse en pleine guerre", () => {
    expect(proposeRelationReason("war", "nap")).toMatch(/En guerre/);
    expect(proposeRelationReason("war", "alliance")).toMatch(/En guerre/);
  });
  it("refuse de reproposer l'état déjà en vigueur", () => {
    expect(proposeRelationReason("nap", "nap")).toMatch(/Déjà en pacte/);
    expect(proposeRelationReason("alliance", "alliance")).toMatch(/Déjà alliés/);
  });
  it("refuse de rétrograder une alliance en NAP sans la rompre d'abord", () => {
    expect(proposeRelationReason("alliance", "nap")).toMatch(/Rompez l'alliance/);
  });
  it("autorise neutre → nap/alliance, et nap → alliance", () => {
    expect(proposeRelationReason("neutral", "nap")).toBeNull();
    expect(proposeRelationReason("neutral", "alliance")).toBeNull();
    expect(proposeRelationReason("nap", "alliance")).toBeNull();
  });
});

describe("breakRelationReason", () => {
  it("autorise depuis nap ou alliance", () => {
    expect(breakRelationReason("nap")).toBeNull();
    expect(breakRelationReason("alliance")).toBeNull();
  });
  it("refuse depuis neutre ou guerre", () => {
    expect(breakRelationReason("neutral")).toMatch(/Aucun pacte/);
    expect(breakRelationReason("war")).toMatch(/Aucun pacte/);
  });
});

describe("WAR_COOLDOWN_MS", () => {
  it("est positif", () => {
    expect(WAR_COOLDOWN_MS).toBeGreaterThan(0);
  });
});
