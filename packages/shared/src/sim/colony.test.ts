import { describe, expect, it } from "vitest";
import { BASE_STORAGE, MAX_QUEUE_LENGTH } from "../constants.js";
import { BUILDINGS } from "../content/buildings.js";
import { emptyOrbital } from "./orbital.js";
import { computeEffects } from "./research.js";
import type { Colony, Planet } from "../types.js";
import {
  applyColonyTick,
  buildingCost,
  colonyRates,
  colonyShortages,
  emptyResources,
  enqueueBuilding,
  popCap,
  resolveQueue,
  storageCap,
  usedSlots,
  workforceEfficiency,
} from "./colony.js";

const planet: Planet = {
  id: "sys-0-p1",
  systemId: "sys-0",
  name: "Test I",
  kind: "planet",
  type: "telluric",
  habitability: 70,
  slots: 10,
  deposits: { ore: 1.5, food: 1.0 },
  orbitRadius: 100,
  orbitAngle: 0,
};

function makeColony(overrides: Partial<Colony> = {}): Colony {
  return {
    id: "col-1",
    planetId: planet.id,
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

describe("enqueueBuilding", () => {
  it("paie le coût et ajoute à la file", () => {
    const colony = makeColony();
    const result = enqueueBuilding(colony, planet, "mine", 1000);
    if (!result.ok) throw new Error(result.reason);
    expect(result.colony.resources.ore).toBe(500 - BUILDINGS.mine.cost.ore!);
    expect(result.colony.resources.energy).toBe(200 - BUILDINGS.mine.cost.energy!);
    expect(result.colony.queue).toHaveLength(1);
    expect(result.colony.queue[0]!.finishesAt).toBe(1000 + BUILDINGS.mine.buildMs);
  });

  it("refuse si ressources insuffisantes", () => {
    const colony = makeColony({ resources: { ...emptyResources(), ore: 10 } });
    const result = enqueueBuilding(colony, planet, "mine", 0);
    expect(result.ok).toBe(false);
  });

  it("refuse au-delà de la taille max de file", () => {
    let colony = makeColony({ resources: { ...emptyResources(), ore: 100000, energy: 100000 } });
    for (let i = 0; i < MAX_QUEUE_LENGTH; i++) {
      const r = enqueueBuilding(colony, planet, "mine", 0);
      if (!r.ok) throw new Error(r.reason);
      colony = r.colony;
    }
    expect(enqueueBuilding(colony, planet, "mine", 0).ok).toBe(false);
  });

  it("refuse quand la planète n'a plus d'emplacements", () => {
    const colony = makeColony({
      resources: { ...emptyResources(), ore: 100000, energy: 100000 },
      buildings: { mine: 10 },
    });
    expect(usedSlots(colony)).toBe(10);
    expect(enqueueBuilding(colony, planet, "farm", 0).ok).toBe(false);
  });

  it("refuse un bâtiment verrouillé par la tech, l'accepte une fois recherchée", () => {
    const colony = makeColony({ resources: { ...emptyResources(), ore: 100000, energy: 100000 } });
    expect(enqueueBuilding(colony, planet, "smelter", 0).ok).toBe(false);
    const withTech = computeEffects(["metallurgy"]);
    expect(enqueueBuilding(colony, planet, "smelter", 0, withTech).ok).toBe(true);
  });

  it("enchaîne les instances : coût plat, démarrage après l'item précédent", () => {
    const colony = makeColony({ resources: { ...emptyResources(), ore: 100000, energy: 100000 } });
    const r1 = enqueueBuilding(colony, planet, "mine", 1000);
    if (!r1.ok) throw new Error(r1.reason);
    const r2 = enqueueBuilding(r1.colony, planet, "mine", 1000);
    if (!r2.ok) throw new Error(r2.reason);
    const [a, b] = r2.colony.queue;
    expect(b!.startedAt).toBe(a!.finishesAt);
    // Pas de niveaux : la deuxième instance coûte pareil.
    expect(buildingCost(BUILDINGS.mine)).toEqual(BUILDINGS.mine.cost);
  });
});

describe("resolveQueue", () => {
  it("chaque construction terminée ajoute une instance, garde les autres", () => {
    const colony = makeColony({
      buildings: { mine: 2 },
      queue: [
        { buildingId: "mine", startedAt: 0, finishesAt: 1000 },
        { buildingId: "farm", startedAt: 1000, finishesAt: 5000 },
      ],
    });
    const after = resolveQueue(colony, 2000);
    expect(after.buildings.mine).toBe(3);
    expect(after.buildings.farm).toBeUndefined();
    expect(after.queue).toHaveLength(1);
  });
});

describe("applyColonyTick", () => {
  it("produit selon le nombre d'instances et le gisement", () => {
    const colony = makeColony({ buildings: { mine: 2 } });
    const after = applyColonyTick(colony, planet);
    // 2/tick × 2 instances × gisement 1.5
    expect(after.resources.ore).toBe(500 + 2 * 2 * 1.5);
  });

  it("bâtiment sans intrants tourne à vide", () => {
    const colony = makeColony({
      resources: { ...emptyResources(), energy: 0 },
      buildings: { laboratory: 1 },
    });
    const after = applyColonyTick(colony, planet);
    expect(after.resources.science).toBe(0);
    expect(after.resources.energy).toBe(0);
  });

  it("plafonne au stockage", () => {
    const colony = makeColony({
      resources: { ...emptyResources(), ore: BASE_STORAGE - 1 },
      buildings: { mine: 5 },
    });
    const after = applyColonyTick(colony, planet);
    expect(after.resources.ore).toBe(BASE_STORAGE);
    expect(storageCap(colony, "ore")).toBe(BASE_STORAGE);
  });

  it("la science n'est pas plafonnée", () => {
    const colony = makeColony({
      resources: { ...emptyResources(), energy: 1000, science: BASE_STORAGE },
      buildings: { laboratory: 1 },
    });
    const after = applyColonyTick(colony, planet);
    expect(after.resources.science).toBeGreaterThan(BASE_STORAGE);
  });
});

describe("colonyRates", () => {
  it("calcule le flux net par tick, besoins de population inclus", () => {
    const colony = makeColony({ buildings: { mine: 1, laboratory: 2 } });
    const rates = colonyRates(colony, planet);
    expect(rates.ore).toBe(2 * 1.5);
    expect(rates.energy).toBe(-2);
    expect(rates.science).toBe(1);
    expect(rates.food).toBe(-100 * 0.05);
  });
});

describe("chaînes de production", () => {
  it("fonderie : minerai + énergie → métaux", () => {
    const colony = makeColony({
      population: 100,
      buildings: { smelter: 1 },
      resources: { ...emptyResources(), ore: 100, energy: 100, food: 100 },
    });
    const after = applyColonyTick(colony, planet);
    expect(after.resources.metals).toBe(1.5);
    expect(after.resources.ore).toBe(97);
    expect(after.resources.energy).toBe(98);
  });

  it("pénurie en cascade : fonderie à sec arrête l'usine de composants", () => {
    const colony = makeColony({
      population: 100,
      buildings: { smelter: 1, component_factory: 1 },
      resources: { ...emptyResources(), energy: 100, food: 100 },
    });
    const after = applyColonyTick(colony, planet);
    expect(after.resources.metals).toBe(0);
    expect(after.resources.components).toBe(0);
    const shortages = colonyShortages(colony);
    expect(shortages.map((s) => s.buildingId).sort()).toEqual(["component_factory", "smelter"]);
  });

  it("les biens consommés soutiennent la satisfaction", () => {
    const base = {
      population: 100,
      buildings: { habitat: 5 } as Colony["buildings"],
    };
    const withGoods = applyColonyTick(
      makeColony({ ...base, resources: { ...emptyResources(), food: 1000, goods: 1000 } }),
      planet,
    );
    const withoutGoods = applyColonyTick(
      makeColony({ ...base, resources: { ...emptyResources(), food: 1000 } }),
      planet,
    );
    expect(withGoods.satisfaction).toBeGreaterThan(withoutGoods.satisfaction);
    expect(withGoods.resources.goods).toBe(1000 - 100 * 0.02);
  });
});

describe("population", () => {
  it("croît quand nourrie et logée, plafonnée par l'habitabilité", () => {
    // habitat 5 → 100 logements × 70 % habitabilité = cap 70
    const colony = makeColony({
      population: 50,
      buildings: { habitat: 5 },
      resources: { ...emptyResources(), food: 1000 },
    });
    expect(popCap(colony, planet)).toBe(70);
    const after = applyColonyTick(colony, planet);
    expect(after.population).toBeGreaterThan(50);
    // Sans biens de conso : 40 (nourriture) + 25 (logement) + 14 (habitabilité 70) = 79
    expect(after.satisfaction).toBe(79);
  });

  it("ne croît plus au plafond de population", () => {
    const colony = makeColony({
      population: 70,
      buildings: { habitat: 5 },
      resources: { ...emptyResources(), food: 1000 },
    });
    const after = applyColonyTick(colony, planet);
    expect(after.population).toBe(70);
  });

  it("décline en famine", () => {
    const colony = makeColony({
      population: 100,
      buildings: { habitat: 5 },
      resources: emptyResources(),
    });
    const after = applyColonyTick(colony, planet);
    expect(after.satisfaction).toBeLessThan(50);
    expect(after.population).toBeLessThan(100);
  });

  it("les bâtiments sous-employés produisent au prorata", () => {
    // mine 2 = 10 emplois, 5 colons → efficacité 0,5
    const colony = makeColony({
      population: 5,
      buildings: { mine: 2 },
      resources: { ...emptyResources(), food: 100 },
    });
    expect(workforceEfficiency(colony)).toBe(0.5);
    const after = applyColonyTick(colony, planet);
    expect(after.resources.ore).toBe(2 * 2 * 1.5 * 0.5);
  });

  it("l'impôt rapporte des crédits proportionnels à la satisfaction", () => {
    const colony = makeColony({
      population: 100,
      buildings: { habitat: 5 },
      resources: { ...emptyResources(), food: 1000 },
    });
    const after = applyColonyTick(colony, planet);
    expect(after.resources.credits).toBeGreaterThan(0);
  });
});
