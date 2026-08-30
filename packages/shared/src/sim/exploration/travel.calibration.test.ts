import { describe, expect, it } from "vitest";
import type { Galaxy } from "../../model/universe.js";
import { generateUniverse } from "../../universe.js";
import { travelCostInUniverse } from "./travel.js";

/**
 * Verrou de calibration du coût de trajet (chantier 31.7), même esprit que
 * `universe.fixture.test.ts` : il rend impossible une dérive silencieuse.
 *
 * `JUMP_REFERENCE_LENGTH` est calé pour que l'arête moyenne d'un univers généré vaille
 * ≈ 1, ce qui permet aux constantes de `balance.ts` — toutes linéaires en `jumps` — de
 * garder leur ordre de grandeur après le passage du BFS au Dijkstra pondéré. Cette
 * propriété tient à la géométrie du générateur : changer `MAP_DEPTH`, `MAP_WIDTH`,
 * l'espacement des systèmes ou la règle de liaison la casserait sans rien casser
 * d'autre, et l'économie dériverait en silence.
 *
 * Si ce test casse : recaler `JUMP_REFERENCE_LENGTH` sur la nouvelle longueur d'arête
 * moyenne, **ou** assumer la dérive et recalibrer `balance.ts` en conséquence.
 */

/** Modèle de référence : le BFS en nombre de sauts d'avant le chantier 31.6. */
function hopCount(galaxy: Galaxy, from: string, to: string): number {
  if (from === to) return 0;
  const adjacency = new Map<string, string[]>();
  for (const [a, b] of galaxy.links) {
    adjacency.set(a, [...(adjacency.get(a) ?? []), b]);
    adjacency.set(b, [...(adjacency.get(b) ?? []), a]);
  }
  const visited = new Set([from]);
  let frontier = [from];
  let depth = 0;
  while (frontier.length > 0) {
    depth++;
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbor of adjacency.get(id) ?? []) {
        if (visited.has(neighbor)) continue;
        if (neighbor === to) return depth;
        visited.add(neighbor);
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return -1;
}

function samplePairs(): { hops: number; cost: number }[] {
  const universe = generateUniverse("mesure-31-7", 4);
  const pairs: { hops: number; cost: number }[] = [];
  for (const galaxy of universe.galaxies) {
    const ids = galaxy.systems.map((s) => s.id);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const hops = hopCount(galaxy, ids[i]!, ids[j]!);
        const cost = travelCostInUniverse(universe, ids[i]!, ids[j]!);
        if (hops > 0 && cost > 0) pairs.push({ hops, cost });
      }
    }
  }
  return pairs;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe("calibration du coût de trajet (chantier 31.7)", () => {
  const pairs = samplePairs();

  it("échantillonne assez de trajets pour que la moyenne ait un sens", () => {
    expect(pairs.length).toBeGreaterThan(150);
  });

  it("le coût moyen reste à l'échelle du compte de sauts (±10 %)", () => {
    const derive =
      mean(pairs.map((p) => p.cost)) / mean(pairs.map((p) => p.hops));
    // Relevé au chantier 31.7 : 3,16 contre 3,20 sauts, soit -1,1 %.
    expect(derive).toBeGreaterThan(0.9);
    expect(derive).toBeLessThan(1.1);
  });

  it("la géométrie pèse réellement sur les trajets pris un à un", () => {
    const ratios = pairs.map((p) => p.cost / p.hops);
    // Relevé : 0,45 à 1,83 — un trajet direct coûte moitié moins qu'un trajet étiré.
    expect(Math.min(...ratios)).toBeLessThan(0.7);
    expect(Math.max(...ratios)).toBeGreaterThan(1.4);
  });

  it("reste une minorité de trajets à plus de ±50 % du barème de sauts", () => {
    const gros = pairs.filter(
      (p) => p.cost / p.hops > 1.5 || p.cost / p.hops < 0.5,
    );
    // Relevé : 3,3 %. Au-delà de 15 %, ce n'est plus un ajustement mais un autre jeu.
    expect(gros.length / pairs.length).toBeLessThan(0.15);
  });
});
