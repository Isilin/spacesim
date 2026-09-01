import { afterEach, describe, expect, it } from "vitest";
import { labelTexture, resetLabelTextures } from "./MapLabels.js";

/**
 * Cache de textures d'étiquettes (chantier 36.3).
 *
 * Rastériser un nom coûte un canvas 2D et un transfert GPU. Le générateur produit des
 * homonymes à foison — toutes les lunes d'un système partagent leur suffixe, et deux
 * systèmes de galaxies différentes peuvent porter le même nom —, si bien qu'une texture par
 * étiquette au lieu d'une par texte multiplierait le coût sans changer une image.
 *
 * Rien dans les types n'impose la mémoïsation : c'est ce test, et lui seul, qui la tient.
 * `CanvasTexture` est du JS ordinaire, comme `HoloBatch.test.ts` l'a établi — seul
 * l'affichage réclamerait un contexte WebGL.
 */
describe("labelTexture", () => {
  afterEach(() => resetLabelTextures());

  it("rend la même texture pour le même texte", () => {
    const first = labelTexture("Rharyn IV");
    expect(labelTexture("Rharyn IV")).toBe(first);
  });

  it("distingue deux textes", () => {
    expect(labelTexture("Rharyn IV")).not.toBe(labelTexture("Rharyn V"));
  });

  it("rend une texture même quand le canvas 2D est indisponible", () => {
    // Sous jsdom, `getContext("2d")` rend `null`. Un test de carte ne doit pas échouer
    // parce qu'une étiquette n'a pas pu se dessiner — et en production, un contexte perdu
    // ne doit pas emporter la scène avec lui.
    const texture = labelTexture("Sans contexte");
    expect(texture.image).toBeTruthy();
    expect(texture.image.height).toBeGreaterThan(0);
  });

  it("oublie tout après une remise à zéro", () => {
    const before = labelTexture("Hyathae");
    resetLabelTextures();
    expect(labelTexture("Hyathae")).not.toBe(before);
  });
});
