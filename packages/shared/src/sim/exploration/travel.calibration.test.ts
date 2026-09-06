import { describe, expect, it } from "vitest";
import type { Galaxy } from "../../model/universe.js";
import { createRng } from "../../rng.js";
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

/**
 * Paires tirées par galaxie. Toutes les paires étaient parcourues jusqu'au chantier 37 :
 * viable à 14 systèmes (91 paires), plus du tout à 520 (135 000 paires, un BFS chacune —
 * mesuré à 403 s de collecte, et un `Math.min(...ratios)` qui débordait la pile d'appels).
 * Un tirage déterministe de ce volume mesure exactement la même moyenne.
 */
const PAIRS_PER_GALAXY = 400;

function samplePairs(): { hops: number; cost: number }[] {
  const universe = generateUniverse("mesure-31-7", 4);
  const rng = createRng("mesure-31-7:paires");
  const pairs: { hops: number; cost: number }[] = [];
  for (const galaxy of universe.galaxies) {
    const ids = galaxy.systems.map((s) => s.id);
    for (let k = 0; k < PAIRS_PER_GALAXY; k++) {
      const i = Math.floor(rng() * ids.length);
      const j = Math.floor(rng() * ids.length);
      if (i === j) continue;
      const hops = hopCount(galaxy, ids[i]!, ids[j]!);
      const cost = travelCostInUniverse(universe, ids[i]!, ids[j]!);
      if (hops > 0 && cost > 0) pairs.push({ hops, cost });
    }
  }
  return pairs;
}

/**
 * Excentricité du graphe depuis un sommet arbitraire — minorant du diamètre, exact à un
 * facteur deux près. Le vrai diamètre demande un BFS par système : cinq cents BFS sur cinq
 * cents sommets par galaxie, pour une grandeur dont seul l'ordre nous intéresse.
 */
function approximateDiameter(galaxy: Galaxy): number {
  const adjacency = new Map<string, string[]>();
  for (const [a, b] of galaxy.links) {
    adjacency.set(a, [...(adjacency.get(a) ?? []), b]);
    adjacency.set(b, [...(adjacency.get(b) ?? []), a]);
  }
  const start = galaxy.systems[0]!.id;
  const seen = new Set([start]);
  let frontier = [start];
  let depth = 0;
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier)
      for (const neighbor of adjacency.get(id) ?? [])
        if (!seen.has(neighbor)) {
          seen.add(neighbor);
          next.push(neighbor);
        }
    if (next.length > 0) depth++;
    frontier = next;
  }
  return depth;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const min = (xs: number[]) => xs.reduce((a, b) => Math.min(a, b));
const max = (xs: number[]) => xs.reduce((a, b) => Math.max(a, b));

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
    // Sur les trajets COURTS seulement. Un trajet de cinquante sauts moyenne ses arêtes :
    // son rapport coût/sauts tend vers 1 quelle que soit la géométrie, et c'est bien ce
    // qu'on veut. Ce que ce test protège, c'est que deux trajets de même longueur en sauts
    // ne coûtent pas la même chose — ce qui ne s'observe que là où la moyenne n'a pas encore
    // effacé le relief.
    const ratios = pairs.filter((p) => p.hops <= 6).map((p) => p.cost / p.hops);
    // Relevé : 0,45 à 1,83 — un trajet direct coûte moitié moins qu'un trajet étiré.
    expect(min(ratios)).toBeLessThan(0.7);
    expect(max(ratios)).toBeGreaterThan(1.4);
  });

  it("traverser une galaxie reste de l'ordre de la dizaine de sauts", () => {
    // Relevé au chantier 37, sur les quatre galaxies de l'univers de mesure : diamètre
    // médian 59 sauts, contre 7 quand une galaxie comptait quatorze systèmes.
    //
    // Ce test existe parce que la conclusion a surpris. On avait prévu de diviser les
    // constantes PAR SAUT (`TRANSFER_MS_PER_JUMP` et les siennes) par ce rapport, pour
    // qu'une traversée garde sa durée. La mesure a dit le contraire : un trajet ORDINAIRE
    // ne s'allonge pas, parce que les empires démarrent groupés
    // (`STARTER_CLUSTER_RADIUS`) et que leurs voisins restent à quelques sauts. Seule la
    // traversée complète coûte plus cher — ce qui est exactement ce qu'une galaxie plus
    // vaste doit signifier. Diviser aurait rendu la logistique de proximité quasi
    // gratuite, et vidé de son sens la couche orbitale de l'ADR 0004.
    //
    // Ce qu'on protège ici : que le diamètre ne dérive pas d'un ordre de grandeur de plus,
    // ce qui ferait d'un convoi intra-galactique une affaire de plusieurs heures.
    const diameters = generateUniverse("mesure-31-7", 4).galaxies.map((g) =>
      approximateDiameter(g),
    );
    for (const d of diameters) {
      expect(d).toBeGreaterThan(5);
      expect(d).toBeLessThan(140);
    }
  });

  it("reste une minorité de trajets à plus de ±50 % du barème de sauts", () => {
    const gros = pairs.filter(
      (p) => p.cost / p.hops > 1.5 || p.cost / p.hops < 0.5,
    );
    // Relevé : 3,3 %. Au-delà de 15 %, ce n'est plus un ajustement mais un autre jeu.
    expect(gros.length / pairs.length).toBeLessThan(0.15);
  });
});
