import { describe, expect, it } from "vitest";
import { type BatchPart, buildBatches } from "./HoloBatch.js";
import { buildGeometry } from "./partGeometry.js";

/**
 * La fusion (chantier 34.2) est testable **sans WebGL** : `BufferGeometry`,
 * `EdgesGeometry` et `Matrix4` sont du JavaScript pur, seul l'affichage demande un
 * contexte. C'est ce qui permet de garder l'invariant qui compte — aucune pièce perdue en
 * route — hors de l'e2e, où il serait invisible (ADR 0013).
 */

function part(over: Partial<BatchPart> = {}): BatchPart {
  return {
    id: "p",
    shape: { kind: "box", size: [1, 1, 1] },
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    color: "#00ffff",
    edgeAngle: 18,
    ...over,
  };
}

describe("buildBatches — regroupement", () => {
  it("fond toutes les pièces d'une même teinte en un seul lot", () => {
    const groups = buildBatches([
      part({ id: "a" }),
      part({ id: "b", position: [2, 0, 0] }),
      part({ id: "c", position: [4, 0, 0] }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.count).toBe(3);
  });

  it("un lot par teinte distincte", () => {
    const groups = buildBatches([
      part({ color: "#00ffff" }),
      part({ color: "#ff0000" }),
      part({ color: "#00ffff" }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("les pièces émissives et fantômes ne se mélangent pas au volume, même teinte égale", () => {
    // Elles n'ont pas le même matériau : les confondre rendrait une tuyère translucide ou
    // une zone en file opaque.
    const groups = buildBatches([
      part({ color: "#00ffff" }),
      part({ color: "#00ffff", emissive: true }),
      part({ color: "#00ffff", ghost: true }),
    ]);
    expect(groups).toHaveLength(3);
  });
});

describe("buildBatches — conservation", () => {
  it("ne perd aucun sommet en fusionnant", () => {
    // L'invariant central : `mergeGeometries` de three rend `null` au moindre écart
    // d'attributs, et une pièce disparue en silence ne se voit sur aucune assertion DOM.
    const shapes: BatchPart[] = [
      part({ shape: { kind: "box", size: [1, 1, 1] } }),
      part({ shape: { kind: "sphere", radius: 0.5 } }),
      part({ shape: { kind: "cone", radius: 0.5, height: 1, sides: 8 } }),
      part({
        shape: { kind: "prism", rFore: 0.4, rAft: 0.5, length: 1, sides: 6 },
      }),
      part({ shape: { kind: "capsule", radius: 0.2, length: 0.6 } }),
      part({ shape: { kind: "torus", radius: 0.5, tube: 0.1, segments: 8 } }),
    ];
    const expected = shapes.reduce((sum, p) => {
      const geometry = buildGeometry(p.shape);
      const count = geometry.getAttribute("position").count;
      geometry.dispose();
      return sum + count;
    }, 0);

    const groups = buildBatches(shapes);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.faces?.getAttribute("position").count).toBe(expected);
  });

  it("réindexe chaque pièce sur son propre décalage", () => {
    // Un index non décalé rend une bouillie de triangles reliant la pièce 2 aux sommets de
    // la pièce 1 — parfaitement silencieux, et parfaitement faux.
    const groups = buildBatches([
      part({ id: "a" }),
      part({ id: "b", position: [5, 0, 0] }),
    ]);
    const faces = groups[0]!.faces!;
    const index = faces.getIndex()!;
    const vertices = faces.getAttribute("position").count;

    let max = 0;
    for (let i = 0; i < index.count; i++) max = Math.max(max, index.getX(i));
    expect(max).toBe(vertices - 1);
    // La seconde moitié de l'index doit pointer dans la seconde moitié des sommets.
    expect(index.getX(index.count - 1)).toBeGreaterThanOrEqual(vertices / 2);
  });

  it("applique la pose à la géométrie fusionnée", () => {
    // Sans matrice appliquée, tout l'objet s'effondrerait à l'origine.
    const groups = buildBatches([part({ position: [10, 0, 0] })]);
    const position = groups[0]!.faces!.getAttribute("position");
    let minX = Number.POSITIVE_INFINITY;
    for (let i = 0; i < position.count; i++)
      minX = Math.min(minX, position.getX(i));
    expect(minX).toBeGreaterThan(9);
  });
});

describe("buildBatches — arêtes", () => {
  it("une pièce fantôme rend des arêtes mais aucune face", () => {
    const groups = buildBatches([part({ ghost: true })]);
    expect(groups[0]!.faces).toBeNull();
    expect(groups[0]!.edges).not.toBeNull();
  });

  it("`edgeAngle: 0` ne produit aucune arête", () => {
    // Sur un volume lissé, la passe d'arêtes dégénère en fil de fer complet.
    const groups = buildBatches([
      part({ shape: { kind: "sphere", radius: 1 }, edgeAngle: 0 }),
    ]);
    expect(groups[0]!.edges).toBeNull();
    expect(groups[0]!.faces).not.toBeNull();
  });

  it("le seuil d'angle est appliqué par pièce, avant fusion", () => {
    // C'est ce qui distingue une couture de panneau d'un fil de fer : fusionner d'abord
    // imposerait un seuil unique à tout le lot.
    const coarse = buildBatches([
      part({ shape: { kind: "sphere", radius: 1 }, edgeAngle: 40 }),
    ]);
    const fine = buildBatches([
      part({ shape: { kind: "sphere", radius: 1 }, edgeAngle: 5 }),
    ]);
    const count = (g: ReturnType<typeof buildBatches>) =>
      g[0]!.edges?.getAttribute("position").count ?? 0;
    expect(count(fine)).toBeGreaterThan(count(coarse));
  });
});
