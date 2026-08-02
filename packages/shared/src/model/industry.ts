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
export const SHIP_IDS = [
  "cargo_small",
  "cargo_large",
  "hauler",
  "courier",
] as const;

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

/** Une zone en construction sur une station (voir Station.zoneQueue). */
export interface ZoneQueueItem {
  zoneTypeId: string;
  startedAt: number;
  finishesAt: number;
}

/** Une installation en construction sur une station (voir Station.installQueue). */
export interface InstallQueueItem {
  installationId: string;
  startedAt: number;
  finishesAt: number;
}

/**
 * Politique de marché d'une station (chantier 25) : palier minimal de relation
 * diplomatique requis pour qu'un empire tiers puisse y commercer, en permissivité
 * croissante. "war" bloque toujours, quel que soit le palier — "public" veut dire
 * « tout empire pas en guerre », pas « même les ennemis ».
 */
export const STATION_MARKET_ACCESS_IDS = [
  "closed",
  "alliance",
  "nap",
  "public",
] as const;
export type StationMarketAccess = (typeof STATION_MARKET_ACCESS_IDS)[number];

/**
 * Station orbitale (chantier 24) : structure possédée, distincte d'une colonie —
 * en orbite d'un corps précis, pas sur sa surface (un corps peut porter les deux).
 * `ownerId` est requis (pas de legacy pré-multi-empire, contrairement à `Colony.ownerId`) —
 * même choix que `Blueprint.ownerId`.
 *
 * Différences volontaires avec `Colony` :
 * - un seul stock `resources` (déjà en orbite, aucune notion d'ascenseur sol/orbite) ;
 * - pas de `population`/`satisfaction` : les vaisseaux sont déjà traités comme abstraits/
 *   équipage hors-champ dans ce jeu, et `MiningOutpost`/`Fleet`/`Blueprint` sont déjà des
 *   entités possédées sans population — Station rejoint cette catégorie, n'en invente pas
 *   une nouvelle ;
 * - `zones`/`installations` en compte par type (comme `Colony.buildings`), pas en liste
 *   (contrairement à `Blueprint.modules`) : une zone/installation s'accumule une à une via
 *   une file de construction, elle n'est pas un plan remplacé en bloc. Les ids de types de
 *   zone/installation restent `string` ici (model/industry est la base, importée par
 *   content/*) ; le typage fort (ZoneTypeId/InstallationId) et la validation vivent dans
 *   `sim/industry/station`.
 */
export interface Station {
  id: string;
  ownerId: string;
  bodyId: string;
  systemId: string;
  name: string;
  resources: Record<ResourceId, number>;
  /** Nombre de zones construites par type — chaque zone ajoute un emplacement de son type. */
  zones: Partial<Record<string, number>>;
  zoneQueue: ZoneQueueItem[];
  /** Nombre d'installations construites par type — plafonné par les zones de son type. */
  installations: Partial<Record<string, number>>;
  installQueue: InstallQueueItem[];
  /** Politique de marché (chantier 25) : défaut "closed" à la fondation — une station
   * neuve n'expose rien tant que le propriétaire ne l'ouvre pas explicitement. */
  marketAccess: StationMarketAccess;
  /** Taxe prélevée sur les échanges des visiteurs (hors propriétaire), 0–1. */
  marketTaxRate: number;
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
