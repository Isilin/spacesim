import { describe, expect, it } from "vitest";
import {
  asteroidTint,
  bodyAppearance,
  factionTint,
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

  it("rend un corps neutre pour une classe ou une variante inconnue", () => {
    // Deux axes depuis le chantier 45.3, donc deux replis à vérifier : une classe inconnue
    // ne doit pas coûter la couleur, ni une variante inconnue le relief. Et deux familles
    // depuis la taxonomie de lunes : `kind` choisit la table, un id de lune posé sur une
    // planète doit retomber sur le repli plutôt que de lire la mauvaise.
    for (const value of unknown) {
      for (const kind of ["planet", "moon"] as const) {
        for (const look of [
          bodyAppearance({ kind, classId: value, variantId: "temperate" }),
          bodyAppearance({ kind, classId: "rocky", variantId: value }),
          bodyAppearance({ kind, classId: value, variantId: value }),
          bodyAppearance({ kind, classId: "regular", variantId: "tidal" }),
        ]) {
          expect(look.color).toMatch(/^#/);
          expect(look.relief).toBeGreaterThan(0);
        }
      }
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

  it("rend une teinte pour une faction et un gisement inconnus", () => {
    expect(factionTint("faction-inventée")).toMatch(/^#/);
    expect(asteroidTint({})).toMatch(/^#/);
    expect(asteroidTint({ science: 2 })).toMatch(/^#/);
  });

  it("distingue réellement ce qu'il connaît", () => {
    // Un repli qui absorberait tout serait indétectable : ce test dit que les entrées
    // connues, elles, diffèrent bel et bien les unes des autres.
    expect(starAppearance("red_dwarf").radius).not.toBe(
      starAppearance("supergiant").radius,
    );
    expect(asteroidTint({ ore: 2 })).not.toBe(asteroidTint({ metals: 2 }));
  });
});
