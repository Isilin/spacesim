import { describe, expect, it } from "vitest";
import {
  asteroidTint,
  bodyAppearance,
  factionTint,
  galaxyAppearance,
  starAppearance,
} from "./appearance.js";

/**
 * Registre d'apparence : le **repli générique** (chantiers 31.18 puis 35.10).
 *
 * L'ADR 0007 en fait une obligation, pas un confort : le contenu du jeu est éditable depuis
 * l'admin (chantier 23), et une entrée créée sans coder doit rendre une forme neutre plutôt
 * que casser la vue ou disparaître. C'est la condition pour que le CMS tienne sa promesse,
 * et c'est le seul test qui la vérifie — rien dans les types ne l'impose, une classe
 * d'étoile ou une faction arrivant ici sous forme de chaîne.
 */
describe("repli générique du registre d'apparence", () => {
  const unknown = ["", "inconnu", "Étoile-Fantôme", "42"];

  it("rend un corps neutre pour un type de planète inconnu", () => {
    for (const value of unknown) {
      const look = bodyAppearance(value);
      expect(look.color).toMatch(/^#/);
      expect(look.relief).toBeGreaterThan(0);
    }
  });

  it("rend une étoile neutre pour une classe inconnue", () => {
    for (const value of unknown) {
      const look = starAppearance(value);
      expect(look.core).toMatch(/^#/);
      // Une étoile de repli doit éclairer : à zéro, tout un système serait dans le noir
      // parce qu'une chaîne a changé.
      expect(look.intensity).toBeGreaterThan(0);
      expect(look.radius).toBeGreaterThan(0);
    }
  });

  it("rend une galaxie neutre pour une morphologie inconnue", () => {
    for (const value of unknown) {
      const look = galaxyAppearance(value);
      expect(look.arms).toBeGreaterThan(0);
      expect(look.winding).toBeGreaterThan(0);
    }
  });

  it("rend une teinte pour une faction et un gisement inconnus", () => {
    expect(factionTint("faction-inventée")).toMatch(/^#/);
    expect(asteroidTint({})).toMatch(/^#/);
    expect(asteroidTint({ science: 2 })).toMatch(/^#/);
  });

  it("distingue réellement ce qu'il connaît", () => {
    // Un repli qui absorberait tout serait indétectable : ce test dit que les entrées
    // connues, elles, diffèrent bel et bien les unes des autres.
    expect(starAppearance("redDwarf").radius).not.toBe(
      starAppearance("giant").radius,
    );
    expect(galaxyAppearance("elliptical").arms).toBe(0);
    expect(asteroidTint({ ore: 2 })).not.toBe(asteroidTint({ metals: 2 }));
  });
});
