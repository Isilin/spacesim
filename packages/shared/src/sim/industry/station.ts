import { DEFAULT_BALANCE, type BalanceConstants } from "../../balance.js";
import {
  INSTALLATIONS,
  type InstallationDef,
} from "../../content/installations.js";
import { ZONE_TYPES, type ZoneTypeDef } from "../../content/zone-types.js";
import type { Station } from "../../model/industry.js";
import { RESOURCES, type ResourceId } from "../../model/resources.js";
import { NO_EFFECTS, type EmpireEffects } from "../empire/research.js";

/** Stock de station vide (toutes ressources à zéro). */
export function emptyStationResources(): Record<ResourceId, number> {
  return Object.fromEntries(RESOURCES.map((r) => [r, 0])) as Record<
    ResourceId,
    number
  >;
}

/**
 * Fonder une station exige d'avoir débloqué au moins un type de zone — sans ça, la
 * station serait une coque vide sans rien à y construire. Pas de champ dédié dans
 * `EmpireEffects` : la condition se déduit de `unlockedZoneTypes`, qui reste juste
 * automatiquement si un admin réédite quelle tech débloque quel type de zone.
 */
export function canFoundStation(effects: EmpireEffects): boolean {
  return effects.unlockedZoneTypes.size > 0;
}

/** Une installation `grants: "resourceMarket"` construite (comptée, pas en file) rend
 * la station apte à commercer des ressources — chantier 25. Testé par étiquette de
 * contenu (`grants`), jamais par id en dur : `ZoneTypeId`/`InstallationId` sont libres
 * côté DB (id-minting), un admin peut renommer/recréer ce contenu. */
export function hasResourceMarket(
  station: Station,
  installations: Record<string, InstallationDef> = INSTALLATIONS,
): boolean {
  return Object.entries(station.installations as Record<string, number>).some(
    ([id, count]) => (count ?? 0) > 0 && installations[id]?.grants === "resourceMarket",
  );
}

/** Même patron que `hasResourceMarket`, pour le marché de plans/vaisseaux. */
export function hasBlueprintMarket(
  station: Station,
  installations: Record<string, InstallationDef> = INSTALLATIONS,
): boolean {
  return Object.entries(station.installations as Record<string, number>).some(
    ([id, count]) => (count ?? 0) > 0 && installations[id]?.grants === "blueprintMarket",
  );
}

export function canAffordStation(
  station: Station,
  cost: Partial<Record<ResourceId, number>>,
): boolean {
  return Object.entries(cost).every(
    ([res, amount]) => station.resources[res as ResourceId] >= amount,
  );
}

export type EnqueueZoneResult =
  | { ok: true; station: Station }
  | { ok: false; reason: string };

/**
 * Valide et paie une zone, l'ajoute à la file (séquentielle) — pas de plafond de
 * nombre de zones : la seule limite est le coût, à chaque fois (voir CLAUDE.md/plan).
 */
export function enqueueZone(
  station: Station,
  zoneTypeId: string,
  now: number,
  effects: EmpireEffects = NO_EFFECTS,
  zoneTypes: Record<string, ZoneTypeDef> = ZONE_TYPES,
  balance: BalanceConstants = DEFAULT_BALANCE,
): EnqueueZoneResult {
  const def = zoneTypes[zoneTypeId];
  if (!def)
    return { ok: false, reason: `Type de zone inconnu : ${zoneTypeId}` };
  if (!effects.unlockedZoneTypes.has(zoneTypeId)) {
    return { ok: false, reason: "Technologie requise non recherchée" };
  }
  if (!canAffordStation(station, def.cost))
    return { ok: false, reason: "Ressources insuffisantes" };

  const resources = { ...station.resources };
  for (const [res, amount] of Object.entries(def.cost)) {
    resources[res as ResourceId] -= amount;
  }

  const lastFinish = station.zoneQueue.at(-1)?.finishesAt ?? now;
  const startedAt = Math.max(now, lastFinish);
  const finishesAt =
    startedAt + Math.round(def.buildMs * effects.buildSpeedMult);

  return {
    ok: true,
    station: {
      ...station,
      resources,
      zoneQueue: [...station.zoneQueue, { zoneTypeId, startedAt, finishesAt }],
    },
  };
}

/** Applique les zones terminées à l'instant `now` : +1 emplacement du type chacune. */
export function resolveZoneQueue(station: Station, now: number): Station {
  const done = station.zoneQueue.filter((q) => q.finishesAt <= now);
  if (done.length === 0) return station;
  const zones = { ...station.zones };
  for (const item of done) {
    zones[item.zoneTypeId] = (zones[item.zoneTypeId] ?? 0) + 1;
  }
  return {
    ...station,
    zones,
    zoneQueue: station.zoneQueue.filter((q) => q.finishesAt > now),
  };
}

/** Installations construites + en file d'un type de zone donné (occupe un emplacement). */
function installationsOfZoneType(
  station: Station,
  zoneType: string,
  installations: Record<string, InstallationDef>,
): number {
  const built = (
    Object.entries(station.installations) as [string, number][]
  ).reduce(
    (sum, [id, count]) =>
      sum + (installations[id]?.zoneType === zoneType ? (count ?? 0) : 0),
    0,
  );
  const queued = station.installQueue.filter(
    (q) => installations[q.installationId]?.zoneType === zoneType,
  ).length;
  return built + queued;
}

