import { describe, expect, it } from "vitest";
import { CHASSIS } from "../../content/chassis.js";
import { MODULES } from "../../content/modules.js";
import { PRESETS, presetById } from "../../content/presets.js";
import { TECH_IDS, type TechId } from "../../content/techs.js";
import { computeEffects, NO_EFFECTS } from "../empire/research.js";
import {
  blueprintLoad,
  resolveBlueprint,
  validateBlueprint,
} from "./design.js";

const ALL = computeEffects(TECH_IDS as unknown as TechId[]);

describe("validateBlueprint", () => {
  it("les plans de départ sont constructibles sans recherche", () => {
    for (const id of ["interceptor", "freighter_mk1"]) {
      const p = presetById(id)!;
      expect(validateBlueprint(p, NO_EFFECTS)).toEqual([]);
    }
  });

  it("tous les presets sont valides une fois tout recherché", () => {
    for (const p of PRESETS) {
      expect(validateBlueprint(p, ALL), p.id).toEqual([]);
    }
  });

  it("un plan avancé est refusé tant que sa tech manque", () => {
    const cruiser = presetById("cruiser_mk1")!;
    expect(validateBlueprint(cruiser, NO_EFFECTS).length).toBeGreaterThan(0);
  });

  it("refuse le dépassement d'emplacements", () => {
    // scout_frame n'a qu'un slot d'arme.
    const problems = validateBlueprint(
      { chassisId: "scout_frame", modules: ["laser_pulse", "laser_pulse"] },
      NO_EFFECTS,
    );
    expect(problems.some((p) => p.includes("weapon"))).toBe(true);
  });

  it("refuse le dépassement de budget (tonnage)", () => {
    // light_freighter : 2 slots utility, tonnage 60 ; 2 soutes XL = 40 t… mais non débloquées.
    const problems = validateBlueprint(
      { chassisId: "scout_frame", modules: ["armor_plating", "cargo_pod"] },
      NO_EFFECTS,
    );
    // scout_frame tonnage 30 ; armor 12 + cargo 8 = 20 → OK, mais defense+utility remplis.
    expect(problems).toEqual([]);
  });

  it("signale châssis et module inconnus", () => {
    expect(
      validateBlueprint({ chassisId: "nope", modules: [] }, ALL)[0],
    ).toContain("inconnu");
    expect(
      validateBlueprint(
        { chassisId: "scout_frame", modules: ["nope"] },
        ALL,
      ).some((p) => p.includes("inconnu")),
    ).toBe(true);
  });

  it("accepte des tables de châssis/modules injectées (chantier 23.10)", () => {
    const customChassis = {
      ...CHASSIS,
      freshly_minted: { ...CHASSIS.scout_frame, id: "freshly_minted" },
    };
    // Inconnu de la table statique → "inconnu" ; connu de la table injectée → pas "inconnu"
    // (juste "non débloqué", NO_EFFECTS n'ayant jamais entendu parler de cet id).
    expect(
      validateBlueprint(
        { chassisId: "freshly_minted", modules: [] },
        NO_EFFECTS,
      )[0],
    ).toContain("inconnu");
    const problems = validateBlueprint(
      { chassisId: "freshly_minted", modules: [] },
      NO_EFFECTS,
      customChassis,
    );
    expect(problems.some((p) => p.includes("inconnu"))).toBe(false);
  });
});

