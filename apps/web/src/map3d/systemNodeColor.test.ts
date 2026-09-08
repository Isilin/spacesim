import type { CentralBody, StarSystem } from "@spacesim/shared";
import { blackHoleType, whiteHoleType } from "@spacesim/shared";
import { describe, expect, it } from "vitest";
import { systemNodeColor } from "./systemNodeColor.js";

/**
 * Teinte d'un nœud au palier galaxie (chantier 47).
 *
 * Ces cas existent parce que la décision vivait en ligne dans un `useMemo` et qu'aucun test ne
 * pouvait l'atteindre. Le défaut qu'ils verrouillent : depuis que le palier 45.2 donne des
 * corps centraux à TOUS les systèmes, lire `starsOf(system)[0]` sans regarder son `kind`
 * envoyait toute étoile dans `blackHoleType()`, dont le repli est le trou noir stellaire —
 * tout système exploré rendait son orange, et la valeur restait une couleur valide.
 */

const NEUTRAL = {
  selected: false,
  colonized: false,
  withStation: false,
  territory: undefined,
  explored: false,
};

const body = (kind: CentralBody["kind"], typeId: string): CentralBody => ({
  id: "b",
  systemId: "s",
  name: "B",
  kind,
  typeId,
  rank: 0,
  mass: 1,
  orbitRadius: 0,
  orbitAngle: 0,
  inclination: 0,
  ascendingNode: 0,
});

const system = (stars?: CentralBody[]): StarSystem =>
  ({
    id: "s",
    galaxyId: "g",
    name: "S",
    x: 0,
    y: 0,
    z: 0,
    planets: [],
    belts: [],
    ...(stars ? { stars } : {}),
  }) as unknown as StarSystem;

describe("teinte d'un nœud de système", () => {
  it("une étoile ne prend jamais la teinte d'une singularité", () => {
    // LE cas. Avant correction, les onze classes d'étoiles rendaient toutes le halo du trou
    // noir stellaire, parce qu'elles tombaient dans son repli générique.
    const stellarHalo = blackHoleType("stellar").halo;
    for (const typeId of [
      "red_dwarf",
      "yellow_dwarf",
      "pulsar",
      "supergiant",
    ]) {
      const color = systemNodeColor(system([body("star", typeId)]), {
        ...NEUTRAL,
        explored: true,
      });
      expect(color, typeId).not.toBe(stellarHalo);
    }
  });

  it("un système exploré se distingue d'un inexploré", () => {
    const star = [body("star", "red_dwarf")];
    const seen = systemNodeColor(system(star), { ...NEUTRAL, explored: true });
    const unseen = systemNodeColor(system(star), NEUTRAL);
    expect(seen).not.toBe(unseen);
  });

  it("un errant porte la teinte de sa singularité", () => {
    expect(
      systemNodeColor(system([body("blackHole", "supermassive")]), {
        ...NEUTRAL,
        explored: true,
      }),
    ).toBe(blackHoleType("supermassive").halo);
    expect(
      systemNodeColor(system([body("whiteHole", "torrent")]), {
        ...NEUTRAL,
        explored: true,
      }),
    ).toBe(whiteHoleType("torrent").halo);
  });

  it("deux singularités de types différents ne se confondent pas", () => {
    const one = systemNodeColor(system([body("blackHole", "dormant")]), {
      ...NEUTRAL,
      explored: true,
    });
    const other = systemNodeColor(system([body("blackHole", "microquasar")]), {
      ...NEUTRAL,
      explored: true,
    });
    expect(one).not.toBe(other);
  });

  it("le brouillard n'annonce pas ce qu'un système abrite", () => {
    // `redactUniverse` vide `stars` : sans ancre connue, la clause ne s'ouvre pas et le nœud
    // rend la teinte d'un inexploré ordinaire. Un errant ne doit pas se trahir de loin.
    expect(systemNodeColor(system(), NEUTRAL)).toBe(
      systemNodeColor(system([body("star", "red_dwarf")]), NEUTRAL),
    );
  });

  it("l'état du joueur passe avant la nature de l'objet", () => {
    const drifter = [body("blackHole", "primordial")];
    const selected = systemNodeColor(system(drifter), {
      ...NEUTRAL,
      selected: true,
      explored: true,
    });
    const colonized = systemNodeColor(system(drifter), {
      ...NEUTRAL,
      colonized: true,
      explored: true,
    });
    const halo = blackHoleType("primordial").halo;
    expect(selected).not.toBe(halo);
    expect(colonized).not.toBe(halo);
    expect(selected).not.toBe(colonized);
  });
});
