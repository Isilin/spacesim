import { describe, expect, it } from "vitest";
import type { Colony } from "../../model/industry.js";
import { emptyResources } from "../industry/colony.js";
import { emptyOrbital } from "../industry/orbital.js";
import {
  decideColonyEconomy,
  NPC_DEFICIT_THRESHOLD,
  NPC_SURPLUS_THRESHOLD,
} from "./npc.js";

function makeColony(overrides: Partial<Colony> = {}): Colony {
  return {
    id: "col-1",
    planetId: "sys-0-p1",
    name: "Base",
    resources: { ...emptyResources(), ore: 500, energy: 200, food: 100 },
    orbitalResources: emptyOrbital(),
    liftRules: {},
    buildings: {},
    queue: [],
    population: 100,
    satisfaction: 80,
    ships: {},
    shipsBusy: [],
    shipQueue: [],
    ...overrides,
  };
}

describe("decideColonyEconomy", () => {
  it("aucun intent quand tout est dans les clous", () => {
    const colony = makeColony({
      resources: {
        ...emptyResources(),
        ore: 200,
        energy: 200,
        food: 200,
        metals: 200,
        goods: 200,
        components: 200,
      },
      orbitalResources: { ...emptyOrbital(), ore: 100 },
    });
    expect(decideColonyEconomy(colony)).toEqual([]);
  });

  it("vend l'excédent orbital au-delà du seuil", () => {
    const colony = makeColony({
      resources: {
        ...emptyResources(),
        ore: 200,
        energy: 200,
        food: 200,
        metals: 200,
        goods: 200,
        components: 200,
      },
      orbitalResources: { ...emptyOrbital(), ore: NPC_SURPLUS_THRESHOLD + 50 },
    });
    const intents = decideColonyEconomy(colony);
    expect(intents).toEqual([{ kind: "sell", resource: "ore", quantity: 50 }]);
  });

  it("demande par contrat ce qui manque au sol", () => {
    const colony = makeColony({
      resources: {
        ...emptyResources(),
        ore: 10,
        energy: 200,
        food: 200,
        metals: 200,
        goods: 200,
        components: 200,
      },
      orbitalResources: emptyOrbital(),
    });
    const intents = decideColonyEconomy(colony);
    expect(intents).toEqual([
      {
        kind: "postContract",
        resource: "ore",
        quantity: NPC_DEFICIT_THRESHOLD - 10,
      },
    ]);
  });

  it("un surplus orbital prime sur un déficit au sol pour la même ressource", () => {
    const colony = makeColony({
      resources: {
        ...emptyResources(),
        ore: 0,
        energy: 200,
        food: 200,
        metals: 200,
        goods: 200,
        components: 200,
      },
      orbitalResources: { ...emptyOrbital(), ore: NPC_SURPLUS_THRESHOLD + 1 },
    });
    const intents = decideColonyEconomy(colony);
    expect(intents).toEqual([{ kind: "sell", resource: "ore", quantity: 1 }]);
  });

  it("plusieurs ressources peuvent générer plusieurs intents", () => {
    const colony = makeColony({
      resources: {
        ...emptyResources(),
        ore: 0,
        energy: 0,
        food: 200,
        metals: 200,
        goods: 200,
        components: 200,
      },
      orbitalResources: emptyOrbital(),
    });
    const intents = decideColonyEconomy(colony);
    expect(intents).toHaveLength(2);
    expect(intents.map((i) => i.resource).sort()).toEqual(["energy", "ore"]);
  });
});
