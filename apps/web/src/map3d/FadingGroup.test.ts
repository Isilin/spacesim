import { describe, expect, it } from "vitest";
import { layerOpacity } from "./FadingGroup.js";
import { TIER_ORDER } from "./tiers.js";

/**
 * Fondu des couches de carte (chantier 35.4).
 *
 * Ce que ce test protège : à toute profondeur, la somme de ce qui est dessiné doit rester
 * pleine. Deux fondus qui se croisent trop bas font clignoter la carte à chaque
 * franchissement, et rien dans le DOM ne le dirait.
 */
describe("layerOpacity", () => {
  it("montre entièrement le palier où l'on se trouve, tant qu'on n'en sort pas", () => {
    expect(layerOpacity("universe", 0)).toBe(1);
    expect(layerOpacity("universe", 0.5)).toBe(1);
    expect(layerOpacity("system", 2.4)).toBe(1);
  });

  it("efface le palier quitté exactement à la frontière", () => {
    // C'est l'invariant qui rend le démontage invisible : `MapScene` retire une couche
    // déjà entièrement transparente.
    expect(layerOpacity("universe", 1)).toBeCloseTo(0, 12);
    expect(layerOpacity("galaxy", 2)).toBeCloseTo(0, 12);
  });

  it("fait apparaître l'enfant avant que le parent ne s'efface", () => {
    // L'enfant est monté dès 0,3 mais reste invisible jusqu'à 0,35 : monter une scène
    // coûte une image, la faire apparaître au même instant rendrait ce coût visible.
    expect(layerOpacity("galaxy", 0.3)).toBe(0);
    expect(layerOpacity("galaxy", 0.75)).toBe(1);
    expect(layerOpacity("universe", 0.75)).toBeGreaterThan(0);
  });

  it("ne laisse jamais la scène se vider, à aucune profondeur", () => {
    // LE test de ce module : deux fondus qui se croisent trop bas font clignoter la carte
    // à chaque franchissement, et rien dans le DOM ne le dirait.
    for (let depth = 0; depth <= 3.0001; depth += 0.01) {
      const total = TIER_ORDER.reduce(
        (sum, tier) => sum + layerOpacity(tier, depth),
        0,
      );
      expect(total).toBeGreaterThanOrEqual(0.999);
    }
  });

  it("efface complètement une couche hors champ", () => {
    // Rendre 1 pour une couche déjà franchie ferait réapparaître l'univers en pleine
    // galaxie au moindre décalage d'une image entre l'état React et la profondeur.
    expect(layerOpacity("body", 0)).toBe(0);
    expect(layerOpacity("universe", 2.5)).toBe(0);
    expect(layerOpacity("universe", 3)).toBe(0);
  });
});
