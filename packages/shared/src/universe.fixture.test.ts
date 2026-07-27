import { describe, expect, it } from "vitest";
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
 */
describe("fixture gelée du générateur", () => {
  it("generateUniverse produit exactement le flux gelé", async () => {
    const universe = generateUniverse("fixture-seed", 3);
    const snapshot = JSON.stringify({ generatorVersion: GENERATOR_VERSION, universe }, null, 2);
    await expect(snapshot).toMatchFileSnapshot("./universe.fixture.json");
  });

  it("le générateur est déterministe (deux appels, même sortie)", () => {
    expect(generateUniverse("fixture-seed", 3)).toEqual(generateUniverse("fixture-seed", 3));
  });
});
