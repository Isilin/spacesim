import {
  BASE_STORAGE,
  CREDITS_PER_COLONIST,
  FOOD_PER_COLONIST,
  GOODS_PER_COLONIST,
  HOUSING_PER_HABITAT,
  MAX_QUEUE_LENGTH,
  NO_DEPOSIT_MODIFIER,
  POP_GROWTH_BASE,
  SATISFACTION_GROWTH_THRESHOLD,
  STORAGE_PER_DEPOT,
  UNCAPPED_RESOURCES,
} from "../constants.js";
import { BUILDINGS, type BuildingDef } from "../content/buildings.js";
import { NO_EFFECTS, type EmpireEffects } from "./research.js";
import { RESOURCES, type BuildingId, type Colony, type Planet, type ResourceId } from "../types.js";

export function emptyResources(): Record<ResourceId, number> {
  return Object.fromEntries(RESOURCES.map((r) => [r, 0])) as Record<ResourceId, number>;
}

/** Coût plat par instance : pas de niveaux, on multiplie les bâtiments. */
export function buildingCost(def: BuildingDef): Partial<Record<ResourceId, number>> {
  return def.cost;
}

export function buildingBuildMs(def: BuildingDef): number {
  return def.buildMs;
}

export function storageCap(
  colony: Colony,
  resource: ResourceId,
  effects: EmpireEffects = NO_EFFECTS,
): number {
  if ((UNCAPPED_RESOURCES as readonly string[]).includes(resource)) return Infinity;
  const base = BASE_STORAGE + (colony.buildings.storage_depot ?? 0) * STORAGE_PER_DEPOT;
  return Math.floor(base * effects.storageMult);
}

/** Instances construites + en file : consomme les emplacements de la planète. */
export function usedSlots(colony: Colony): number {
  const built = Object.values(colony.buildings).reduce((s, count) => s + (count ?? 0), 0);
  return built + colony.queue.length;
}

export function canAfford(colony: Colony, cost: Partial<Record<ResourceId, number>>): boolean {
  return Object.entries(cost).every(
    ([res, amount]) => colony.resources[res as ResourceId] >= amount,
  );
}

export type EnqueueResult = { ok: true; colony: Colony } | { ok: false; reason: string };

/** Valide et paie une construction, l'ajoute à la file (séquentielle). */
export function enqueueBuilding(
  colony: Colony,
  planet: Planet,
  buildingId: BuildingId,
  now: number,
  effects: EmpireEffects = NO_EFFECTS,
): EnqueueResult {
  const def = BUILDINGS[buildingId];
  if (!def) return { ok: false, reason: `Bâtiment inconnu : ${buildingId}` };
  if (!effects.unlockedBuildings.has(buildingId)) {
    return { ok: false, reason: "Technologie requise non recherchée" };
  }
  if (colony.queue.length >= MAX_QUEUE_LENGTH + effects.queueBonus) {
    return { ok: false, reason: "File de construction pleine" };
  }
  if (usedSlots(colony) >= planet.slots)
    return { ok: false, reason: "Plus d'emplacements disponibles" };

  const cost = buildingCost(def);
  if (!canAfford(colony, cost)) return { ok: false, reason: "Ressources insuffisantes" };

  const resources = { ...colony.resources };
  for (const [res, amount] of Object.entries(cost)) {
    resources[res as ResourceId] -= amount;
  }

  const lastFinish = colony.queue.at(-1)?.finishesAt ?? now;
  const startedAt = Math.max(now, lastFinish);
  const finishesAt = startedAt + Math.round(buildingBuildMs(def) * effects.buildSpeedMult);

  return {
    ok: true,
    colony: {
      ...colony,
      resources,
      queue: [...colony.queue, { buildingId, startedAt, finishesAt }],
    },
  };
}

/** Applique les constructions terminées à l'instant `now` : +1 instance chacune. */
export function resolveQueue(colony: Colony, now: number): Colony {
  const done = colony.queue.filter((q) => q.finishesAt <= now);
  if (done.length === 0) return colony;
  const buildings = { ...colony.buildings };
  for (const item of done) {
    buildings[item.buildingId] = (buildings[item.buildingId] ?? 0) + 1;
  }
  return { ...colony, buildings, queue: colony.queue.filter((q) => q.finishesAt > now) };
}

