import { describe, expect, it } from "vitest";
import { hashSeed } from "./rng.js";
import { GENERATOR_VERSION, generateUniverse } from "./universe.js";

/**
 * Verrou anti-corruption silencieuse (chantier 18) : le flux de sortie du générateur
 * est gelé dans `universe.fixture.json`. Les galaxies matérialisées en DB ne dépendent
 * plus du générateur, mais tout changement non assumé du flux produirait des galaxies
 * frontières incohérentes avec l'univers officiel — ce test le rend impossible à rater.
 *
 * Si ce test casse : soit le changement du générateur est involontaire (le corriger),
 * soit il est assumé — alors régénérer la fixture (`pnpm --filter @spacesim/shared
 * test -- -u`) ET incrémenter `GENERATOR_VERSION` dans le MÊME commit. Le diff de la
 * fixture doit montrer les deux.
 *
 * ## Pourquoi une empreinte et non l'univers entier (chantier 37)
 *
 * La fixture gelait l'univers complet, sérialisé et indenté : 187 Ko pour 37 systèmes.
 * À 300-520 systèmes par galaxie, le même fichier pèserait près de sept mégaoctets, que
 * personne ne relirait — et un diff que personne ne lit ne verrouille rien.
 *
 * Ce qui est gelé est donc, par galaxie : sa fiche d'identité, ses comptes, une empreinte
 * de son flux COMPLET (tout changement d'un corps, d'un nom, d'un gisement la fait bouger),
 * et trois systèmes en clair — de quoi comprendre un diff sans ouvrir un mégaoctet. Le
 * déterminisme, lui, reste vérifié sur l'objet entier par le test suivant.
 */
function digest(seed: string, galaxyCount: number) {
  const universe = generateUniverse(seed, galaxyCount);
  return {
    generatorVersion: GENERATOR_VERSION,
    seed: universe.seed,
    galaxies: universe.galaxies.map((galaxy) => ({
      id: galaxy.id,
      name: galaxy.name,
      at: [galaxy.x, galaxy.y, galaxy.z],
      depositBonus: galaxy.depositBonus,
      anchorSystemId: galaxy.anchorSystemId,
      systemCount: galaxy.systems.length,
      linkCount: galaxy.links.length,
      bodyCount: galaxy.systems.reduce((n, s) => n + s.planets.length, 0),
      beltCount: galaxy.systems.reduce((n, s) => n + s.belts.length, 0),
      stationCount: galaxy.systems.filter((s) => s.station).length,
      fingerprint: hashSeed(JSON.stringify(galaxy)).toString(16),
      sample: [
        galaxy.systems[0],
        galaxy.systems[Math.floor(galaxy.systems.length / 2)],
        galaxy.systems[galaxy.systems.length - 1],
      ],
    })),
  };
}

describe("fixture gelée du générateur", () => {
  it("generateUniverse produit exactement le flux gelé", async () => {
    const snapshot = JSON.stringify(digest("fixture-seed", 3), null, 2);
    await expect(snapshot).toMatchFileSnapshot("./universe.fixture.json");
  });

  it("le générateur est déterministe (deux appels, même sortie)", () => {
    expect(generateUniverse("fixture-seed", 3)).toEqual(
      generateUniverse("fixture-seed", 3),
    );
  });
});
