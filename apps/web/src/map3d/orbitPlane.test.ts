import { orbitPosition } from "@spacesim/shared";
import { Euler, Vector3 } from "three";
import { describe, expect, it } from "vite-plus/test";
import { orbitPlaneRotation } from "./orbitPlane.js";

/** Un point du cercle de rayon `r`, à l'angle `theta`, posé par une rotation d'Euler. */
function drawn(
  r: number,
  theta: number,
  [x, y, z, order]: [number, number, number, ("XYZ" | "ZYX")?],
): Vector3 {
  return new Vector3(r * Math.cos(theta), r * Math.sin(theta), 0).applyEuler(
    new Euler(x, y, z, order),
  );
}

describe("orbitPlaneRotation (chantier 50.6)", () => {
  const el = {
    orbitRadius: 180,
    orbitAngle: 0,
    inclination: 0.14,
    ascendingNode: 2.1,
  };

  it("pose le cercle exactement sur l'orbite que le corps parcourt", () => {
    // Même point, même phase : c'est aussi ce qui garantit qu'un corps verrouillé, tourné de
    // son angle orbital dans ce repère, montre toujours la même face à ce qu'il orbite.
    for (const theta of [0, 0.7, 2, 3.9, 5.5]) {
      const ring = drawn(180, theta, orbitPlaneRotation(el));
      const body = orbitPosition({ ...el, orbitAngle: theta });
      expect(ring.x).toBeCloseTo(body.x, 9);
      expect(ring.y).toBeCloseTo(body.y, 9);
      expect(ring.z).toBeCloseTo(body.z, 9);
    }
  });

  it("l'ordre par défaut de three.js perdait le nœud ascendant", () => {
    // Le défaut corrigé : en `XYZ`, le plan tracé ne dépend plus de Ω. Sa normale et celle de
    // l'orbite réelle s'écartent ici de 14°, soit ~43 unités d'écart à 180 de rayon.
    const normal = (rotation: [number, number, number, ("XYZ" | "ZYX")?]) =>
      new Vector3(0, 0, 1).applyEuler(
        new Euler(rotation[0], rotation[1], rotation[2], rotation[3]),
      );
    const real = new Vector3()
      .crossVectors(
        new Vector3().copy(orbitPosition({ ...el, orbitAngle: 0 })),
        new Vector3().copy(orbitPosition({ ...el, orbitAngle: Math.PI / 2 })),
      )
      .normalize();
    expect(normal(orbitPlaneRotation(el)).angleTo(real)).toBeCloseTo(0, 9);
    expect(
      normal([el.inclination, 0, el.ascendingNode, "XYZ"]).angleTo(real),
    ).toBeGreaterThan((10 * Math.PI) / 180);
  });
});
