import { afterEach, describe, expect, it } from "vitest";
import { NO_ASTRO_OVERRIDES, type CentralBody } from "@spacesim/shared";
import { setAstroOverrides } from "../state/astro-content.js";
import {
  asteroidTint,
  bodyAppearance,
  centralBodyAppearance,
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

  it("rend une teinte pour une faction et une ceinture inconnues", () => {
    expect(factionTint("faction-inventée")).toMatch(/^#/);
    for (const value of unknown)
      expect(asteroidTint({ typeId: value })).toMatch(/^#/);
  });

  it("distingue réellement ce qu'il connaît", () => {
    // Un repli qui absorberait tout serait indétectable : ce test dit que les entrées
    // connues, elles, diffèrent bel et bien les unes des autres.
    expect(starAppearance("red_dwarf").radius).not.toBe(
      starAppearance("supergiant").radius,
    );
    expect(asteroidTint({ typeId: "icy" })).not.toBe(
      asteroidTint({ typeId: "debris" }),
    );
  });
});

describe("contenu publié par le serveur (chantier 45.4)", () => {
  /**
   * L'autre moitié de la dette de `design.md` (chantier 31.22). Le serveur publie désormais
   * les surcharges ; ce cas vérifie que le client les APPLIQUE — sans quoi la route
   * n'aurait rien changé pour le joueur.
   */
  afterEach(() => setAstroOverrides(NO_ASTRO_OVERRIDES));

  it("une couleur éditée en admin change le rendu d'un corps", () => {
    const body = {
      kind: "planet",
      classId: "rocky",
      variantId: "temperate",
    } as const;
    const before = bodyAppearance(body).color;
    setAstroOverrides({ planetVariant: { temperate: { color: "#0f0f0f" } } });
    expect(bodyAppearance(body).color).toBe("#0f0f0f");
    expect(bodyAppearance(body).color).not.toBe(before);
  });

  it("une teinte de ceinture éditée change le rendu de la ceinture", () => {
    setAstroOverrides({ belt: { icy: { tint: "#0e0e0e" } } });
    expect(asteroidTint({ typeId: "icy" })).toBe("#0e0e0e");
    // Et seulement celle-là : les autres compositions gardent la leur.
    expect(asteroidTint({ typeId: "debris" })).not.toBe("#0e0e0e");
  });

  it("un rayon d'étoile édité change la scène sans toucher au reste de la classe", () => {
    setAstroOverrides({ star: { red_dwarf: { radius: 42 } } });
    expect(starAppearance("red_dwarf").radius).toBe(42);
    // `intensity` n'est pas surchargée : elle vient toujours du catalogue intégré.
    expect(starAppearance("red_dwarf").intensity).toBeGreaterThan(0);
  });
});

describe("taille et lumière d'une singularité (chantier 47)", () => {
  /**
   * Ces cas mesurent pour la première fois ce que les catalogues rendent vraiment. Avant, une
   * singularité rendait `radius: 0.55, corona: 1.6` EN DUR — soit exactement les proportions
   * du trou noir stellaire — et les onze types sortaient à la même taille, quand bien même
   * `horizonRadius`, `discRadius` et `mouthRadius` étaient éditables depuis l'admin.
   */
  afterEach(() => setAstroOverrides(NO_ASTRO_OVERRIDES));

  const singular = (kind: CentralBody["kind"], typeId: string) => {
    const look = centralBodyAppearance({
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
    if (look.kind !== "singularity") throw new Error("attendu : singularité");
    return look.singularity;
  };

  it("un supermassif est bien plus grand qu'un primordial", () => {
    // 51 contre 1 au catalogue. Les deux rendaient 7,15 avant le chantier 47.
    const big = singular("blackHole", "supermassive");
    const small = singular("blackHole", "primordial");
    expect(big.horizonRadius).toBeGreaterThan(small.horizonRadius * 10);
    expect(big.discRadius).toBeGreaterThan(small.discRadius * 10);
  });

  it("un dormant n'a ni disque ni lumière", () => {
    // Son lore tient dans le catalogue : « son danger étant qu'on ne le voit pas venir ».
    // Il éclairait pourtant son système comme n'importe quel autre.
    const dormant = singular("blackHole", "dormant");
    expect(dormant.discRadius).toBe(0);
    expect(dormant.intensity).toBe(0);
    expect(dormant.horizonRadius).toBeGreaterThan(0);
  });

  it("une fontaine blanche n'a pas une bouche noire", () => {
    // « Rien n'y tombe, tout en sort » — elle rendait pourtant la même sphère absolument
    // noire qu'un trou noir, la teinte étant codée en dur dans le composant.
    expect(singular("whiteHole", "stable").mouth).not.toBe(
      singular("blackHole", "stellar").mouth,
    );
  });

  it("une étoile et une singularité ne rendent pas la même forme", () => {
    // C'est ce que l'union discriminée impose au compilateur, et ce cas le dit à l'exécution :
    // les deux familles ne portent pas les mêmes grandeurs, ni dans les mêmes unités.
    const star = centralBodyAppearance({
      id: "s",
      systemId: "s",
      name: "S",
      kind: "star",
      typeId: "red_dwarf",
      rank: 0,
      mass: 1,
      orbitRadius: 0,
      orbitAngle: 0,
      inclination: 0,
      ascendingNode: 0,
    });
    expect(star.kind).toBe("star");
  });

  it("un rayon d'horizon édité en admin traverse jusqu'à la scène", () => {
    setAstroOverrides({ blackHole: { stellar: { horizonRadius: 42 } } });
    expect(singular("blackHole", "stellar").horizonRadius).toBe(42);
    // Et seulement celui-là : le disque garde sa valeur intégrée.
    expect(singular("blackHole", "stellar").discRadius).toBe(41.6);
  });

  it("un corps absent rend l'étoile la plus banale", () => {
    // Système redacté : ce que le joueur n'a pas visité ne doit rien lui annoncer.
    const look = centralBodyAppearance(undefined);
    expect(look.kind).toBe("star");
  });
});
