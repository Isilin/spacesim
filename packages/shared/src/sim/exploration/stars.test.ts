import { describe, expect, it } from "vite-plus/test";
import {
  GALAXY_RADIUS_PER_ROOT_SYSTEM,
  MIN_SYSTEM_DISTANCE,
} from "../../constants.js";
import { galacticCoreDisc, galacticCoreHorizon } from "./stars.js";

/**
 * Cœur galactique (chantier 39).
 *
 * Ce fichier testait aussi les classes d'étoiles et les morphologies de galaxie, dérivées de
 * l'identifiant. Le chantier 45 en fait des types persistés et tirés en amont : leurs
 * invariants ont déménagé — cohérence des catalogues dans `content/astro/astro.test.ts`,
 * appartenance des types produits dans `universe.test.ts`, arithmétique dans
 * `physics.test.ts`.
 *
 * Ce qui reste ici est le seul objet du chantier 45 à n'avoir reçu aucune mécanique, donc à
 * pouvoir rester dérivé sans risque : le cœur d'une galaxie.
 */

describe("galacticCore", () => {
  /**
   * Plage réelle du générateur : `MIN_GALAXY_SYSTEMS` à `HOME_GALAXY_SYSTEMS`
   * (`universe.ts`). Les bornes sont recopiées ici plutôt qu'importées — elles sont privées
   * au générateur, et un test qui les importerait suivrait leur dérive sans la signaler.
   */
  const SIZES = [300, 400, 520];

  it("le disque grandit avec le nombre de systèmes, pas avec le rayon", () => {
    // La relation M–σ lie la masse du cœur à celle du bulbe, donc au nombre d'étoiles ; le
    // rayon du disque, lui, suit √n. Le cœur occupe donc une part CROISSANTE de sa galaxie
    // quand elle grossit — calé sur le rayon, il aurait rendu la même image partout.
    const share = SIZES.map(
      (n) =>
        galacticCoreDisc(n) / (GALAXY_RADIUS_PER_ROOT_SYSTEM * Math.sqrt(n)),
    );
    for (let i = 1; i < share.length; i++) {
      expect(share[i]!).toBeGreaterThan(share[i - 1]!);
    }
  });

  it("le disque reste sous le vide central, sur toute la plage", () => {
    // `generatePositions` ne pose rien en deçà de 0,08·R dans les morphologies non barrées :
    // le disque doit se lire comme le bulbe, pas comme une nappe posée sur les systèmes
    // internes.
    for (const n of SIZES) {
      const radius = GALAXY_RADIUS_PER_ROOT_SYSTEM * Math.sqrt(n);
      expect(galacticCoreDisc(n), `${n} systèmes`).toBeLessThan(radius * 0.08);
    }
  });

  it("l'horizon tient dans son disque, et reste visible", () => {
    for (const n of SIZES) {
      expect(galacticCoreHorizon(n)).toBeGreaterThan(0);
      expect(galacticCoreHorizon(n)).toBeLessThan(galacticCoreDisc(n));
    }
  });

  it("le cœur n'écrase pas les systèmes les plus proches", () => {
    // Un disque plus large que l'écart minimal entre deux systèmes engloutirait ses voisins.
    for (const n of SIZES) {
      expect(galacticCoreDisc(n), `${n} systèmes`).toBeLessThan(
        MIN_SYSTEM_DISTANCE * 3,
      );
    }
  });
});
