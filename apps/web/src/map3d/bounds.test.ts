import { describe, expect, it } from "vitest";
import { fitDistance } from "./MapCanvas.js";
import { focusOf } from "./bounds.js";

/**
 * Cadrage des cartes 3D. Ces fonctions ne produisent aucun DOM : c'est le seul endroit
 * du rendu qui se vérifie sans navigateur, et c'est là que vivait le défaut d'origine —
 * les vues cadraient sur les constantes de génération (`MAP_WIDTH`, `GALAXY_SPACING`) et
 * visaient l'origine, alors que le générateur ne remplit pas son pavé et ne le centre
 * pas. La moitié des objets tombaient hors champ.
 */
describe("focusOf", () => {
  it("centre la boîte sur le contenu, pas sur l'origine", () => {
    const focus = focusOf(
      "t",
      [
        [100, 200, 0],
        [300, 400, 0],
      ],
      0,
      0,
    );
    expect(focus.center).toEqual([200, 300, 0]);
  });

  it("englobe le rayon des objets posés aux points", () => {
    // Sans la marge, un objet centré au bord serait coupé en deux par le cadrage.
    const bare = focusOf(
      "t",
      [
        [0, 0, 0],
        [100, 0, 0],
      ],
      0,
      0,
    );
    const padded = focusOf(
      "t",
      [
        [0, 0, 0],
        [100, 0, 0],
      ],
      25,
      0,
    );
    expect(padded.half[0] - bare.half[0]).toBe(25);
  });

  it("retombe sur le rayon plancher quand il n'y a rien à cadrer", () => {
    const focus = focusOf("t", [], 10, 300);
    expect(focus.center).toEqual([0, 0, 0]);
    expect(focus.radius).toBe(300);
  });

  it("garde une épaisseur non nulle sur un contenu parfaitement plan", () => {
    // Une galaxie à un seul système donnerait une boîte plate et une caméra collée.
    const focus = focusOf("t", [[0, 0, 0]], 5, 100);
    expect(focus.half.every((h) => h > 0)).toBe(true);
  });
});

describe("fitDistance", () => {
  it("recule proportionnellement à la taille du contenu", () => {
    const small = focusOf(
      "t",
      [
        [-50, -50, 0],
        [50, 50, 0],
      ],
      0,
      0,
    );
    const big = focusOf(
      "t",
      [
        [-500, -500, 0],
        [500, 500, 0],
      ],
      0,
      0,
    );
    expect(fitDistance(big, 1) / fitDistance(small, 1)).toBeCloseTo(10, 1);
  });

  it("recule davantage sur un cadre étroit que sur un cadre large", () => {
    // Le rapport d'image entre dans le calcul : sur téléphone la scène est plus haute
    // que large, et un cadrage qui ne tient que le vertical y couperait les bords.
    const focus = focusOf(
      "t",
      [
        [-400, -40, 0],
        [400, 40, 0],
      ],
      0,
      0,
    );
    expect(fitDistance(focus, 0.5)).toBeGreaterThan(fitDistance(focus, 2));
  });
});
