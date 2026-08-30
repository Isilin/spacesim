import { describe, expect, it } from "vitest";
import { DEFAULT_BALANCE } from "../../balance.js";
import { TICK_MS } from "../../constants.js";
import { generateUniverse } from "../../universe.js";
import { orbitalPeriodTicks } from "./geometry.js";
import { intraSystemCost, transferDurationMs } from "./travel.js";

/**
 * Verrou de calibration orbitale (chantier 31.9). Le chantier 31.8 a rendu le coût d'un
 * transfert local dépendant de la position des corps ; encore faut-il que l'échelle de
 * temps rende la mécanique **jouable**. Trois propriétés, chacune mesurée puis figée
 * ici, dans le même esprit que `travel.calibration.test.ts` et le verrou de fixture du
 * chantier 18.
 *
 * Ces propriétés dépendent conjointement de `PLANET_KEPLER_CONSTANT`,
 * `INTRA_SYSTEM_REFERENCE_LENGTH`, `TICK_MS`, des rayons d'orbite du générateur et des
 * constantes de transfert. N'importe lequel peut les casser sans rien casser d'autre.
 */

/** Période entre deux conjonctions d'une paire — la grandeur qui gouverne la mécanique. */
function synodicTicks(t1: number, t2: number): number {
  const inv = Math.abs(1 / t1 - 1 / t2);
  return inv > 0 ? 1 / inv : Number.POSITIVE_INFINITY;
}

interface Sample {
  synodicHours: number;
  /** Part du trajet le plus favorable économisée en attendant la conjonction. */
  relativeGain: number;
  periodTicks: number;
}

function sample(): Sample[] {
  const universe = generateUniverse("mesure-31-9", 4);
  const hours = (ticks: number) => (ticks * TICK_MS) / 3_600_000;
  const out: Sample[] = [];

  for (const galaxy of universe.galaxies) {
    for (const system of galaxy.systems) {
      // Seuls les corps colonisables : ce sont eux qu'on relie par transfert.
      const bodies = system.planets.filter((p) => p.kind === "planet");
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i]!;
          const b = bodies[j]!;
          const period = orbitalPeriodTicks(a);
          const syn = synodicTicks(period, orbitalPeriodTicks(b));
          if (!Number.isFinite(syn)) continue;

          let min = Number.POSITIVE_INFINITY;
          let max = 0;
          for (let k = 0; k < 200; k++) {
            const cost = intraSystemCost(system, a.id, b.id, (syn * k) / 200);
            if (cost < min) min = cost;
            if (cost > max) max = cost;
          }
          const best = transferDurationMs(min, DEFAULT_BALANCE);
          const worst = transferDurationMs(max, DEFAULT_BALANCE);
          out.push({
            synodicHours: hours(syn),
            relativeGain: (worst - best) / best,
            periodTicks: period,
          });
        }
      }
    }
  }
  return out;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

describe("calibration orbitale (chantier 31.9)", () => {
  const samples = sample();

  it("échantillonne assez de paires pour que les médianes aient un sens", () => {
    expect(samples.length).toBeGreaterThan(200);
  });

  it("les conjonctions reviennent à un rythme lisible sur plusieurs sessions", () => {
    const med = median(samples.map((s) => s.synodicHours));
    // Relevé : 19,5 h. Volontairement non commensurable avec 24 h — un joueur qui joue
    // toujours à la même heure verrait sinon toujours la même configuration.
    expect(med).toBeGreaterThan(12);
    expect(med).toBeLessThan(30);
  });

  it("attendre la conjonction paie, sans dominer la décision", () => {
    const med = median(samples.map((s) => s.relativeGain));
    // Relevé : 21 % de médiane, jusqu'à 46 %. En dessous de 10 % la mécanique serait
    // invisible et payée pour rien ; au-delà de 40 % le jeu deviendrait un jeu
    // d'attente, ce que la conception a explicitement écarté.
    expect(med).toBeGreaterThan(0.1);
    expect(med).toBeLessThan(0.4);
  });

  it("la configuration reste figée pendant un transfert : pas d'ETA qui gigote", () => {
    const fastestPeriodMs =
      Math.min(...samples.map((s) => s.periodTicks)) * TICK_MS;
    const longestTransferMs = transferDurationMs(1, DEFAULT_BALANCE);
    // Relevé : 5,0 h pour l'orbite la plus rapide contre 90 s pour un transfert d'un
    // saut, soit un rapport de 200. Un ETA annoncé au départ reste donc exact.
    expect(fastestPeriodMs / longestTransferMs).toBeGreaterThan(50);
  });
});
