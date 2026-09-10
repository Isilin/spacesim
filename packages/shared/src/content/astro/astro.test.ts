import { describe, expect, it } from "vite-plus/test";
import {
  BLACK_HOLE_PLACEMENTS,
  BLACK_HOLE_TYPE_IDS,
  BLACK_HOLE_TYPES,
  blackHoleType,
  type BlackHolePlacement,
} from "./black-hole-types.js";
import {
  GALAXY_TYPE_IDS,
  GALAXY_TYPE_WEIGHTS,
  GALAXY_TYPES,
  galaxyType,
} from "./galaxy-types.js";
import {
  WHITE_HOLE_TYPE_IDS,
  WHITE_HOLE_TYPES,
  whiteHoleType,
} from "./white-hole-types.js";

/**
 * Catalogues astronomiques (chantier 45.1).
 *
 * Le `Record<Id, Def>` exhaustif fait déjà tout le travail que le compilateur sait faire :
 * aucune entrée ne manque, aucun champ ne manque. Ce que ces tests protègent est ce qu'il
 * ne voit pas — les **renvois croisés** entre catalogues, et les invariants qui rendraient
 * le générateur incapable de produire quoi que ce soit sans qu'aucun type ne bronche.
 *
 * Chacun de ces cas est un mode d'échec réel : un `coreClassId` mal orthographié rendrait
 * un cœur générique sans erreur, un emplacement sans poids rendrait une famille entière
 * intirable, et une fourchette de taille qui ne couvre pas 520 empêcherait la galaxie mère
 * d'exister.
 */

const ALL_DEFS = [
  ...Object.values(BLACK_HOLE_TYPES),
  ...Object.values(WHITE_HOLE_TYPES),
];

