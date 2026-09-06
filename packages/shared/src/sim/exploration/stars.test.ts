import { describe, expect, it } from "vitest";
import type { Galaxy, Planet, StarSystem } from "../../model/universe.js";
import { generateUniverse } from "../../universe.js";
import {
  galacticCoreDisc,
  galacticCoreHorizon,
  galaxyMorphologyOf,
  GALAXY_MORPHOLOGIES,
  starClassOf,
  STAR_CLASSES,
} from "./stars.js";
import {
  GALAXY_RADIUS_PER_ROOT_SYSTEM,
  MIN_SYSTEM_DISTANCE,
} from "../../constants.js";

/**
 * Classes d'étoiles et morphologies dérivées (chantier 35.9).
 *
 * Ces valeurs ne sont écrites nulle part : elles se recalculent à chaque appel, côté client
 * comme côté serveur. Ce que ces tests protègent, c'est donc moins une valeur qu'un
 * **accord** — le même identifiant doit toujours rendre la même chose, et ce qu'elle rend
 * ne doit jamais contredire ce que le système contient déjà.
 */

function planet(id: string, habitability: number, orbitRadius: number): Planet {
  return { id, habitability, orbitRadius } as unknown as Planet;
}

function system(id: string, planets: Planet[]): StarSystem {
  return { id, planets } as unknown as StarSystem;
}

/** Univers de référence, tiré du même seed que la fixture gelée du générateur. */
const universe = generateUniverse("fixture-seed", 3);
const systems = universe.galaxies.flatMap((g) => g.systems);

