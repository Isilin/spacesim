import { describe, expect, it } from "vitest";
import { TECH_IDS, TECHS, type TechId } from "../../content/techs.js";
import {
  descendants,
  missingPrereqs,
  pathCost,
  pathDurationMs,
  researchPath,
  techDepth,
  techLayout,
  validateTree,
} from "./techtree.js";

describe("intégrité de l'arbre", () => {
  it("ne contient ni cycle ni prérequis inconnu", () => {
    expect(validateTree()).toEqual([]);
  });

  it("chaque branche a au moins une racine, sinon rien n'est atteignable", () => {
    const branches = new Set(TECH_IDS.map((id) => TECHS[id].branch));
    for (const branch of branches) {
      const roots = TECH_IDS.filter(
        (id) => TECHS[id].branch === branch && TECHS[id].requires.length === 0,
      );
      expect(roots.length).toBeGreaterThan(0);
    }
  });
});

describe("techDepth", () => {
  it("place une racine à 0 et un enfant après tous ses prérequis", () => {
    for (const id of TECH_IDS) {
      const tech = TECHS[id];
      if (tech.requires.length === 0) {
        expect(techDepth(id)).toBe(0);
      } else {
        for (const req of tech.requires) {
          expect(techDepth(id)).toBeGreaterThan(techDepth(req));
        }
      }
    }
  });

  it("prend le plus long chemin, pas le plus court", () => {
    // gateway_engineering dépend de deux chaînes de longueurs différentes.
    const tech = TECHS.gateway_engineering;
    const expected = Math.max(...tech.requires.map((r) => techDepth(r) + 1));
    expect(techDepth("gateway_engineering")).toBe(expected);
  });
});

describe("techLayout", () => {
  it("positionne toutes les techs, sans collision dans une même branche", () => {
    const layout = techLayout();
    expect(layout.size).toBe(TECH_IDS.length);
    const seen = new Set<string>();
    for (const [id, pos] of layout) {
      const key = `${pos.branch}:${pos.depth}:${pos.row}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      expect(pos.branch).toBe(TECHS[id].branch);
    }
  });

  it("est stable d'un appel à l'autre", () => {
    expect([...techLayout()]).toEqual([...techLayout()]);
  });
});

describe("researchPath", () => {
  it("rend la chaîne complète, prérequis d'abord", () => {
    const path = researchPath("gateway_engineering", []);
    expect(path.at(-1)).toBe("gateway_engineering");
    // Chaque tech de la chaîne apparaît après tous ses prérequis présents.
    for (const [index, id] of path.entries()) {
      for (const req of TECHS[id].requires) {
        const reqIndex = path.indexOf(req);
        if (reqIndex >= 0) expect(reqIndex).toBeLessThan(index);
      }
    }
  });

  it("ignore ce qui est déjà acquis", () => {
    const full = researchPath("fusion_power", []);
    const partial = researchPath("fusion_power", ["metallurgy"]);
    expect(partial).not.toContain("metallurgy");
    expect(partial.length).toBe(full.length - 1);
  });

  it("rend une chaîne vide pour une tech déjà acquise", () => {
    expect(researchPath("metallurgy", ["metallurgy"])).toEqual([]);
  });

  it("rend une seule tech quand tous les prérequis sont acquis", () => {
    const tech = TECHS.advanced_mining;
    expect(researchPath("advanced_mining", tech.requires)).toEqual(["advanced_mining"]);
  });

  it("cumule coût et durée de la chaîne", () => {
    const path = researchPath("fusion_power", []);
    expect(pathCost(path)).toBe(path.reduce((s, id) => s + TECHS[id].cost, 0));
    expect(pathDurationMs(path)).toBe(path.reduce((s, id) => s + TECHS[id].durationMs, 0));
    // Une chaîne coûte forcément plus que sa dernière tech seule.
    expect(pathCost(path)).toBeGreaterThan(TECHS.fusion_power.cost);
  });
});

describe("missingPrereqs / descendants", () => {
  it("liste les prérequis directs non acquis", () => {
    expect(missingPrereqs("advanced_mining", [])).toEqual(["metallurgy"]);
    expect(missingPrereqs("advanced_mining", ["metallurgy"])).toEqual([]);
    expect(missingPrereqs("metallurgy", [])).toEqual([]);
  });

  it("descendants remonte tout ce qu'une tech débloque en aval", () => {
    const fromMetallurgy = descendants("metallurgy");
    expect(fromMetallurgy).toContain("advanced_mining");
    expect(fromMetallurgy).toContain("fusion_power");
    expect(fromMetallurgy).not.toContain("metallurgy");
    // Une feuille ne débloque rien.
    const leaves = TECH_IDS.filter((id: TechId) => descendants(id).length === 0);
    expect(leaves.length).toBeGreaterThan(0);
  });
});
