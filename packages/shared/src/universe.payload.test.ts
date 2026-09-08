import { describe, expect, it } from "vitest";
import { redactUniverse } from "./sim/exploration/fog.js";
import { generateUniverse } from "./universe.js";

/**
 * Mesure de la charge utile de l'univers (chantier 37.9).
 *
 * L'univers part **en entier** à chaque `hello`, et de nouveau à chaque tick où
 * l'exploration bouge (`projections.ts`) : aucune pagination, contrairement au journal
 * d'empire ou au chat. C'était sans conséquence tant qu'une galaxie comptait quatorze
 * systèmes. Elle en compte quatre cents depuis le chantier 37, et cette dimension est
 * devenue la contrainte qui décide de la forme du protocole.
 *
 * Ce test ne juge pas d'un choix de conception : il **rend le mur visible**, et vérifie
 * que le condensé (chantier 37.10) le tient à distance. Les plafonds sont ceux qu'on
 * assume, avec une marge d'un tiers ; les franchir doit obliger à rouvrir la question, pas
 * à relever la borne sans y penser.
 */

const KB = 1024;
const size = (value: unknown) => JSON.stringify(value).length;

describe("charge utile de l'univers (chantier 37.9)", () => {
  const fresh = generateUniverse("mesure-37-9", 4);
  const nowhere = new Set<string>();
  const everywhere = new Set(
    fresh.galaxies.flatMap((g) => g.systems.map((s) => s.id)),
  );
  /** Ce que voit un joueur neuf : sa galaxie de départ, et rien d'autre en détail. */
  const home = new Set([fresh.galaxies[0]!.id]);

  it("sans découpage, une partie neuve pèse déjà des centaines de kilo-octets", () => {
    // Relevé au chantier 37 : 227 Ko, contre 6 Ko avant l'agrandissement des galaxies.
    // C'est la mesure qui a rendu le condensé nécessaire.
    const whole = size(redactUniverse(fresh, nowhere));
    expect(whole).toBeGreaterThan(150 * KB);
    expect(whole).toBeLessThan(320 * KB);
  });

  it("le condensé rend quasi gratuit tout ce qui est hors de portée", () => {
    // Formulé « divise par trois » au chantier 37.10, et vrai tant qu'une galaxie sur
    // quatre pesait un quart du contenu. Le chantier 45 borne la taille d'une galaxie par
    // son type : la mère reste la plus grande possible (520) pendant que les autres
    // peuvent tomber à 300, et elle pèse alors près d'un tiers de l'univers **à elle
    // seule**. Un facteur trois devenait inatteignable par arithmétique, sans que le
    // condensé ait rien perdu de son efficacité.
    //
    // Ce que le condensé promet vraiment ne dépend ni du nombre de galaxies ni de leurs
    // tailles relatives : les galaxies hors de portée ne coûtent presque plus rien. C'est
    // cela qu'on mesure, et c'est un verrou plus serré que l'ancien.
    const cut = redactUniverse(fresh, nowhere, home);
    const whole = redactUniverse(fresh, nowhere);
    const homeId = fresh.galaxies[0]!.id;

    const distantCut = cut.galaxies.filter((g) => g.id !== homeId);
    const distantWhole = whole.galaxies.filter((g) => g.id !== homeId);
    const cutCost = distantCut.reduce((s, g) => s + size(g), 0);
    const wholeCost = distantWhole.reduce((s, g) => s + size(g), 0);

    expect(cutCost).toBeLessThan(wholeCost / 10);
    // Et la galaxie de départ reste ce qui domine la facture : si ce rapport s'inverse,
    // c'est que le condensé a cessé de condenser.
    expect(cutCost).toBeLessThan(
      size(cut.galaxies.find((g) => g.id === homeId)!),
    );
  });

  it("une galaxie hors de portée ne coûte que son nuage", () => {
    const cut = redactUniverse(fresh, nowhere, home);
    const distant = cut.galaxies.find((g) => g.id !== fresh.galaxies[0]!.id)!;
    expect(distant.systems).toHaveLength(0);
    expect(distant.links).toHaveLength(0);
    // Le compte de systèmes survit au condensé : c'est lui qu'affichent les fiches.
    expect(distant.systemCount).toBeGreaterThan(200);
    expect(distant.cloud!.length).toBeGreaterThan(0);
    expect(size(distant)).toBeLessThan(5 * KB);
  });

  it("la seed ne part jamais au client", () => {
    // Le générateur est déterministe et vit dans le paquet du navigateur : avec la seed,
    // n'importe quel client reconstruit les planètes et les gisements que le brouillard
    // prétend cacher.
    expect(redactUniverse(fresh, nowhere)).not.toHaveProperty("seed");
    expect(JSON.stringify(redactUniverse(fresh, nowhere, home))).not.toContain(
      "mesure-37-9",
    );
  });

  it("un univers entièrement exploré reste l'ordre de grandeur à surveiller", () => {
    // Cas limite : tout est révélé dans les quatre galaxies détaillées. C'est la borne
    // haute du `hello` d'un joueur installé de longue date.
    expect(size(redactUniverse(fresh, everywhere))).toBeLessThan(7 * KB * KB);
  });

  it("au plafond de galaxies, le condensé tient là où l'envoi complet ne tenait pas", () => {
    const wide = generateUniverse("mesure-37-9", 40);
    const whole = size(redactUniverse(wide, nowhere)) / 40;
    const cut = size(redactUniverse(wide, nowhere, home)) / 40;
    // Sans condensé, `MAX_GALAXIES` (200) vaut plus de dix mégaoctets par `hello` ; avec,
    // quelques centaines de kilo-octets. C'est ce rapport qui rend le plafond tenable.
    expect(whole).toBeGreaterThan(30 * KB);
    expect(cut).toBeLessThan(6 * KB);
  });
});
