import { describe, expect, it } from "vitest";
import {
  decorateSection,
  type DetailPart,
  panelSeams,
  radialBox,
  radiusAt,
  rng,
  type Section,
} from "./greeble.js";

/**
 * La bibliothèque de détail est pure : elle se vérifie sans navigateur, comme `shipLayout`
 * et `stationLayout` (ADR 0013). Ce qui compte ici n'est pas l'apparence — un test ne la
 * juge pas — mais les propriétés dont l'apparence dépend : le décor est déterministe, il
 * reste collé à la surface qu'il habille, et il ne retombe pas en fil de fer.
 */

const section: Section = {
  axis: "x",
  from: -1,
  to: 1,
  rFrom: 0.4,
  rTo: 0.5,
  sides: 8,
  offset: [0, 0],
};

/** Distance d'une pièce à l'axe du tronc, dans le plan perpendiculaire. */
function distanceToAxis(part: DetailPart, axis: "x" | "z"): number {
  const [x, y, z] = part.position;
  return axis === "x" ? Math.hypot(y, z) : Math.hypot(x, y);
}

describe("rng", () => {
  it("rend la même suite pour la même graine", () => {
    const a = rng("coque:0");
    const b = rng("coque:0");
    const first = [a(), a(), a(), a()];
    const second = [b(), b(), b(), b()];
    expect(first).toEqual(second);
  });

  it("rend des suites différentes pour des graines différentes", () => {
    const a = rng("coque:0");
    const b = rng("coque:1");
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });

  it("reste dans [0, 1[", () => {
    const random = rng("bornes");
    for (let i = 0; i < 500; i++) {
      const v = random();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("ne se coince pas sur une valeur", () => {
    // Un xorshift amorcé à zéro rend zéro pour toujours, et le décor s'effondrerait en un
    // seul point sans que rien ne le signale.
    const random = rng("");
    const values = new Set(Array.from({ length: 50 }, () => random()));
    expect(values.size).toBeGreaterThan(40);
  });
});

describe("radiusAt", () => {
  it("interpole entre les deux extrémités", () => {
    expect(radiusAt(section, -1)).toBeCloseTo(0.4);
    expect(radiusAt(section, 1)).toBeCloseTo(0.5);
    expect(radiusAt(section, 0)).toBeCloseTo(0.45);
  });

  it("borne hors du tronc au lieu d'extrapoler", () => {
    // Sans bornage, une pièce posée au-delà du tronc partirait à l'infini.
    expect(radiusAt(section, -5)).toBeCloseTo(0.4);
    expect(radiusAt(section, 5)).toBeCloseTo(0.5);
  });

  it("supporte un tronc de longueur nulle", () => {
    expect(radiusAt({ ...section, from: 0, to: 0 }, 0)).toBeCloseTo(0.4);
  });
});

describe("radialBox", () => {
  it("pose la pièce sur le rayon demandé, quel que soit l'angle", () => {
    for (const angle of [0, Math.PI / 3, Math.PI, 4.2]) {
      const box = radialBox(
        "x",
        0,
        angle,
        0.5,
        { length: 0.2, width: 0.1, thickness: 0.04 },
        [0, 0],
      );
      expect(Math.hypot(box.position[1], box.position[2])).toBeCloseTo(0.5);
    }
  });

  it("respecte le décalage du tronc — les zones de station ne sont pas centrées", () => {
    const box = radialBox(
      "z",
      0.5,
      0,
      0.5,
      { length: 0.2, width: 0.1, thickness: 0.04 },
      [3, -2],
    );
    expect(box.position[0]).toBeCloseTo(3.5);
    expect(box.position[1]).toBeCloseTo(-2);
    expect(box.position[2]).toBeCloseTo(0.5);
  });

  it("oriente l'épaisseur selon le rayon et la longueur selon l'axe", () => {
    // C'est cette convention qui fait qu'une plaque affleure la coque au lieu de la percer.
    const onX = radialBox(
      "x",
      0,
      0,
      1,
      { length: 0.5, width: 0.2, thickness: 0.03 },
      [0, 0],
    );
    expect(onX.shape).toEqual({ kind: "box", size: [0.5, 0.03, 0.2] });
    const onZ = radialBox(
      "z",
      0,
      0,
      1,
      { length: 0.5, width: 0.2, thickness: 0.03 },
      [0, 0],
    );
    expect(onZ.shape).toEqual({ kind: "box", size: [0.03, 0.2, 0.5] });
  });
});

describe("panelSeams", () => {
  it("garde ses anneaux et jette ses arêtes latérales", () => {
    // Le défaut du premier jet du chantier 34 : un anneau à douze faces conservé à 18°
    // garde AUSSI ses douze montants, et huit anneaux par tronc tressent un panier de fil
    // de fer par-dessus la coque. Le seuil doit dépasser l'angle entre deux faces
    // voisines (360/n) pour ne laisser que les deux anneaux.
    for (const sides of [6, 8, 10, 12]) {
      const [seam] = panelSeams({ ...section, sides }, 1, "#0ff", "t");
      expect(seam!.edgeAngle).toBeGreaterThan(360 / sides);
    }
  });

  it("répartit les coutures sans les coller aux extrémités", () => {
    const seams = panelSeams(section, 4, "#0ff", "t");
    expect(seams).toHaveLength(4);
    for (const seam of seams) {
      expect(seam.position[0]).toBeGreaterThan(section.from);
      expect(seam.position[0]).toBeLessThan(section.to);
    }
  });
});

describe("decorateSection", () => {
  it("est déterministe", () => {
    expect(decorateSection(section, 40, "#0ff", "s", "p")).toEqual(
      decorateSection(section, 40, "#0ff", "s", "p"),
    );
  });

  it("deux graines différentes décorent différemment", () => {
    // C'est la promesse faible de l'ADR 0014, rendue vérifiable : la décoration est une
    // fonction du plan, pas du bruit.
    const a = decorateSection(section, 40, "#0ff", "châssis-a", "p");
    const b = decorateSection(section, 40, "#0ff", "châssis-b", "p");
    expect(a.map((x) => x.position)).not.toEqual(b.map((x) => x.position));
  });

  it("un budget nul ou négatif ne rend rien, sans lever", () => {
    expect(decorateSection(section, 0, "#0ff", "s", "p")).toEqual([]);
    expect(decorateSection(section, -5, "#0ff", "s", "p")).toEqual([]);
  });

  it("suit le budget de près", () => {
    const count = decorateSection(section, 60, "#0ff", "s", "p").length;
    expect(count).toBeGreaterThan(30);
    expect(count).toBeLessThan(110);
  });

  it("un plus gros budget rend plus de pièces", () => {
    const small = decorateSection(section, 20, "#0ff", "s", "p").length;
    const large = decorateSection(section, 80, "#0ff", "s", "p").length;
    expect(large).toBeGreaterThan(small);
  });

  it("tout le décor plaqué reste collé à la surface qu'il habille", () => {
    // L'invariant qui compte vraiment : une pièce qui flotte à côté de la coque se lit
    // comme un débris, et le premier jet en avait — les ailettes de radiateur posées
    // au-delà du rayon. Aucune assertion de DOM ne l'aurait vu.
    //
    // Les coutures sont exclues : ce sont des ANNEAUX, centrés sur l'axe par construction.
    // C'est leur rayon qui doit épouser la coque, pas la position de leur centre — vérifié
    // par le test suivant.
    const plated = decorateSection(section, 80, "#0ff", "s", "p").filter(
      (part) => !part.id.includes("-seam-"),
    );
    expect(plated.length).toBeGreaterThan(10);
    for (const part of plated) {
      const d = distanceToAxis(part, "x");
      const r = radiusAt(section, part.position[0]);
      expect(d, part.id).toBeGreaterThan(r * 0.7);
      expect(d, part.id).toBeLessThan(r * 1.35);
    }
  });

  it("les coutures épousent le rayon de la coque à leur abscisse", () => {
    for (const seam of panelSeams(section, 5, "#0ff", "p")) {
      expect(seam.shape.kind).toBe("prism");
      if (seam.shape.kind !== "prism") continue;
      const r = radiusAt(section, seam.position[0]);
      // En légère surépaisseur, jamais enfoncées : une couture affleurante disparaît sous
      // les faces de la coque et ne rend plus rien.
      expect(seam.shape.rFore).toBeGreaterThan(r);
      expect(seam.shape.rFore).toBeLessThan(r * 1.1);
    }
  });

  it("suit aussi un tronc vertical décalé — le cas des zones de station", () => {
    const tower: Section = {
      axis: "z",
      from: 0,
      to: 1.4,
      rFrom: 0.85,
      rTo: 0.6,
      sides: 6,
      offset: [2.4, -1.2],
    };
    const plated = decorateSection(tower, 40, "#0ff", "s", "p").filter(
      (part) => !part.id.includes("-seam-"),
    );
    for (const part of plated) {
      const d = Math.hypot(
        part.position[0] - tower.offset[0],
        part.position[1] - tower.offset[1],
      );
      const r = radiusAt(tower, part.position[2]);
      expect(d, part.id).toBeGreaterThan(r * 0.7);
      expect(d, part.id).toBeLessThan(r * 1.35);
    }
  });

  it("rend des identifiants uniques", () => {
    // Ils servent de clés de rendu et de poignées de test : un doublon ferait disparaître
    // une pièce en silence.
    const ids = decorateSection(section, 80, "#0ff", "s", "p").map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
