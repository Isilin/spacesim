import { describe, expect, it } from "vitest";
import type { Rng } from "../../rng.js";
import {
  generateObjectiveSpec,
  objectiveMet,
  OBJECTIVE_DURATION_MS,
  OBJECTIVE_KINDS,
} from "./objectives.js";

/** Rng jouet : rejoue une séquence fixe, boucle si épuisée. */
function fakeRng(values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe("generateObjectiveSpec", () => {
  it("ne tire jamais hold_system sans revendication existante", () => {
    // Échantillonne l'espace de tirage : aucun résultat ne doit être hold_system.
    for (let i = 0; i < 10; i++) {
      const spec = generateObjectiveSpec(fakeRng([i / 10]), 0, 3, []);
      expect(spec.kind).not.toBe("hold_system");
    }
  });

  it("peut tirer hold_system quand l'empire a une revendication, avec ce système pour cible", () => {
    // Le premier tirage (index de kind = 0) correspond à colonize_n_systems dans
    // OBJECTIVE_KINDS ; on force plutôt le dernier indice pour viser hold_system.
    const lastIndex =
      OBJECTIVE_KINDS.indexOf("hold_system") / OBJECTIVE_KINDS.length;
    const spec = generateObjectiveSpec(fakeRng([lastIndex, 0]), 0, 3, [
      "sys-1",
      "sys-2",
    ]);
    expect(spec.kind).toBe("hold_system");
    expect(["sys-1", "sys-2"]).toContain(spec.targetSystemId);
  });

  it("colonize_n_systems vise toujours plus que le nombre actuel de colonies", () => {
    const idx =
      OBJECTIVE_KINDS.indexOf("colonize_n_systems") / OBJECTIVE_KINDS.length;
    const spec = generateObjectiveSpec(fakeRng([idx, 0]), 0, 5, []);
    expect(spec.kind).toBe("colonize_n_systems");
    expect(spec.targetCount).toBeGreaterThan(5);
  });

  it("pose une échéance à OBJECTIVE_DURATION_MS de l'instant donné", () => {
    const spec = generateObjectiveSpec(fakeRng([0]), 1000, 1, []);
    expect(spec.deadline).toBe(1000 + OBJECTIVE_DURATION_MS);
    expect(spec.createdAt).toBe(1000);
  });

  it("déterministe : même rng + même état = même résultat", () => {
    const a = generateObjectiveSpec(fakeRng([0.4, 0.1]), 0, 3, ["sys-1"]);
    const b = generateObjectiveSpec(fakeRng([0.4, 0.1]), 0, 3, ["sys-1"]);
    expect(a).toEqual(b);
  });
});

describe("objectiveMet", () => {
  it("colonize_n_systems : rempli une fois le compte atteint ou dépassé", () => {
    expect(
      objectiveMet(
        { kind: "colonize_n_systems", targetCount: 5 },
        progress({ colonyCount: 4 }),
      ),
    ).toBe(false);
    expect(
      objectiveMet(
        { kind: "colonize_n_systems", targetCount: 5 },
        progress({ colonyCount: 5 }),
      ),
    ).toBe(true);
  });

  it("hold_system : rempli tant que le système visé reste revendiqué", () => {
    const spec = { kind: "hold_system" as const, targetSystemId: "sys-1" };
    expect(objectiveMet(spec, progress({ claimedSystemIds: ["sys-2"] }))).toBe(
      false,
    );
    expect(
      objectiveMet(spec, progress({ claimedSystemIds: ["sys-1", "sys-2"] })),
    ).toBe(true);
  });

  it("lead_population / lead_influence : reflètent directement le classement fourni", () => {
    expect(
      objectiveMet(
        { kind: "lead_population" },
        progress({ leadsPopulation: false }),
      ),
    ).toBe(false);
    expect(
      objectiveMet(
        { kind: "lead_population" },
        progress({ leadsPopulation: true }),
      ),
    ).toBe(true);
    expect(
      objectiveMet(
        { kind: "lead_influence" },
        progress({ leadsInfluence: true }),
      ),
    ).toBe(true);
  });
});

function progress(overrides: Partial<Parameters<typeof objectiveMet>[1]> = {}) {
  return {
    colonyCount: 0,
    claimedSystemIds: [],
    leadsPopulation: false,
    leadsInfluence: false,
    ...overrides,
  };
}
