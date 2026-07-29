import { describe, expect, it } from "vitest";
import type { CombatDirective, CombatPhase } from "../../content/warships.js";
import {
  DEFAULT_COMBAT_TUNING,
  fleetIsEmpty,
  fleetPower,
  resolveBattle,
  WARSHIP_COMBAT_DEFS,
  type CombatDef,
  type CombatTuning,
  type Directives,
  type FleetComposition,
} from "./combat.js";

function dir(all: CombatDirective): Directives {
  return { long: all, medium: all, short: all };
}

const focus = dir("focus_fire");

describe("resolveBattle", () => {
  it("est déterministe", () => {
    const a: FleetComposition = { frigate: 3, cruiser: 1 };
    const b: FleetComposition = { fighter: 4, frigate: 2 };
    const r1 = resolveBattle(a, b, focus, focus);
    const r2 = resolveBattle(a, b, focus, focus);
    expect(r1).toEqual(r2);
  });

  it("la grosse flotte identique gagne", () => {
    const big: FleetComposition = { cruiser: 5 };
    const small: FleetComposition = { cruiser: 2 };
    const report = resolveBattle(big, small, focus, focus);
    expect(report.winner).toBe("attacker");
    expect(fleetIsEmpty(report.defenderSurvivors)).toBe(true);
    expect(report.attackerSurvivors.cruiser).toBeGreaterThan(0);
  });

  it("comptabilise pertes et survivants de façon cohérente", () => {
    const a: FleetComposition = { frigate: 4 };
    const b: FleetComposition = { fighter: 6 };
    const report = resolveBattle(a, b, focus, focus);
    for (const comp of [
      [a, report.attackerSurvivors, report.attackerLosses],
      [b, report.defenderSurvivors, report.defenderLosses],
    ] as const) {
      const [initial, survivors, losses] = comp;
      for (const id of Object.keys(initial) as (keyof FleetComposition)[]) {
        expect((survivors[id] ?? 0) + (losses[id] ?? 0)).toBe(initial[id]);
      }
    }
  });

  it("triangle : chasseurs battent des croiseurs à effectif de coque comparable", () => {
    // 10 chasseurs (400 coque) vs 2 croiseurs (400 coque) : l'avantage de classe tranche.
    const fighters: FleetComposition = { fighter: 10 };
    const cruisers: FleetComposition = { cruiser: 2 };
    const report = resolveBattle(fighters, cruisers, focus, focus);
    expect(report.winner).toBe("attacker");
  });

  it("triangle : frégates battent des chasseurs", () => {
    const frigates: FleetComposition = { frigate: 3 };
    const fighters: FleetComposition = { fighter: 6 };
    const report = resolveBattle(frigates, fighters, focus, focus);
    expect(report.winner).toBe("attacker");
  });

  it("directive de contre : le barrage écrase l'évitement à flottes égales", () => {
    const fleet: FleetComposition = { frigate: 4 };
    const barrage = resolveBattle(fleet, fleet, dir("barrage"), dir("evasive"));
    // L'attaquant (barrage) contre l'évitement adverse → il l'emporte.
    expect(barrage.winner).toBe("attacker");
  });

  it("trois phases au maximum", () => {
    const report = resolveBattle({ cruiser: 3 }, { cruiser: 3 }, focus, focus);
    expect(report.phases.length).toBeLessThanOrEqual(3);
    const phases = report.phases.map((p) => p.phase);
    expect(phases).toEqual(([...phases] as CombatPhase[]).slice(0, phases.length));
  });

  it("un réglage injecté (chantier 23.5) remplace le triangle par défaut", () => {
    const fighters: FleetComposition = { fighter: 10 };
    const cruisers: FleetComposition = { cruiser: 2 };
    // Inverse l'avantage skirmisher ↔ capital du triangle par défaut.
    const inverted: CombatTuning = {
      ...DEFAULT_COMBAT_TUNING,
      categoryAdvantage: {
        ...DEFAULT_COMBAT_TUNING.categoryAdvantage,
        skirmisher: { capital: 0.7 },
        capital: { skirmisher: 1.5 },
      },
    };
    // Avec le triangle par défaut : les chasseurs l'emportent (cf. test "triangle" plus haut).
    const withTriangle = resolveBattle(fighters, cruisers, focus, focus);
    const withInverted = resolveBattle(
      fighters,
      cruisers,
      focus,
      focus,
      WARSHIP_COMBAT_DEFS,
      inverted,
    );
    expect(withTriangle.winner).toBe("attacker");
    expect(withInverted.winner).toBe("defender");
  });

  it("accepte un id de vaisseau absent de WARSHIP_IDS via des defs injectées (id créé en admin)", () => {
    const customDefs: Record<string, CombatDef> = {
      ...WARSHIP_COMBAT_DEFS,
      "custom-raider": {
        hull: 999,
        shield: 0,
        weapons: { long: 0, medium: 0, short: 999 },
        initiative: 99,
        fleetDamageBonus: 0,
        category: "skirmisher",
      },
    };
    const report = resolveBattle({ "custom-raider": 1 }, { fighter: 5 }, focus, focus, customDefs);
    expect(report.winner).toBe("attacker");
  });
});

describe("fleetPower", () => {
  it("croît avec la taille et le tonnage", () => {
    expect(fleetPower({ cruiser: 1 })).toBeGreaterThan(fleetPower({ fighter: 1 }));
    expect(fleetPower({ fighter: 4 })).toBeGreaterThan(fleetPower({ fighter: 2 }));
    expect(fleetPower({})).toBe(0);
  });
});