export type EnqueueInstallationResult =
  | { ok: true; station: Station }
  | { ok: false; reason: string };

/**
 * Valide et paie une installation, l'ajoute à la file — plafonnée par le nombre
 * d'emplacements du type de zone visé, comme un module plafonné par les emplacements
 * d'un châssis (`validateBlueprint`, `sim/industry/design.ts`).
 */
export function enqueueInstallation(
  station: Station,
  installationId: string,
  now: number,
  effects: EmpireEffects = NO_EFFECTS,
  installations: Record<string, InstallationDef> = INSTALLATIONS,
  balance: BalanceConstants = DEFAULT_BALANCE,
): EnqueueInstallationResult {
  const def = installations[installationId];
  if (!def)
    return { ok: false, reason: `Installation inconnue : ${installationId}` };
  if (!effects.unlockedInstallations.has(installationId)) {
    return { ok: false, reason: "Technologie requise non recherchée" };
  }
  const zoneSlots = station.zones[def.zoneType] ?? 0;
  if (
    installationsOfZoneType(station, def.zoneType, installations) >= zoneSlots
  ) {
    return {
      ok: false,
      reason: "Plus d'emplacement disponible dans ce type de zone",
    };
  }
  if (!canAffordStation(station, def.cost))
    return { ok: false, reason: "Ressources insuffisantes" };

  const resources = { ...station.resources };
  for (const [res, amount] of Object.entries(def.cost)) {
    resources[res as ResourceId] -= amount;
  }

  const lastFinish = station.installQueue.at(-1)?.finishesAt ?? now;
  const startedAt = Math.max(now, lastFinish);
  const finishesAt =
    startedAt + Math.round(def.buildMs * effects.buildSpeedMult);

  return {
    ok: true,
    station: {
      ...station,
      resources,
      installQueue: [
        ...station.installQueue,
        { installationId, startedAt, finishesAt },
      ],
    },
  };
}

/** Applique les installations terminées à l'instant `now` : +1 instance chacune. */
export function resolveInstallQueue(station: Station, now: number): Station {
  const done = station.installQueue.filter((q) => q.finishesAt <= now);
  if (done.length === 0) return station;
  const installations = { ...station.installations };
  for (const item of done) {
    installations[item.installationId] =
      (installations[item.installationId] ?? 0) + 1;
  }
  return {
    ...station,
    installations,
    installQueue: station.installQueue.filter((q) => q.finishesAt > now),
  };
}

/**
 * Production/consommation d'un tick. Contrairement à `applyColonyTick`, pas de
 * dotation/emploi à calculer : une station n'a pas de population, chaque installation
 * tourne à plein régime dès que ses intrants sont disponibles. Une installation dont
 * les intrants manquent tourne à vide (comme un bâtiment de colonie) — la pénurie se
 * propage, mais rien ne s'accumule au-delà (pas de plafond de stockage, voir modèle).
 */
export function applyStationTick(
  station: Station,
  installations: Record<string, InstallationDef> = INSTALLATIONS,
): Station {
  const resources = { ...station.resources };
  for (const [installationId, count] of Object.entries(
    station.installations,
  ) as [string, number][]) {
    if (!count) continue;
    const def = installations[installationId];
    if (!def || (!def.outputs && !def.inputs)) continue;

    const inputs = Object.entries(def.inputs ?? {}) as [ResourceId, number][];
    const canRun = inputs.every(
      ([res, rate]) => resources[res] >= rate * count,
    );
    if (!canRun) continue;

    for (const [res, rate] of inputs) resources[res] -= rate * count;
    for (const [res, rate] of Object.entries(def.outputs ?? {}) as [
      ResourceId,
      number,
    ][]) {
      resources[res] += rate * count;
    }
  }
  return { ...station, resources };
}

/**
 * Retire une cargaison du stock (chargement d'un vaisseau) — null si insuffisant.
 * Contrairement à une colonie, une station n'a qu'un seul stock, déjà en orbite :
 * pas d'équivalent `takeFromOrbit`/sol séparé.
 */
export function takeFromStation(
  station: Station,
  cargo: Partial<Record<ResourceId, number>>,
): Station | null {
  const resources = { ...station.resources };
  for (const [res, amount] of Object.entries(cargo) as [ResourceId, number][]) {
    if ((resources[res] ?? 0) < amount) return null;
    resources[res] = (resources[res] ?? 0) - amount;
  }
  return { ...station, resources };
}

/** Livre une cargaison au stock de la station — pas de plafond (voir modèle). */
export function deliverToStation(
  station: Station,
  cargo: Partial<Record<ResourceId, number>>,
): Station {
  const resources = { ...station.resources };
  for (const [res, amount] of Object.entries(cargo) as [ResourceId, number][]) {
    if (amount <= 0) continue;
    resources[res] = (resources[res] ?? 0) + amount;
  }
  return { ...station, resources };
}
