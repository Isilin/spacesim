import type { ResourceId } from "./resources.js";
import type { LiftRule } from "./transport.js";

export const BUILDING_IDS = [
  "mine",
  "power_plant",
  "farm",
  "habitat",
  "storage_depot",
  "laboratory",
  "smelter",
  "component_factory",
  "goods_factory",
  "shipyard",
  "monument",
  "orbital_dock",
] as const;

export type BuildingId = (typeof BUILDING_IDS)[number];

/** Classes civiles historiques (chantier 12). Depuis le chantier 13, un vaisseau civil
 * est identifié par l'id de son **plan** — d'où `ShipId = string`. Cette liste reste
 * la référence des classes héritées (presets, UI de transition). */
export const SHIP_IDS = ["cargo_small", "cargo_large", "hauler", "courier"] as const;

export type ShipId = string;

/** Une instance de vaisseau en production au chantier naval. */
export interface ShipQueueItem {
  shipId: ShipId;
  startedAt: number;
  finishesAt: number;
}

/** Vaisseau parti en convoi/mission : indisponible jusqu'à son retour. */
export interface BusyShip {
  shipId: ShipId;
  freeAt: number;
}

/**
 * Plan de vaisseau (chantier 13) : un châssis garni de modules, propre à un empire.
 * Les ids restent `string` ici (model/industry est la base, importée par `content/*`) ;
 * le typage fort (ChassisId/ModuleId) et la validation vivent dans `sim/design`.
 */
export interface Blueprint {
  id: string;
  /** Empire propriétaire du plan. */
  ownerId: string;
  name: string;
  chassisId: string;
  /** Un module par emplacement rempli (validé contre les slots + budgets du châssis). */
  modules: string[];
  createdAt: number;
}

/** Une instance de bâtiment en construction (pas de niveaux : on empile les instances). */
export interface BuildQueueItem {
  buildingId: BuildingId;
  /** Timestamps ms absolus — timers réels, résolus par le tick qui les dépasse. */
  startedAt: number;
  finishesAt: number;
}

export interface Colony {
  id: string;
  /** Empire propriétaire (chantier 7 ; optionnel pendant la transition mono→multi). */
  ownerId?: string;
  planetId: string;
  name: string;
  /** Stock au sol : ce que produisent et consomment les bâtiments. */
  resources: Record<ResourceId, number>;
  /**
   * Stock en orbite (chantier 12) : la seule soute que les vaisseaux savent charger.
   * Alimenté depuis le sol par le dock orbital, selon `liftRules`.
   */
  orbitalResources: Record<ResourceId, number>;
  /** Consignes d'ascension par ressource ; absente = ressource laissée au sol. */
  liftRules: Partial<Record<ResourceId, LiftRule>>;
  /** Nombre d'instances par type de bâtiment (0 = absent). */
  buildings: Partial<Record<BuildingId, number>>;
  queue: BuildQueueItem[];
  /** Nombre de colons (fractionnaire en interne, affiché arrondi). */
  population: number;
  /** 0–100, recalculée à chaque tick — stockée pour l'affichage. */
  satisfaction: number;
  /** Flotte civile possédée (total, occupés compris). */
  ships: Partial<Record<ShipId, number>>;
  /** Vaisseaux en convoi/mission, libérés à `freeAt`. */
  shipsBusy: BusyShip[];
  /** File de production du chantier naval. */
  shipQueue: ShipQueueItem[];
}

/** Avant-poste minier robotisé sur une ceinture d'astéroïdes. */
export interface MiningOutpost {
  id: string;
  beltId: string;
  /** Colonie qui l'a fondé : paie l'entretien. */
  ownerColonyId: string;
  /** Minerai extrait en attente d'évacuation. */
  oreStock: number;
}

/** État dynamique d'un comptoir : ses stocks (les prix en dérivent). */
export interface TradingPostMarket {
  tradingPostId: string;
  stocks: Record<ResourceId, number>;
}
