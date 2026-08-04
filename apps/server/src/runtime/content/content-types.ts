import {
  CHASSIS_KINDS,
  MILESTONE_METRICS,
  MODULE_ROLES,
  SHIP_DOMAINS,
  SLOT_TYPES,
  TECH_BRANCHES,
} from "@spacesim/protocol";
import type {
  CombatCategory,
  CombatDirective,
  CombatPhase,
  ModuleEffects,
  TechEffects,
} from "@spacesim/shared";

export type ChassisKind = (typeof CHASSIS_KINDS)[number];
export type ShipDomainKind = (typeof SHIP_DOMAINS)[number];
export type ModuleRole = (typeof MODULE_ROLES)[number];
export type SlotType = (typeof SLOT_TYPES)[number];
export type MilestoneMetric = (typeof MILESTONE_METRICS)[number];
export type TechBranch = (typeof TECH_BRANCHES)[number];

/** Forme exacte de `slotCountsSchema` (packages/protocol/src/content.ts, non exporté) —
 *  dupliquée ici plutôt qu'exportée depuis protocol pour ce seul usage de cast DB. */
export interface ChassisSlots {
  weapon: number;
  defense: number;
  propulsion: number;
  utility: number;
}

/**
 * Contenu de jeu chargé depuis la DB (chantier 23.5+) — un domaine à la fois, en
 * commençant par les vaisseaux de guerre. `id: string` (pas `WarshipId`) : la DB fait
 * autorité et un id peut être créé depuis l'admin (chantier 23, « conséquence assumée »
 * de la décision 1 — pas de tuple TypeScript fermé côté serveur pour du contenu DB-backed).
 */
export interface ContentWarship {
  id: string;
  nameFr: string;
  descriptionFr: string;
  hull: number;
  shield: number;
  weapons: Record<CombatPhase, number>;
  initiative: number;
  category: CombatCategory;
  cost: Record<string, number>;
  buildMs: number;
  /** null = aucune tech requise. */
  requiresTech: string | null;
  fleetDamageBonus: number | null;
}

export interface ContentCombatTuning {
  categoryAdvantage: Record<
    CombatCategory,
    Partial<Record<CombatCategory, number>>
  >;
  directives: Record<
    CombatDirective,
    { damageMult: number; incomingMult: number; shieldMult: number }
  >;
  directiveCounter: Record<CombatDirective, CombatDirective | null>;
  counterBonus: number;
}

/** Faction marchande PNJ (chantier 23.6). */
export interface ContentFaction {
  id: string;
  name: string;
  color: string;
  descriptionFr: string;
  produces: Record<string, number>;
  consumes: Record<string, number>;
}

/**
 * Bâtiment de colonie (chantier 23.7) — `id` reste un des 12 ids historiques pour cette
 * passe (`BuildingId` est tissé dans `Colony`/protocole, pas desserré ici) : seules les
 * valeurs sont éditables.
 */
export interface ContentBuilding {
  id: string;
  nameFr: string;
  descriptionFr: string;
  cost: Record<string, number>;
  buildMs: number;
  outputs: Record<string, number> | null;
  inputs: Record<string, number> | null;
  depositScaled: string | null;
  jobsPerInstance: number | null;
}

/**
 * Vaisseau civil historique (chantier 23.8) — `id: string` libre, même raison que
 * `ContentWarship` (`ShipId` est déjà `string` partout, aucun tuple à desserrer).
 */
export interface ContentShip {
  id: string;
  nameFr: string;
  descriptionFr: string;
  capacity: number;
  cost: Record<string, number>;
  buildMs: number;
  /** null = aucune tech requise. */
  requiresTech: string | null;
  speedMult: number;
  fuelPerJump: number;
}

/**
 * Scalaire d'équilibrage (chantier 23.8) — `key` est un des champs de `BalanceConstants`
 * (`packages/shared/src/balance.ts`), pas un id libre : voir `content_constants` dans
 * `db/schema.ts`.
 */
export interface ContentConstant {
  key: string;
  value: number;
  descriptionFr: string;
}

