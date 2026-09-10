import {
  MAX_CENTRAL_BODIES,
  type CentralBody,
  type StarSystem,
} from "@spacesim/shared";
import { describe, expect, it } from "vite-plus/test";
import {
  centralBodySlots,
  pairReadingScale,
  STAR_CORE,
} from "./centralBodies.js";

/**
 * Les deux règles de rendu des corps centraux (chantier 47).
 *
 * Elles sont pures et testées ici parce que le chantier 47 corrige trois décisions de rendu
 * qui avaient été écrites en ligne dans des composants, donc hors de portée de tout test. Ce
 * fichier est le contre-exemple : ce qui se décide se vérifie.
 */

const body = (orbitRadius: number, id = `b${orbitRadius}`): CentralBody => ({
  id,
  systemId: "s",
  name: id,
  kind: "star",
  typeId: "yellow_dwarf",
  rank: orbitRadius === 0 ? 0 : 1,
  mass: 1,
  orbitRadius,
  orbitAngle: 0,
  inclination: 0,
  ascendingNode: 0,
});

const system = (stars?: CentralBody[]): StarSystem =>
  ({
    id: "s",
    name: "S",
    planets: [],
    belts: [],
    ...(stars ? { stars } : {}),
  }) as unknown as StarSystem;

describe("emplacements de corps centraux", () => {
  it("le nombre d'emplacements ne dépend pas du système", () => {
    // LE point. Un nombre variable de `pointLight` fait recompiler tous les matériaux de la
    // scène par three.js — un à-coup à chaque entrée dans un système au nombre d'étoiles
    // différent. La longueur constante est ce qui l'empêche, et rien d'autre ne le dirait.
    const single = centralBodySlots(system([body(0)]));
    const binary = centralBodySlots(system([body(0), body(500, "b")]));
    const triple = centralBodySlots(
      system([body(0), body(500, "b"), body(700, "c")]),
    );
    const fogged = centralBodySlots(system());
    for (const slots of [single, binary, triple, fogged]) {
      expect(slots).toHaveLength(MAX_CENTRAL_BODIES);
    }
  });

  it("les emplacements vides sont vides, pas absents", () => {
    const slots = centralBodySlots(system([body(0)]));
    expect(slots[0]).toBeDefined();
    expect(slots[1]).toBeUndefined();
    expect(slots[2]).toBeUndefined();
  });

  it("un système redacté n'a aucun corps mais garde ses emplacements", () => {
    // Le brouillard vide `stars` : le rendu ne doit pas pour autant changer de forme.
    expect(centralBodySlots(system()).every((s) => s === undefined)).toBe(true);
  });
});

describe("lecture d'une paire serrée", () => {
  it("deux corps trop proches sont rétrécis pour se lire comme deux", () => {
    // La borne basse de `TIGHT_BINARY` : deux étoiles à 10 unités l'une de l'autre, rendues à
    // leur rayon nominal de 13, forment une seule boule. Le facteur les sépare.
    const scale = pairReadingScale([body(0), body(10, "b")]);
    expect(scale).toBeLessThan(0.4);
    expect(scale).toBeGreaterThan(0);
    // Vérification directe de ce que le facteur achète : un intervalle franc entre les deux.
    const rendered = STAR_CORE * scale;
    expect(rendered * 2).toBeLessThan(10);
  });

  it("la bande serrée entière reste lisible", () => {
    // `TIGHT_BINARY` va de 10 à 22 : aucune séparation de la bande ne doit produire une boule.
    for (let separation = 10; separation <= 22; separation++) {
      const scale = pairReadingScale([body(0), body(separation, "b")]);
      expect(STAR_CORE * scale * 2, `séparation ${separation}`).toBeLessThan(
        separation,
      );
    }
  });

  it("une binaire large n'est pas rétrécie", () => {
    // `WIDE_BINARY` commence à 420 : à cette distance les deux corps se lisent déjà.
    expect(pairReadingScale([body(0), body(420, "b")])).toBe(1);
    expect(pairReadingScale([body(0), body(900, "b")])).toBe(1);
  });

  it("une étoile seule n'est pas rétrécie", () => {
    // L'ancre a un rayon d'orbite nul : elle ne doit pas compter comme une séparation.
    expect(pairReadingScale([body(0)])).toBe(1);
    expect(pairReadingScale([])).toBe(1);
  });

  it("c'est la paire la plus serrée qui décide", () => {
    // Dans un triple, deux corps éloignés ne rachètent pas deux corps collés.
    const scale = pairReadingScale([body(0), body(12, "b"), body(800, "c")]);
    expect(scale).toBe(pairReadingScale([body(0), body(12, "b")]));
  });
});
