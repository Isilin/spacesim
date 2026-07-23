import { describe, expect, it } from "vitest";
import { galaxiesToAdd, pickStarterGalaxy, type GalaxyOccupancy } from "./expansion.js";

const CONFIG = { frontier: 3, maxGalaxies: 10 };

/** Occupation d'une galaxie ; par défaut vierge et accueillante. */
function galaxy(index: number, over: Partial<GalaxyOccupancy> = {}): GalaxyOccupancy {
  return { index, colonies: 0, empires: 0, freeHabitable: 5, ...over };
}

describe("galaxiesToAdd — frontière glissante", () => {
  it("n'ouvre rien tant que la frontière est intacte", () => {
    const occupancy = [galaxy(0, { colonies: 4, empires: 2 }), galaxy(1), galaxy(2), galaxy(3)];
    expect(galaxiesToAdd(occupancy, CONFIG)).toBe(0);
  });

  it("ouvre juste ce qu'il faut quand des galaxies vierges sont colonisées", () => {
    const occupancy = [
      galaxy(0, { colonies: 4, empires: 2 }),
      galaxy(1, { colonies: 1, empires: 1 }),
      galaxy(2),
      galaxy(3),
    ];
    // 2 galaxies vierges sur 3 attendues → une seule à ouvrir.
    expect(galaxiesToAdd(occupancy, CONFIG)).toBe(1);
  });

  it("rattrape un univers entièrement colonisé", () => {
    const occupancy = [0, 1, 2].map((i) => galaxy(i, { colonies: 2, empires: 1 }));
    expect(galaxiesToAdd(occupancy, CONFIG)).toBe(3);
  });

  it("s'arrête au plafond de sécurité", () => {
    const occupancy = Array.from({ length: 9 }, (_, i) => galaxy(i, { colonies: 1, empires: 1 }));
    // 3 manquantes, mais une seule place sous le plafond de 10.
    expect(galaxiesToAdd(occupancy, CONFIG)).toBe(1);
    const full = Array.from({ length: 10 }, (_, i) => galaxy(i, { colonies: 1, empires: 1 }));
    expect(galaxiesToAdd(full, CONFIG)).toBe(0);
  });
});

describe("pickStarterGalaxy — placement des nouveaux empires", () => {
  it("préfère une galaxie déjà peuplée : les joueurs naissent voisins", () => {
    const occupancy = [galaxy(0, { colonies: 2, empires: 1 }), galaxy(1), galaxy(2)];
    expect(pickStarterGalaxy(occupancy, 4)).toBe(0);
  });

  it("bascule sur une galaxie vierge quand les peuplées sont pleines", () => {
    const occupancy = [
      galaxy(0, { colonies: 8, empires: 4 }),
      galaxy(1, { colonies: 8, empires: 4 }),
      galaxy(2),
    ];
    expect(pickStarterGalaxy(occupancy, 4)).toBe(2);
  });

  it("ignore une galaxie sans planète habitable libre", () => {
    const occupancy = [
      galaxy(0, { colonies: 3, empires: 1, freeHabitable: 0 }),
      galaxy(1, { colonies: 1, empires: 1 }),
    ];
    expect(pickStarterGalaxy(occupancy, 4)).toBe(1);
  });

  it("prend la plus proche du centre à égalité de conditions", () => {
    const occupancy = [
      galaxy(0, { colonies: 8, empires: 4 }),
      galaxy(3, { colonies: 1, empires: 1 }),
      galaxy(1, { colonies: 1, empires: 1 }),
    ];
    expect(pickStarterGalaxy(occupancy, 4)).toBe(1);
  });

  it("rend null quand plus rien n'est disponible — à l'appelant d'étendre l'univers", () => {
    const occupancy = [galaxy(0, { colonies: 8, empires: 4, freeHabitable: 0 })];
    expect(pickStarterGalaxy(occupancy, 4)).toBeNull();
    expect(pickStarterGalaxy([], 4)).toBeNull();
  });
});