/**
 * Tech de l'arbre de recherche (chantier 23.9) — `id: string` libre (id-minting, même
 * raison que `ContentWarship`/`ContentShip`).
 */
export interface ContentTech {
  id: string;
  nameFr: string;
  descriptionFr: string;
  branch: TechBranch;
  cost: number;
  durationMs: number;
  requires: string[];
  effects: TechEffects;
}

/**
 * Châssis de vaisseau (chantier 23.10) — `id: string` libre (id-minting).
 * `sim/industry/design.ts` n'avait aucune injection avant ce chantier.
 */
export interface ContentChassis {
  id: string;
  nameFr: string;
  descriptionFr: string;
  kind: ChassisKind;
  domain: ShipDomainKind;
  hull: number;
  baseInitiative: number;
  power: number;
  tonnage: number;
  calc: number;
  slots: ChassisSlots;
  baseSpeedMult: number;
  baseFuelPerJump: number;
  /** null = pas de spécialisation de rôle. */
  roleBonus: Partial<Record<ModuleRole, number>> | null;
  cost: Record<string, number>;
  buildMs: number;
  /** null = aucune tech requise. */
  requiresTech: string | null;
}

/** Module de vaisseau (chantier 23.10) — `id: string` libre, même raison que `ContentChassis`. */
export interface ContentModule {
  id: string;
  nameFr: string;
  descriptionFr: string;
  slot: SlotType;
  role: ModuleRole;
  power: number;
  tonnage: number;
  calc: number;
  cost: Record<string, number>;
  buildMs: number;
  /** null = aucune tech requise. */
  requiresTech: string | null;
  effects: ModuleEffects;
}

/**
 * Plan pré-conçu (chantier 23.11) — `id: string` libre (id-minting), dépend de 23.10
 * (`chassisId`/`modules` résolus par les tables châssis/modules déjà injectables).
 * `starter` remplace `STARTER_PRESET_IDS`.
 */
export interface ContentPreset {
  id: string;
  nameFr: string;
  descriptionFr: string;
  chassisId: string;
  modules: string[];
  starter: boolean;
}

/**
 * Jalon sandbox (chantier 23.11) — `id: string` libre, mais `metric` reste un des 4
 * enums calculés côté client (voir `db/schema.ts`).
 */
export interface ContentMilestone {
  id: string;
  metric: MilestoneMetric;
  threshold: number;
}

/**
 * Type de zone de station orbitale (chantier 24) — `id: string` libre (id-minting),
 * même raison que `ContentChassis`/`ContentModule`.
 */
export interface ContentZoneType {
  id: string;
  nameFr: string;
  descriptionFr: string;
  cost: Record<string, number>;
  buildMs: number;
  /** null = aucune tech requise. */
  requiresTech: string | null;
}

/** Installation de station orbitale (chantier 24) — `id: string` libre, même raison
 *  que `ContentZoneType`. */
export interface ContentInstallation {
  id: string;
  nameFr: string;
  descriptionFr: string;
  zoneType: string;
  cost: Record<string, number>;
  buildMs: number;
  inputs: Record<string, number> | null;
  outputs: Record<string, number> | null;
  /** null = aucune tech requise. */
  requiresTech: string | null;
  /** null = aucune capacité de marché conférée (chantier 25). */
  grants: "resourceMarket" | "blueprintMarket" | null;
}

/** Contenu chargé en mémoire (`GameRuntime.content`) — remplacé en bloc à chaque édition
 *  admin (édition en live, chantier 23 décision 3), jamais muté en place. */
export interface ContentBundle {
  warships: Record<string, ContentWarship>;
  combatTuning: ContentCombatTuning;
  factions: Record<string, ContentFaction>;
  buildings: Record<string, ContentBuilding>;
  ships: Record<string, ContentShip>;
  constants: Record<string, ContentConstant>;
  techs: Record<string, ContentTech>;
  chassis: Record<string, ContentChassis>;
  modules: Record<string, ContentModule>;
  presets: Record<string, ContentPreset>;
  milestones: Record<string, ContentMilestone>;
  zoneTypes: Record<string, ContentZoneType>;
  installations: Record<string, ContentInstallation>;
}
