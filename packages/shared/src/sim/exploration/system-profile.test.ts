import { describe, expect, it } from "vitest";
import type { CentralBody, Planet, StarSystem } from "../../model/universe.js";
import { systemProfile } from "./system-profile.js";

/**
 * Fiche de lecture d'un système (chantier 47).
 *
 * Ces cas sont montés à la main plutôt que tirés d'un univers généré : ce qu'ils protègent est
 * la LECTURE, et un système généré ne garantit ni binaire serrée, ni compagnon singularité, ni
 * système redacté. Le générateur a ses propres verrous.
 */

const body = (
  over: Partial<CentralBody> & { id: string; typeId: string },
): CentralBody => ({
  systemId: "s",
  name: over.id,
  kind: "star",
  rank: 0,
  mass: 1,
  orbitRadius: 0,
  orbitAngle: 0,
  inclination: 0,
  ascendingNode: 0,
  ...over,
});

const world = (over: Partial<Planet> & { id: string }): Planet => ({
  systemId: "s",
  name: over.id,
  kind: "planet",
  classId: "rocky",
  variantId: "temperate",
  habitability: 50,
  slots: 8,
  deposits: {},
  orbitRadius: 70,
  orbitAngle: 0,
  inclination: 0,
  ascendingNode: 0,
  ...over,
});

const system = (
  stars: CentralBody[] | undefined,
  planets: Planet[] = [],
  belts = 0,
): StarSystem =>
  ({
    id: "s",
    name: "S",
    planets,
    belts: Array.from({ length: belts }, (_, i) => ({ id: `b${i}` })),
    ...(stars ? { stars } : {}),
  }) as unknown as StarSystem;

describe("fiche de lecture d'un système", () => {
  it("une étoile seule, ses mondes et ses lunes", () => {
    const profile = systemProfile(
      system(
        [body({ id: "a", typeId: "red_dwarf" })],
        [
          world({ id: "p1" }),
          world({ id: "p2" }),
          world({ id: "m1", kind: "moon" }),
        ],
        1,
      ),
    );
    expect(profile.known).toBe(true);
    expect(profile.arrangement).toBe("single");
    expect(profile.planets).toBe(2);
    expect(profile.moons).toBe(1);
    expect(profile.belts).toBe(1);
    expect(profile.exotic).toBe(false);
  });

  it("une binaire homogène se groupe au lieu de se répéter", () => {
    // « deux naines rouges » et non « une naine rouge, une naine rouge ». Le groupement est
    // neutre en langue, il vit donc dans la dérivation.
    const profile = systemProfile(
      system([
        body({ id: "a", typeId: "red_dwarf" }),
        body({ id: "b", typeId: "red_dwarf", rank: 1, orbitRadius: 15 }),
      ]),
    );
    expect(profile.groups).toEqual([
      { kind: "star", typeId: "red_dwarf", count: 2 },
    ]);
    expect(profile.arrangement).toBe("tight");
  });

  it("une binaire large avec un trou noir nomme les DEUX corps", () => {
    // Le cas que `starClass: string` ne pouvait pas dire : un champ, un type. C'est la raison
    // d'être de cette fiche.
    const profile = systemProfile(
      system(
        [
          body({ id: "a", typeId: "yellow_dwarf" }),
          body({
            id: "b",
            kind: "blackHole",
            typeId: "stellar",
            rank: 1,
            orbitRadius: 600,
          }),
        ],
        [world({ id: "p1" })],
      ),
    );
    expect(profile.arrangement).toBe("wide");
    expect(profile.groups).toHaveLength(2);
    expect(profile.groups[1]).toEqual({
      kind: "blackHole",
      typeId: "stellar",
      count: 1,
    });
    // La seule information de la fiche qui change une décision de jeu.
    expect(profile.exotic).toBe(true);
  });

  it("le seuil de séparation n'est pas réinventé", () => {
    // La bande intermédiaire n'est jamais tirée par le générateur : la question est binaire,
    // pas approximative. 420 est la borne basse de `WIDE_BINARY`.
    const at = (orbitRadius: number) =>
      systemProfile(
        system([
          body({ id: "a", typeId: "yellow_dwarf" }),
          body({ id: "b", typeId: "yellow_dwarf", rank: 1, orbitRadius }),
        ]),
      ).arrangement;
    expect(at(22)).toBe("tight");
    expect(at(420)).toBe("wide");
  });

  it("un errant est un errant, pas un système sans monde", () => {
    const profile = systemProfile(
      system([body({ id: "a", kind: "whiteHole", typeId: "stable" })]),
    );
    expect(profile.drifter).toBe(true);
    expect(profile.exotic).toBe(true);
    expect(profile.bestHabitability).toBe(-1);
  });

  it("un système redacté n'affirme rien", () => {
    // Le brouillard vide `stars` ET `planets`. La fiche doit se taire, pas annoncer
    // « 0 monde » — qui serait faux, et qui trahirait de surcroît que le système est vide.
    const profile = systemProfile(system(undefined));
    expect(profile.known).toBe(false);
    expect(profile.bestHabitability).toBe(-1);
    expect(profile.groups).toHaveLength(0);
    expect(profile.drifter).toBe(false);
    expect(profile.exotic).toBe(false);
  });
});