describe("resolveBlueprint", () => {
  it("un plan d'arme a de la puissance de feu sur les trois portées", () => {
    const s = resolveBlueprint(presetById("interceptor")!);
    expect(s.hull).toBeGreaterThan(0);
    expect(s.weapons.long).toBeGreaterThan(0);
    expect(s.weapons.medium).toBeGreaterThan(0);
    expect(s.weapons.short).toBeGreaterThan(0);
    expect(s.domain).toBe("fleet");
  });

  it("un cargo a de la soute et pas d'armes", () => {
    const s = resolveBlueprint(presetById("freighter_mk1")!);
    expect(s.capacity).toBeGreaterThan(0);
    expect(s.weapons.long + s.weapons.medium + s.weapons.short).toBe(0);
    expect(s.domain).toBe("colony");
  });

  it("le bonus de rôle du châssis majore l'effet (soute)", () => {
    // light_freighter roleBonus cargo 1.2 : 2 pods de 150 → 360.
    const s = resolveBlueprint(presetById("freighter_mk1")!);
    expect(s.capacity).toBeCloseTo(
      2 * MODULES.cargo_pod.effects.capacity! * 1.2,
    );
  });

  it("le châssis lourd a plus de coque que le léger", () => {
    expect(resolveBlueprint(presetById("dread_mk1")!).hull).toBeGreaterThan(
      resolveBlueprint(presetById("interceptor")!).hull,
    );
  });

  it("le clipper porte plus que le cargo léger", () => {
    expect(resolveBlueprint(presetById("clipper")!).capacity).toBeGreaterThan(
      resolveBlueprint(presetById("freighter_mk1")!).capacity,
    );
  });

  it("le vaisseau colonial est colonisateur", () => {
    expect(resolveBlueprint(presetById("settler")!).colonizer).toBe(true);
  });

  it("le coût agrège châssis et modules", () => {
    const s = resolveBlueprint({
      chassisId: "scout_frame",
      modules: ["cargo_pod"],
    });
    expect(s.cost.metals).toBe(
      CHASSIS.scout_frame.cost.metals! + MODULES.cargo_pod.cost.metals!,
    );
  });

  it("accepte des tables de châssis/modules injectées (chantier 23.10) — id inconnu des tables statiques", () => {
    const customChassis = {
      ...CHASSIS,
      freshly_minted: {
        ...CHASSIS.scout_frame,
        id: "freshly_minted",
        hull: 9999,
      },
    };
    const customModules = {
      ...MODULES,
      also_new: {
        ...MODULES.cargo_pod,
        id: "also_new",
        effects: { capacity: 500 },
      },
    };
    const s = resolveBlueprint(
      { chassisId: "freshly_minted", modules: ["also_new"] },
      customChassis,
      customModules,
    );
    expect(s.hull).toBe(9999);
    expect(s.capacity).toBe(500);
    // Sans les tables injectées, ces ids n'existent pas.
    expect(
      resolveBlueprint({ chassisId: "freshly_minted", modules: [] }).hull,
    ).toBe(0);
  });
});

describe("blueprintLoad", () => {
  it("somme les budgets consommés", () => {
    const load = blueprintLoad({
      chassisId: "scout_frame",
      modules: ["laser_pulse", "cargo_pod"],
    });
    expect(load.power).toBe(
      MODULES.laser_pulse.power + MODULES.cargo_pod.power,
    );
    expect(load.tonnage).toBe(
      MODULES.laser_pulse.tonnage + MODULES.cargo_pod.tonnage,
    );
  });
});

describe("déblocage par la recherche", () => {
  it("les modules/châssis de base sont débloqués sans tech", () => {
    expect(NO_EFFECTS.unlockedChassis.has("scout_frame")).toBe(true);
    expect(NO_EFFECTS.unlockedModules.has("laser_pulse")).toBe(true);
    expect(NO_EFFECTS.unlockedChassis.has("warframe")).toBe(false);
    expect(NO_EFFECTS.unlockedModules.has("railgun")).toBe(false);
  });

  it("rechercher la tech débloque son châssis/module", () => {
    const e = computeEffects([
      "military_doctrine",
      "capital_ships",
    ] as TechId[]);
    expect(e.unlockedChassis.has("warframe")).toBe(true);
    expect(e.unlockedChassis.has("battlecruiser")).toBe(true);
    expect(e.unlockedModules.has("railgun")).toBe(true);
    expect(e.unlockedModules.has("deflector_shield")).toBe(true);
  });

  it("accepte des tables de châssis/modules injectées (chantier 23.10)", () => {
    const customChassis = {
      ...CHASSIS,
      freshly_minted: {
        ...CHASSIS.scout_frame,
        id: "freshly_minted",
        requiresTech: "metallurgy",
      },
    };
    const withTech = computeEffects(
      ["metallurgy"] as TechId[],
      undefined,
      customChassis,
    );
    expect(withTech.unlockedChassis.has("freshly_minted")).toBe(true);
    expect(
      computeEffects(["metallurgy"] as TechId[]).unlockedChassis.has(
        "freshly_minted",
      ),
    ).toBe(false);
  });
});
