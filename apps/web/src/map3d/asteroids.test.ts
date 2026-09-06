import { describe, expect, it } from "vitest";
import { asteroidGeometry } from "./asteroids.js";

/**
 * Silhouettes de rochers (chantier 35.10).
 *
 * `BufferGeometry` est du JavaScript ordinaire : seul l'affichage réclame un contexte
 * WebGL, la géométrie se vérifie sans navigateur (même doctrine que `HoloBatch.test.ts`).
 */

function radii(geometry: ReturnType<typeof asteroidGeometry>): number[] {
  const position = geometry.getAttribute("position");
  const out: number[] = [];
  for (let i = 0; i < position.count; i++) {
    out.push(Math.hypot(position.getX(i), position.getY(i), position.getZ(i)));
  }
  return out;
}

describe("asteroidGeometry", () => {
  it("déforme la sphère au lieu de la laisser lisse", () => {
    // Ce qu'on corrige : une ceinture était quatre-vingt-dix fois le même icosaèdre, et de
    // près la répétition sautait aux yeux.
    const distances = radii(asteroidGeometry("belt:0", 2));
    const min = Math.min(...distances);
    const max = Math.max(...distances);
    expect(max - min).toBeGreaterThan(0.2);
  });

  it("reste dans les bornes du rayon demandé", () => {
    // Un caillou qui se replie sur lui-même cesse d'être convexe, et son ombrage devient
    // n'importe quoi.
    for (const d of radii(asteroidGeometry("belt:1", 2))) {
      expect(d).toBeGreaterThan(2 * 0.6);
      expect(d).toBeLessThan(2 * 1.4);
    }
  });

  it("donne des silhouettes différentes pour des graines différentes", () => {
    const a = radii(asteroidGeometry("belt:a", 1));
    const b = radii(asteroidGeometry("belt:b", 1));
    expect(a).not.toEqual(b);
  });

  it("rend exactement la même silhouette pour la même graine", () => {
    // Dérivé du seed, comme le reste de l'univers : un rocher ne doit pas changer de forme
    // entre deux visites.
    expect(radii(asteroidGeometry("belt:c", 1))).toEqual(
      radii(asteroidGeometry("belt:c", 1)),
    );
  });

  it("ne déchire pas la maille aux sommets partagés", () => {
    // Les sommets d'un icosaèdre sont partagés par plusieurs faces : tirer leur
    // déplacement de l'index plutôt que de la position les séparerait, et la surface
    // s'ouvrirait. Le déplacement étant radial, deux sommets de même direction doivent
    // rester à la même distance du centre.
    const position = asteroidGeometry("belt:d", 1).getAttribute("position");
    const byDirection = new Map<string, number>();
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      const r = Math.hypot(x, y, z);
      const direction = [x / r, y / r, z / r]
        .map((v) => Math.round(v * 1e4))
        .join(",");
      const known = byDirection.get(direction);
      if (known === undefined) byDirection.set(direction, r);
      else expect(r).toBeCloseTo(known, 9);
    }
    // Et la maille comporte bien des sommets partagés, sans quoi le test ne prouverait rien.
    expect(byDirection.size).toBeLessThan(position.count);
  });
});
