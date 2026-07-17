import { describe, expect, it } from "vitest";
import { TECH_IDS, TECHS } from "../content/techs.js";
import { canResearch, computeEffects } from "./research.js";

describe("arbre de techs", () => {
  it("tous les prérequis existent et aucun cycle", () => {
    for (const id of TECH_IDS) {
      for (const req of TECHS[id].requires) {
        expect(TECH_IDS).toContain(req);
      }
    }
    // Tri topologique : si toutes les techs finissent recherchables, pas de cycle.
    const researched: (typeof TECH_IDS)[number][] = [];
    let progress = true;
    while (progress) {
      progress = false;
      for (const id of TECH_IDS) {
        if (!researched.includes(id) && canResearch(id, researched)) {
          researched.push(id);
          progress = true;
        }
      }
    }
    expect(researched).toHaveLength(TECH_IDS.length);
  });
});

describe("computeEffects", () => {
  it("sans tech : bâtiments industriels verrouillés", () => {
    const effects = computeEffects([]);
    expect(effects.unlockedBuildings.has("mine")).toBe(true);
    expect(effects.unlockedBuildings.has("smelter")).toBe(false);
    expect(effects.outputMultAll).toBe(1);
  });

  it("cumule les multiplicateurs", () => {
    const effects = computeEffects(["metallurgy", "advanced_mining", "automation", "industrial_chains"]);
    expect(effects.unlockedBuildings.has("smelter")).toBe(true);
    expect(effects.unlockedBuildings.has("component_factory")).toBe(true);
    expect(effects.outputMult.mine).toBe(1.25);
    expect(effects.outputMultAll).toBe(1.1);
  });
});

describe("canResearch", () => {
  it("respecte les prérequis", () => {
    expect(canResearch("metallurgy", [])).toBe(true);
    expect(canResearch("industrial_chains", [])).toBe(false);
    expect(canResearch("industrial_chains", ["metallurgy"])).toBe(true);
    expect(canResearch("metallurgy", ["metallurgy"])).toBe(false);
  });
});