describe("starClassOf", () => {
  it("rend toujours la même classe pour le même système", () => {
    for (const s of systems.slice(0, 12)) {
      expect(starClassOf(s)).toBe(starClassOf(s));
    }
  });

  it("ne dépend que de l'identifiant du système, pas de ses voisins", () => {
    // Stabilité : l'univers s'étend en cours de partie (`ensureFrontier`), et une galaxie
    // ajoutée ne doit pas changer le ciel des systèmes déjà visités.
    const grown = generateUniverse("fixture-seed", 4);
    for (const before of systems) {
      const after = grown.galaxies
        .flatMap((g) => g.systems)
        .find((s) => s.id === before.id);
      if (after) expect(starClassOf(after)).toBe(starClassOf(before));
    }
  });

  it("ne met jamais de relique là où un monde est habitable", () => {
    // LA contrainte de cohérence : un trou noir avec cinq mondes habitables serait absurde,
    // et c'est ce qui justifie de lire la classe du contenu plutôt que de la tirer.
    const relics = ["blackHole", "pulsar", "whiteDwarf"];
    for (const s of systems) {
      if (!relics.includes(starClassOf(s))) continue;
      const best = Math.max(...s.planets.map((p) => p.habitability));
      expect(best).toBeLessThan(41);
    }
  });

  it("garde les reliques rares sans les faire disparaître", () => {
    // Un trou noir doit rester un événement, pas une curiosité qu'on ne verra jamais : sur
    // trois galaxies générées, l'univers en compte quelques-uns et pas des dizaines.
    const counts = new Map<string, number>();
    for (const s of systems) {
      const k = starClassOf(s);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    expect(counts.get("mainSequence") ?? 0).toBeGreaterThan(0);
    expect(counts.get("blackHole") ?? 0).toBeLessThan(systems.length * 0.1);
    // Rare mais pas absent : sur trois galaxies, le ciel doit déjà offrir au moins une
    // relique à trouver, sans quoi les seuils seraient trop serrés pour qu'on en voie
    // jamais une.
    const relicCount =
      (counts.get("blackHole") ?? 0) +
      (counts.get("pulsar") ?? 0) +
      (counts.get("whiteDwarf") ?? 0);
    expect(relicCount).toBeGreaterThan(0);
    // Toutes les classes rendues appartiennent bien à l'énumération publiée.
    for (const k of counts.keys()) {
      expect(STAR_CLASSES).toContain(k as (typeof STAR_CLASSES)[number]);
    }
  });

  it("rend la classe la plus banale pour un système redacté", () => {
    // Le brouillard vide un système inexploré de ses corps : ce que le joueur n'a pas
    // visité ne doit pas lui annoncer un trou noir.
    expect(starClassOf(system("gal-9-sys-9", []))).toBe("mainSequence");
  });

  it("suit l'étendue des orbites pour les étoiles vivantes", () => {
    // Ce que le joueur voit déjà à l'écran doit s'accorder avec ce qu'il lit du ciel.
    const wide = starClassOf(system("wide", [planet("a", 60, 300)]));
    const tight = starClassOf(system("tight", [planet("b", 60, 80)]));
    expect(["giant", "mainSequence"]).toContain(wide);
    expect(["redDwarf", "mainSequence"]).toContain(tight);
  });
});

describe("galaxyMorphologyOf", () => {
  it("rend toujours la même morphologie pour la même galaxie", () => {
    for (const g of universe.galaxies) {
      expect(galaxyMorphologyOf(g)).toBe(galaxyMorphologyOf(g));
      expect(GALAXY_MORPHOLOGIES).toContain(galaxyMorphologyOf(g));
    }
  });

  it("laisse les galaxies pauvres irrégulières ou elliptiques", () => {
    // Une galaxie de quelques systèmes n'a pas de bras à montrer.
    const sparse = { id: "gal-sparse", systems: [] } as unknown as Galaxy;
    expect(["irregular", "elliptical"]).toContain(galaxyMorphologyOf(sparse));
  });
});

describe("galacticCore", () => {
  /**
   * Plage réelle du générateur : `MIN_GALAXY_SYSTEMS` à `HOME_GALAXY_SYSTEMS`
   * (`universe.ts`). Les bornes sont recopiées ici plutôt qu'importées — elles sont privées
   * au générateur, et ce qui compte est que le cœur tienne sur toute l'étendue qu'une galaxie
   * peut prendre, pas qu'il suive une constante.
   */
  const SIZES = [300, 340, 400, 460, 520];

  it("laisse le vide central de la galaxie libre", () => {
    // LE verrou du chantier. `generatePositions` ne pose aucun système en deçà de 0,08·R dans
    // les morphologies non barrées : c'est ce vide que le cœur occupe. Débordé, il cesserait
    // d'être un bulbe pour devenir une nappe posée sur les systèmes internes — et c'est ce
    // test qui alertera si la plage de tailles d'une galaxie change un jour.
    for (const n of SIZES) {
      const hollow = 0.08 * GALAXY_RADIUS_PER_ROOT_SYSTEM * Math.sqrt(n);
      expect(galacticCoreDisc(n)).toBeLessThan(hollow);
    }
  });

  it("grossit avec la galaxie, assez pour que ça se voie", () => {
    // La demande était que la taille dépende de celle de la galaxie. Une loi en √n aurait
    // rendu la même image partout : c'est cet écart qui prouve le contraire.
    for (let i = 1; i < SIZES.length; i++) {
      expect(galacticCoreDisc(SIZES[i]!)).toBeGreaterThan(
        galacticCoreDisc(SIZES[i - 1]!),
      );
    }
    expect(galacticCoreDisc(520) / galacticCoreDisc(300)).toBeGreaterThan(1.5);
  });

  it("reste un objet, jamais un décor ni un obstacle", () => {
    // Plus gros que l'emprise d'un nœud de système (`SYSTEM_NODE`, 3 dans ce repère), sinon
    // il ne se distingue pas du champ d'étoiles ; plus petit que la moitié de la maille
    // locale, sinon il avale ses voisins.
    for (const n of SIZES) {
      expect(galacticCoreHorizon(n)).toBeGreaterThan(3);
      expect(galacticCoreHorizon(n)).toBeLessThan(MIN_SYSTEM_DISTANCE / 2);
    }
  });
});
