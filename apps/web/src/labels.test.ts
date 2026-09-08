import {
  BLACK_HOLE_TYPE_IDS,
  STAR_CLASS_IDS,
  WHITE_HOLE_TYPE_IDS,
  type SystemProfile,
} from "@spacesim/shared";
import { describe, expect, it } from "vitest";
import { i18n } from "./i18n.js";
import { centralBodyLabel, systemProfileLabel } from "./labels.js";

/**
 * Couverture des libellés de corps centraux (chantier 47).
 *
 * ## Le défaut que ce test rend impossible
 *
 * `centralBodyLabel` retombe sur l'identifiant brut quand la clé manque — c'est voulu, un type
 * ajouté sans traduction doit rester lisible. Mais ce repli est SILENCIEUX, et il a masqué la
 * table i18n périmée pendant tout le chantier 45 : elle portait encore les six identifiants
 * dérivés d'avant (`redDwarf`, `mainSequence`…), plus une seule clé ne correspondait, et
 * l'infobox affichait `orange_dwarf` en anglais dans une interface française.
 *
 * Rien ne pouvait le dire. Les types étaient justes, la fonction rendait une chaîne, l'écran
 * affichait quelque chose. Seul un test qui compare les DEUX listes — les identifiants que les
 * catalogues produisent et les clés que les traductions déclarent — peut attraper ça, et il
 * doit le faire pour chaque langue.
 */

const LANGUAGES = ["fr", "en"] as const;

describe("libellés des corps centraux", () => {
  const cases = [
    ...STAR_CLASS_IDS.map((typeId) => ({ kind: "star" as const, typeId })),
    ...BLACK_HOLE_TYPE_IDS.map((typeId) => ({
      kind: "blackHole" as const,
      typeId,
    })),
    ...WHITE_HOLE_TYPE_IDS.map((typeId) => ({
      kind: "whiteHole" as const,
      typeId,
    })),
  ];

  for (const language of LANGUAGES) {
    it(`tout type produit par les catalogues est traduit en ${language}`, async () => {
      await i18n.changeLanguage(language);
      for (const body of cases) {
        const label = centralBodyLabel(body);
        // Le repli rend l'identifiant tel quel : s'il ressort, la clé manque.
        expect(label, `${body.kind}/${body.typeId}`).not.toBe(body.typeId);
        expect(label.length, `${body.kind}/${body.typeId}`).toBeGreaterThan(2);
      }
    });
  }

  it("les trois familles ne se confondent pas", async () => {
    await i18n.changeLanguage("fr");
    // « pulsar » est une classe d'étoile, « stellar » un type de trou noir : sans `kind`, un
    // identifiant seul ne pouvait pas dire dans quelle table lire.
    expect(centralBodyLabel({ kind: "star", typeId: "pulsar" })).not.toBe(
      centralBodyLabel({ kind: "blackHole", typeId: "stellar" }),
    );
    // Un identifiant lu dans la mauvaise famille tombe sur le repli, il ne rend pas le
    // libellé d'un autre objet.
    expect(centralBodyLabel({ kind: "star", typeId: "stellar" })).toBe(
      "stellar",
    );
  });

  it("un type inconnu reste lisible au lieu de rendre du vide", async () => {
    await i18n.changeLanguage("fr");
    expect(centralBodyLabel({ kind: "star", typeId: "inventée" })).toBe(
      "inventée",
    );
  });
});

describe("fiche de lecture d'un système", () => {
  /**
   * La phrase, et surtout ce que le champ `starClass: string` qu'elle remplace ne pouvait pas
   * dire : un système compte jusqu'à trois corps centraux, et un champ n'en nomme qu'un.
   */
  const profile = (over: Partial<SystemProfile>): SystemProfile => ({
    known: true,
    arrangement: "single",
    bodies: [],
    groups: [],
    planets: 0,
    moons: 0,
    belts: 0,
    drifter: false,
    exotic: false,
    bestHabitability: -1,
    ...over,
  });

  it("nomme les deux corps d'une binaire, et ne choisit pas", () => {
    const line = systemProfileLabel(
      profile({
        arrangement: "wide",
        groups: [
          { kind: "star", typeId: "yellow_dwarf", count: 1 },
          { kind: "blackHole", typeId: "stellar", count: 1 },
        ],
        planets: 5,
        moons: 2,
        exotic: true,
      }),
    );
    expect(line).toContain("Naine jaune");
    expect(line).toContain("Trou noir stellaire");
    expect(line).toContain("Binaire large");
    expect(line).toContain("5 mondes");
    expect(line).toContain("2 lunes");
    // Le segment qui change une décision de jeu.
    expect(line).toContain("matière exotique");
  });

  it("groupe au lieu de répéter", () => {
    const line = systemProfileLabel(
      profile({
        arrangement: "tight",
        groups: [{ kind: "star", typeId: "red_dwarf", count: 2 }],
        planets: 3,
      }),
    );
    // « Naine rouge ×2 » plutôt qu'un pluriel composé : voir `systemProfileLabel`.
    expect(line).toContain("Naine rouge ×2");
    expect(line).not.toContain("Naine rouge et Naine rouge");
  });

  it("un système inexploré ne dit que ça", () => {
    // Surtout pas « 0 monde », qui affirmerait du faux et trahirait le brouillard.
    const line = systemProfileLabel(profile({ known: false }));
    expect(line).toBe("Inexploré");
    expect(line).not.toContain("0");
  });

  it("un errant se nomme errant", () => {
    const line = systemProfileLabel(
      profile({
        drifter: true,
        exotic: true,
        groups: [{ kind: "whiteHole", typeId: "stable", count: 1 }],
      }),
    );
    expect(line).toContain("Errant");
    expect(line).toContain("Fontaine stable");
  });
});
