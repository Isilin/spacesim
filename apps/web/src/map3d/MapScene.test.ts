import { describe, expect, it } from "vitest";
import { pathFor, slotIdFor, type AnchorPath } from "./MapScene.js";

/**
 * L'invariant du chantier 38 — « la sélection est l'ancre » — tient dans ces deux fonctions,
 * et il se vérifie sans WebGL.
 *
 * `anchors` porte deux choses que le code confondait : l'**ascendance**, qui ne doit jamais
 * avoir de trou (sans elle, le cadrage d'un corps retombe sur celui de l'amas), et la
 * **visée**, le seul créneau sous le palier courant, qui peut être nulle. Tout le reste de la
 * refonte en découle.
 */
describe("slotIdFor", () => {
  const path: AnchorPath = { galaxyId: "g", systemId: "s", bodyId: "b" };

  it("vise l'objet quand il est l'enfant immédiat du palier courant", () => {
    expect(slotIdFor(path, "universe", "g")).toBe("g");
    expect(slotIdFor(path, "galaxy", "s")).toBe("s");
    expect(slotIdFor(path, "system", "b")).toBe("b");
  });

  it("ne vise rien d'un autre palier", () => {
    // Sélectionner une planète depuis la galaxie ne fait pas descendre de deux paliers d'un
    // coup : on vise ce dans quoi on peut entrer, pas ce qu'on aperçoit au fond.
    expect(slotIdFor(path, "universe", "s")).toBeNull();
    expect(slotIdFor(path, "galaxy", "b")).toBeNull();
    expect(slotIdFor(path, "system", "g")).toBeNull();
  });

  it("ne vise rien sous un corps", () => {
    expect(slotIdFor(path, "body", "b")).toBeNull();
  });

  it("ne vise rien quand rien n'est sélectionné, ni un objet sans chemin", () => {
    // Comptoir, station, ceinture, site : `anchorPathOf` ne leur rend aucun chemin, donc les
    // trois comparaisons échouent. Aucun cas particulier à écrire pour eux.
    const nowhere: AnchorPath = {
      galaxyId: null,
      systemId: null,
      bodyId: null,
    };
    expect(slotIdFor(path, "galaxy", null)).toBeNull();
    expect(slotIdFor(nowhere, "system", "comptoir-1")).toBeNull();
  });
});

describe("pathFor", () => {
  const ancestry: AnchorPath = { galaxyId: "g", systemId: "s", bodyId: "b" };

  it("garde l'ascendance quand rien n'est visé", () => {
    // C'est ce qui empêche une couche de se démonter sous les yeux du joueur : au palier
    // galaxie, la galaxie reste matérialisée même sans visée.
    expect(pathFor(ancestry, "galaxy", null)).toEqual({
      galaxyId: "g",
      systemId: null,
      bodyId: null,
    });
  });

  it("efface toujours ce qui se trouve sous la visée", () => {
    // Régression : `anchorFrom` rendait le chemin précédent INCHANGÉ quand l'identifiant ne
    // changeait pas — donc avec le `bodyId` d'une visite antérieure. La carte montait alors
    // une couche corps que le joueur n'avait pas visée, et dans laquelle il ne pouvait pas
    // descendre.
    expect(pathFor(ancestry, "galaxy", "s")).toEqual({
      galaxyId: "g",
      systemId: "s",
      bodyId: null,
    });
    expect(pathFor(ancestry, "universe", "g")).toEqual({
      galaxyId: "g",
      systemId: null,
      bodyId: null,
    });
  });

  it("pose la visée dans le créneau du palier courant", () => {
    expect(pathFor(ancestry, "system", "autre-corps")).toEqual({
      galaxyId: "g",
      systemId: "s",
      bodyId: "autre-corps",
    });
  });

  it("rend l'ascendance intacte au dernier palier", () => {
    // Il n'y a pas de créneau sous un corps ; l'ascendance y est déjà complète.
    expect(pathFor(ancestry, "body", null)).toEqual(ancestry);
    expect(pathFor(ancestry, "body", "peu-importe")).toEqual(ancestry);
  });
});
