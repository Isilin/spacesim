import { describe, expect, it } from "vitest";
import { MAX_EMPIRES_PER_GALAXY } from "../../constants.js";
import { planetType } from "../../content/astro/planet-types.js";
import { isDrifter } from "../../model/universe.js";
import { allPlanets, allSystems, generateUniverse } from "../../universe.js";

/**
 * Verrou de calibration de l'habitabilité (chantier 45.2), même esprit que
 * `travel.calibration.test.ts` et `orbits.calibration.test.ts` : il ne juge pas un choix de
 * conception, il rend une dérive silencieuse impossible.
 *
 * ## Pourquoi il existe
 *
 * L'habitabilité était **tirée** dans une fourchette par type de planète. Elle est désormais
 * **calculée** par une chaîne physique de treize étapes, dont chaque constante peut être
 * rééquilibrée sans que rien ne casse. C'est le prix de l'inversion de causalité que l'ADR
 * 0021 assume : le garde-fou remplace la contrainte.
 *
 * Le risque n'est pas théorique. La première version de la chaîne, entièrement plausible
 * étape par étape et validée sur le système solaire, produisait un univers où **6,6 % des
 * systèmes** avaient un monde viable contre ~70 % auparavant. Trois causes, toutes invisibles
 * dans les types et dans les tests unitaires : l'échelle d'orbites ancrée sur le milieu de la
 * zone habitable plutôt que sur son bord interne, le rayonnement en `1/d²` qui rendait toute
 * naine rouge létale dans sa propre zone habitable, et des bandes de vivabilité tombant à
 * zéro là où le jeu veut « pauvre mais colonisable ».
 *
 * Aucune de ces trois erreurs n'aurait été vue sans cette mesure.
 *
 * ## Ce qu'il verrouille
 *
 * Des **fourchettes**, jamais des valeurs : la chaîne doit pouvoir évoluer. Ce qui ne doit pas
 * bouger sans qu'on le décide, c'est l'ordre de grandeur de ce que le joueur trouve.
 */

const universe = generateUniverse("calibration-45-2", 4);
const systems = allSystems(universe).filter((s) => !isDrifter(s));
const planets = allPlanets(universe);
const colonizable = planets.filter((p) => planetType(p.type).colonizable);

/** Seuil sous lequel un système était réputé mort avant le chantier 45 (`stars.ts`). */
const DEAD_SYSTEM = 41;
/** Seuil au-dessus duquel un monde vaut d'être pris. */
const PRIME = 55;

describe("distribution de l'habitabilité", () => {
  it("une majorité de systèmes offre un monde qui vaut d'être pris", () => {
    // Repère historique : l'ancien générateur laissait ~30 % de systèmes morts, mesurés au
    // chantier 35 (« onze systèmes sur trente-sept »). En dessous de la moitié, l'expansion
    // devient une corvée ; au-dessus de 85 %, explorer ne récompense plus rien.
    const alive = systems.filter((s) =>
      s.planets.some((p) => p.habitability >= DEAD_SYSTEM),
    ).length;
    const share = alive / systems.length;
    expect(share).toBeGreaterThan(0.45);
    expect(share).toBeLessThan(0.85);
  });

  it("les mondes de premier ordre restent rares sans être introuvables", () => {
    const prime = colonizable.filter((p) => p.habitability >= PRIME).length;
    const share = prime / colonizable.length;
    expect(share).toBeGreaterThan(0.06);
    expect(share).toBeLessThan(0.3);
  });

  it("le meilleur monde d'un système médian est correct, pas excellent", () => {
    const best = systems
      .map((s) => Math.max(0, ...s.planets.map((p) => p.habitability)))
      .sort((a, b) => a - b);
    const median = best[Math.floor(best.length / 2)]!;
    expect(median).toBeGreaterThan(35);
    expect(median).toBeLessThan(75);
  });

  it("un corps sans sol vaut zéro, et lui seul", () => {
    // Le zéro est réservé à ce qui n'a pas de surface. Tout ce qui en a une reste
    // colonisable sous dôme, même mal : c'est ce que l'ancien modèle disait déjà en donnant
    // 5 à 40 aux mondes hostiles.
    for (const planet of colonizable) {
      expect(planet.habitability, planet.id).toBeGreaterThan(0);
    }
    const gas = planets.filter((p) => !planetType(p.type).colonizable);
    expect(gas.length).toBeGreaterThan(0);
    for (const planet of gas) expect(planet.habitability, planet.id).toBe(0);
  });

  it("chaque galaxie a de quoi accueillir ses empires, et large", () => {
    // `expansion.ts` ouvre la frontière quand les mondes libres manquent : si cette réserve
    // fond, le rythme d'expansion change sans que rien ne le signale.
    for (const galaxy of universe.galaxies) {
      const habitable = galaxy.systems.filter((s) =>
        s.planets.some((p) => p.habitability >= DEAD_SYSTEM),
      ).length;
      expect(habitable, galaxy.id).toBeGreaterThan(MAX_EMPIRES_PER_GALAXY * 4);
    }
  });

  it("le berceau porte un monde d'accueil digne de ce nom", () => {
    // `bootstrap-service` y choisit la colonie mère au meilleur monde : un berceau médiocre
    // condamnerait chaque nouvelle partie.
    const home = universe.galaxies[0]!;
    const best = Math.max(
      ...home.systems.flatMap((s) => s.planets.map((p) => p.habitability)),
    );
    expect(best).toBeGreaterThanOrEqual(80);
  });
});

describe("distribution des gisements", () => {
  /**
   * Le vrai garde-fou de l'économie. `depositBonus` et `noDepositModifier` sont calés sur
   * cette distribution, et les multiplicateurs de type se composent : une dérive ici se
   * répercute sur chaque rendement de chaque colonie, sans casser un seul test.
   */
  const mean = (resource: "ore" | "energy" | "food") => {
    const values = planets
      .map((p) => p.deposits[resource])
      .filter((v): v is number => v !== undefined);
    return values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);
  };

  it("le rendement moyen par ressource reste dans sa fourchette", () => {
    // Les tendances du catalogue vont de 0,2 à 2,0 selon le type et la ressource ; la
    // moyenne d'un univers, `depositBonus` compris, doit rester dans cet ordre.
    for (const resource of ["ore", "energy", "food"] as const) {
      expect(mean(resource), resource).toBeGreaterThan(0.8);
      expect(mean(resource), resource).toBeLessThan(2.5);
    }
  });

  it("une part substantielle des corps porte au moins un gisement", () => {
    const withDeposit = planets.filter(
      (p) => Object.keys(p.deposits).length > 0,
    ).length;
    expect(withDeposit / planets.length).toBeGreaterThan(0.7);
  });
});
