import { describe, expect, it } from "vitest";
import { beltType } from "./belt-types.js";
import { bodyEnvironment, bodyStructure } from "./body-defs.js";
import { moonVariant } from "./moon-variants.js";
import { planetVariant } from "./planet-variants.js";
import { starClass } from "./star-classes.js";
import type { AstroOverrides } from "./overrides.js";

/**
 * La frontière de l'ADR 0021, vérifiée à l'exécution (chantier 45.4).
 *
 * Les types la rendent déjà infranchissable à la compilation : `AstroOverrides` n'accepte que
 * des `Pick` des champs d'effet. Ces cas vérifient l'autre moitié — que la surcharge arrive
 * bien jusqu'au lecteur, qu'elle n'écrase que ce qu'elle nomme, et qu'un catalogue non
 * surchargé ne coûte rien.
 */

describe("surcharges de catalogue", () => {
  it("une surcharge remplace le champ nommé et lui seul", () => {
    const overrides: AstroOverrides = {
      star: { red_dwarf: { core: "#ffffff" } },
    };
    const base = starClass("red_dwarf");
    const patched = starClass("red_dwarf", overrides);
    expect(patched.core).toBe("#ffffff");
    // Tout le reste vient de la définition intégrée, y compris la moitié gelée.
    expect(patched.massRange).toEqual(base.massRange);
    expect(patched.luminosity).toBe(base.luminosity);
    expect(patched.edge).toBe(base.edge);
  });

  it("un type non surchargé rend exactement l'objet intégré", () => {
    // Pas une copie : le chemin est appelé pour chaque corps de chaque système rendu.
    const overrides: AstroOverrides = {
      star: { red_dwarf: { core: "#ffffff" } },
    };
    expect(starClass("yellow_dwarf", overrides)).toBe(
      starClass("yellow_dwarf"),
    );
  });

  it("une famille absente laisse les autres intactes", () => {
    const overrides: AstroOverrides = { belt: { icy: { hazard: 5 } } };
    expect(beltType("icy", overrides).hazard).toBe(5);
    expect(planetVariant("temperate", overrides).color).toBe(
      planetVariant("temperate").color,
    );
  });

  it("un identifiant inconnu retombe sur le repli, surcharge comprise", () => {
    // L'ADR 0007 impose le repli générique ; il ne doit pas disparaître quand une surcharge
    // existe pour un autre identifiant.
    const overrides: AstroOverrides = { belt: { icy: { tint: "#000000" } } };
    expect(beltType("inventée", overrides).tint).toBe(
      beltType("silicate").tint,
    );
  });

  it("planète et lune se surchargent dans leurs propres tables", () => {
    // Le piège que la taxonomie de lunes introduit : « icy » nomme une classe de lune ET un
    // type de ceinture, et les deux familles ne doivent pas se contaminer.
    const overrides: AstroOverrides = {
      planetVariant: { frozen: { color: "#111111" } },
      moonVariant: { subglacial: { color: "#222222" } },
    };
    const planet = {
      kind: "planet",
      classId: "rocky",
      variantId: "frozen",
    } as const;
    const moon = {
      kind: "moon",
      classId: "icy",
      variantId: "subglacial",
    } as const;
    expect(bodyEnvironment(planet, overrides).color).toBe("#111111");
    expect(bodyEnvironment(moon, overrides).color).toBe("#222222");
    // La table lunaire ne connaît pas « frozen » : elle retombe sur son propre repli.
    expect(moonVariant("frozen", overrides).color).toBe(
      moonVariant("airless").color,
    );
  });

  it("la structure d'une lune ne lit pas les surcharges de planètes", () => {
    const overrides: AstroOverrides = {
      planetClass: { rocky: { renderRadius: 99 } },
    };
    const moon = {
      kind: "moon",
      classId: "regular",
      variantId: "airless",
    } as const;
    const planet = {
      kind: "planet",
      classId: "rocky",
      variantId: "temperate",
    } as const;
    expect(bodyStructure(planet, overrides).renderRadius).toBe(99);
    expect(bodyStructure(moon, overrides).renderRadius).not.toBe(99);
  });
});