function depositModifier(planet: Planet, resource: ResourceId | undefined): number {
  if (!resource) return 1;
  return planet.deposits[resource] ?? NO_DEPOSIT_MODIFIER;
}

export function housing(colony: Colony, effects: EmpireEffects = NO_EFFECTS): number {
  return Math.floor((colony.buildings.habitat ?? 0) * HOUSING_PER_HABITAT * effects.housingMult);
}

/** Habitabilité effective : celle de la planète + bonus de terraformation, plafonnée à 100. */
export function effectiveHabitability(planet: Planet, effects: EmpireEffects = NO_EFFECTS): number {
  return Math.min(100, planet.habitability + effects.habitabilityBonus);
}

/** Plafond de population : logements modulés par l'habitabilité effective. */
export function popCap(
  colony: Colony,
  planet: Planet,
  effects: EmpireEffects = NO_EFFECTS,
): number {
  return Math.floor(housing(colony, effects) * (effectiveHabitability(planet, effects) / 100));
}

export function totalJobs(colony: Colony): number {
  let jobs = 0;
  for (const [buildingId, level] of Object.entries(colony.buildings) as [BuildingId, number][]) {
    jobs += (BUILDINGS[buildingId].jobsPerInstance ?? 0) * (level ?? 0);
  }
  return jobs;
}

/** Part des emplois pourvus (uniforme sur tous les bâtiments) — 1 si assez de colons. */
export function workforceEfficiency(colony: Colony): number {
  const jobs = totalJobs(colony);
  if (jobs === 0) return 1;
  return Math.min(1, colony.population / jobs);
}

/**
 * Satisfaction 0–100 : nourriture (40 %), biens (15 %), logement (25 %), habitabilité (20 %).
 * Les ratios = part des besoins couverts au dernier tick.
 */
export function computeSatisfaction(
  colony: Colony,
  planet: Planet,
  foodRatio: number,
  goodsRatio: number,
  effects: EmpireEffects = NO_EFFECTS,
): number {
  const housingRatio =
    colony.population <= 0 ? 1 : Math.min(1, housing(colony, effects) / colony.population);
  const value =
    40 * foodRatio +
    15 * goodsRatio +
    25 * housingRatio +
    20 * (effectiveHabitability(planet, effects) / 100) +
    effects.satisfactionBonus;
  return Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;
}

/**
 * Croissance logistique par tick : positive au-dessus du seuil de satisfaction,
 * déclin en-dessous, ralentit près du plafond de population.
 */
function growPopulation(
  population: number,
  satisfaction: number,
  cap: number,
  growthMult = 1,
): number {
  if (population <= 0) return 0;
  const drive = (satisfaction - SATISFACTION_GROWTH_THRESHOLD) / SATISFACTION_GROWTH_THRESHOLD;
  if (drive >= 0) {
    const room = cap <= 0 ? 0 : Math.max(0, 1 - population / cap);
    return population * (1 + POP_GROWTH_BASE * growthMult * drive * room);
  }
  return Math.max(0, population * (1 + POP_GROWTH_BASE * drive));
}

/**
 * Production/consommation d'un tick, puis besoins de la population et croissance.
 * Un bâtiment dont les intrants manquent tourne à vide — la pénurie se propage.
 * Les bâtiments sous-employés produisent et consomment au prorata des emplois pourvus.
 */