describe("cohérence interne des tables", () => {
  it("chaque définition porte l'identifiant sous lequel elle est rangée", () => {
    for (const id of BLACK_HOLE_TYPE_IDS)
      expect(BLACK_HOLE_TYPES[id].id).toBe(id);
    for (const id of WHITE_HOLE_TYPE_IDS)
      expect(WHITE_HOLE_TYPES[id].id).toBe(id);
    for (const id of GALAXY_TYPE_IDS) expect(GALAXY_TYPES[id].id).toBe(id);
  });

  it("un identifiant inconnu rend un repli utilisable, pas seulement défini", () => {
    // La promesse du CMS (ADR 0007) : une entrée créée sans coder ne casse pas la vue.
    // Un repli qui rendrait des zéros la casserait autrement — une galaxie sans bras ni
    // rayon ne se dessine pas, un trou noir sans horizon n'a pas d'emprise cliquable.
    // Ce contrat était testé côté web sur un doublon de `GALAXIES` devenu mort au
    // chantier 45 ; il vit ici, avec les tables qu'il protège.
    for (const unknown of ["", "inconnu", "Étoile-Fantôme", "42"]) {
      const galaxy = galaxyType(unknown);
      expect(galaxy.arms, unknown).toBeGreaterThan(0);
      expect(galaxy.winding, unknown).toBeGreaterThan(0);
      expect(galaxy.systemRange[0], unknown).toBeGreaterThan(0);
      expect(galaxy.tint, unknown).toMatch(/^#/);

      const hole = blackHoleType(unknown);
      expect(hole.horizonRadius, unknown).toBeGreaterThan(0);
      expect(hole.placements.length, unknown).toBeGreaterThan(0);
      expect(hole.halo, unknown).toMatch(/^#/);

      const fountain = whiteHoleType(unknown);
      expect(fountain.mouthRadius, unknown).toBeGreaterThan(0);
      expect(fountain.wormholeRange[0], unknown).toBeGreaterThan(0);
      expect(fountain.halo, unknown).toMatch(/^#/);
    }
  });
});

describe("singularités : emplacements et poids", () => {
  it("tout emplacement pondéré est déclaré, et réciproquement", () => {
    // Deux listes qui se contredisent, c'est un tirage silencieusement impossible.
    for (const def of ALL_DEFS) {
      const weighted = Object.keys(def.weights) as BlackHolePlacement[];
      expect(new Set(weighted)).toEqual(new Set(def.placements));
    }
  });

  it("aucun poids nul ou négatif", () => {
    for (const def of ALL_DEFS) {
      for (const [placement, weight] of Object.entries(def.weights)) {
        expect(weight, `${def.id} / ${placement}`).toBeGreaterThan(0);
      }
    }
  });

  it("chaque emplacement est atteignable par au moins un type", () => {
    // Sans quoi le générateur aurait un emplacement qu'il ne pourrait jamais peupler.
    for (const placement of BLACK_HOLE_PLACEMENTS) {
      const candidates = ALL_DEFS.filter((d) =>
        d.placements.includes(placement),
      );
      expect(candidates.length, placement).toBeGreaterThan(0);
    }
  });

  it("un trou blanc errant reste plus rare qu'un trou noir errant", () => {
    // Le catalogue annonce la fontaine blanche comme « le plus rare que le joueur puisse
    // rencontrer ». Les premiers poids disaient l'inverse — dix-huit fontaines pour cinq
    // trous noirs sur un univers neuf, mesuré en base — et ça ne se voyait ni dans les
    // types ni dans les tests, seulement à l'exécution.
    //
    // Le rapport a une seconde conséquence : un pont exige une fontaine ET un trou noir.
    // La face rare doit être la fontaine, sinon la plupart d'entre elles restent orphelines
    // et les ponts se raréfient sans qu'on l'ait décidé.
    const weightOf = (
      defs: { placements: readonly string[]; weights: { drifter?: number } }[],
    ) =>
      defs
        .filter((d) => d.placements.includes("drifter"))
        .reduce((sum, d) => sum + (d.weights.drifter ?? 0), 0);

    const black = weightOf(Object.values(BLACK_HOLE_TYPES));
    const white = weightOf(Object.values(WHITE_HOLE_TYPES));
    expect(black).toBeGreaterThan(white * 2);
  });

  it("aucun trou blanc au cœur d'une galaxie", () => {
    // Un bulbe accrète, il n'éjecte pas. La règle est dans la doc du catalogue ; ici elle
    // devient vérifiable.
    for (const def of Object.values(WHITE_HOLE_TYPES)) {
      expect(def.placements, def.id).not.toContain("core");
    }
  });

  it("seul le cœur galactique peut être supermassif", () => {
    expect(BLACK_HOLE_TYPES.supermassive.placements).toEqual(["core"]);
  });

  it("une singularité sans disque garde un horizon", () => {
    // Le dormant n'a rien à accréter : il ne se voit pas, mais il occupe de la place.
    for (const def of Object.values(BLACK_HOLE_TYPES)) {
      expect(def.horizonRadius, def.id).toBeGreaterThan(0);
    }
  });

  it("la portée d'un trou de ver est une fourchette croissante et atteignable", () => {
    for (const def of Object.values(WHITE_HOLE_TYPES)) {
      const [min, max] = def.wormholeRange;
      expect(min, def.id).toBeGreaterThan(0);
      expect(max, def.id).toBeGreaterThanOrEqual(min);
      // Le diamètre médian d'une galaxie vaut 59 sauts (ADR 0018) : au-delà, la paire
      // serait introuvable et la bouche resterait orpheline.
      expect(max, def.id).toBeLessThanOrEqual(59);
    }
  });
});

describe("types de galaxies", () => {
  it("chaque cœur renvoie à un type de trou noir qui existe", () => {
    for (const def of Object.values(GALAXY_TYPES)) {
      expect(BLACK_HOLE_TYPE_IDS, def.id).toContain(def.coreClassId);
    }
  });

  it("un cœur de galaxie est un type autorisé au cœur", () => {
    for (const def of Object.values(GALAXY_TYPES)) {
      expect(
        BLACK_HOLE_TYPES[def.coreClassId].placements,
        `${def.id} → ${def.coreClassId}`,
      ).toContain("core");
    }
  });

  it("les poids somment à cent, pour se lire comme des pourcents", () => {
    const total = GALAXY_TYPE_WEIGHTS.reduce((s, [, w]) => s + w, 0);
    expect(total).toBe(100);
  });

  it("la table de tirage couvre exactement les types déclarés", () => {
    expect(GALAXY_TYPE_WEIGHTS.map(([id]) => id)).toEqual([...GALAXY_TYPE_IDS]);
  });

  it("les fourchettes de taille couvrent la plage du générateur", () => {
    // La galaxie mère compte 520 systèmes et les autres 300 à 500 (`galaxyDefAt`). Si
    // aucun type n'admet 520, la galaxie mère n'a pas de forme possible et le bootstrap
    // échoue — sans que rien dans les types ne l'annonce.
    const admitsSize = (n: number) =>
      Object.values(GALAXY_TYPES).some(
        (d) => n >= d.systemRange[0] && n <= d.systemRange[1],
      );
    expect(admitsSize(520), "520 (galaxie mère)").toBe(true);
    expect(admitsSize(300), "300 (plancher)").toBe(true);
    expect(admitsSize(500), "500 (plafond des autres)").toBe(true);
  });

  it("chaque fourchette de taille est croissante", () => {
    for (const def of Object.values(GALAXY_TYPES)) {
      expect(def.systemRange[0], def.id).toBeLessThan(def.systemRange[1]);
    }
  });

  it("une elliptique n'a pas de bras, une spirale en a", () => {
    // Le champ qui distingue les deux morphologies, et que `generatePositions` lit.
    expect(GALAXY_TYPES.elliptical.arms).toBe(0);
    expect(GALAXY_TYPES.dwarf_elliptical.arms).toBe(0);
    expect(GALAXY_TYPES.spiral.arms).toBeGreaterThan(0);
    expect(GALAXY_TYPES.barred_spiral.arms).toBeGreaterThan(0);
  });

  it("seule l'annulaire porte un anneau", () => {
    for (const def of Object.values(GALAXY_TYPES)) {
      if (def.id === "ring") expect(def.ring).toBeGreaterThan(0);
      else expect(def.ring, def.id).toBe(0);
    }
  });

  it("la densité de singularités reste dans un ordre de grandeur jouable", () => {
    // Entre 2 et 13 errants pour une galaxie de 300 à 520 systèmes : assez pour en
    // rencontrer, assez peu pour que ça reste un événement.
    for (const def of Object.values(GALAXY_TYPES)) {
      const [min, max] = def.systemRange;
      expect(
        (def.singularityDensity * min) / 100,
        def.id,
      ).toBeGreaterThanOrEqual(2);
      expect((def.singularityDensity * max) / 100, def.id).toBeLessThanOrEqual(
        13,
      );
    }
  });
});