export function applyColonyTick(
  colony: Colony,
  planet: Planet,
  effects: EmpireEffects = NO_EFFECTS,
): Colony {
  const resources = { ...colony.resources };
  const efficiency = workforceEfficiency(colony);

  for (const [buildingId, level] of Object.entries(colony.buildings) as [BuildingId, number][]) {
    if (!level) continue;
    const def = BUILDINGS[buildingId];
    if (!def.outputs && !def.inputs) continue;
    const staffing = def.jobsPerInstance ? efficiency : 1;
    if (staffing <= 0) continue;

    const inputs = Object.entries(def.inputs ?? {}) as [ResourceId, number][];
    const canRun = inputs.every(([res, rate]) => resources[res] >= rate * level * staffing);
    if (!canRun) continue;

    const outputBoost = (effects.outputMult[buildingId] ?? 1) * effects.outputMultAll;
    for (const [res, rate] of inputs) {
      resources[res] -= rate * level * staffing;
    }
    for (const [res, rate] of Object.entries(def.outputs ?? {}) as [ResourceId, number][]) {
      const modifier = def.depositScaled === res ? depositModifier(planet, res) : 1;
      resources[res] += rate * level * modifier * staffing * outputBoost;
    }
  }

  // Besoins : la population mange et consomme des biens, paie l'impôt selon sa satisfaction.
  const foodNeed = colony.population * FOOD_PER_COLONIST * effects.foodNeedMult;
  const eaten = Math.min(foodNeed, resources.food);
  resources.food -= eaten;
  const foodRatio = foodNeed <= 0 ? 1 : eaten / foodNeed;

  const goodsNeed = colony.population * GOODS_PER_COLONIST * effects.goodsNeedMult;
  const consumed = Math.min(goodsNeed, resources.goods);
  resources.goods -= consumed;
  const goodsRatio = goodsNeed <= 0 ? 1 : consumed / goodsNeed;

  const satisfaction = computeSatisfaction(colony, planet, foodRatio, goodsRatio, effects);
  resources.credits +=
    colony.population * CREDITS_PER_COLONIST * (satisfaction / 100) * effects.creditsMult;

  const population = growPopulation(
    colony.population,
    satisfaction,
    popCap(colony, planet, effects),
    effects.popGrowthMult,
  );

  for (const res of RESOURCES) {
    resources[res] = Math.min(resources[res], storageCap(colony, res, effects));
  }

  return { ...colony, resources, population, satisfaction };
}

/**
 * Flux net par tick et par ressource (pour l'UI) — suppose les intrants disponibles,
 * mais tient compte des emplois pourvus et des besoins de la population.
 */
export function colonyRates(
  colony: Colony,
  planet: Planet,
  effects: EmpireEffects = NO_EFFECTS,
): Record<ResourceId, number> {
  const rates = emptyResources();
  const efficiency = workforceEfficiency(colony);
  for (const [buildingId, level] of Object.entries(colony.buildings) as [BuildingId, number][]) {
    if (!level) continue;
    const def = BUILDINGS[buildingId];
    const staffing = def.jobsPerInstance ? efficiency : 1;
    const outputBoost = (effects.outputMult[buildingId] ?? 1) * effects.outputMultAll;
    for (const [res, rate] of Object.entries(def.inputs ?? {}) as [ResourceId, number][]) {
      rates[res] -= rate * level * staffing;
    }
    for (const [res, rate] of Object.entries(def.outputs ?? {}) as [ResourceId, number][]) {
      const modifier = def.depositScaled === res ? depositModifier(planet, res) : 1;
      rates[res] += rate * level * modifier * staffing * outputBoost;
    }
  }
  rates.food -= colony.population * FOOD_PER_COLONIST * effects.foodNeedMult;
  rates.goods -= colony.population * GOODS_PER_COLONIST * effects.goodsNeedMult;
  rates.credits +=
    colony.population * CREDITS_PER_COLONIST * (colony.satisfaction / 100) * effects.creditsMult;
  return rates;
}

export interface Shortage {
  buildingId: BuildingId;
  missing: ResourceId[];
}

/** Bâtiments à l'arrêt faute d'intrants au stock actuel (pour l'UI pénuries). */
export function colonyShortages(colony: Colony): Shortage[] {
  const shortages: Shortage[] = [];
  const efficiency = workforceEfficiency(colony);
  for (const [buildingId, level] of Object.entries(colony.buildings) as [BuildingId, number][]) {
    if (!level) continue;
    const def = BUILDINGS[buildingId];
    if (!def.inputs) continue;
    const staffing = def.jobsPerInstance ? efficiency : 1;
    const missing = (Object.entries(def.inputs) as [ResourceId, number][])
      .filter(([res, rate]) => colony.resources[res] < rate * level * staffing)
      .map(([res]) => res);
    if (missing.length > 0) shortages.push({ buildingId, missing });
  }
  return shortages;
}
