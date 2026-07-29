import type { CombatCategory, CombatDirective, CombatPhase } from "@spacesim/shared";

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
  categoryAdvantage: Record<CombatCategory, Partial<Record<CombatCategory, number>>>;
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

/** Contenu chargé en mémoire (`GameRuntime.content`) — remplacé en bloc à chaque édition
 *  admin (édition en live, chantier 23 décision 3), jamais muté en place. */
export interface ContentBundle {
  warships: Record<string, ContentWarship>;
  combatTuning: ContentCombatTuning;
  factions: Record<string, ContentFaction>;
  buildings: Record<string, ContentBuilding>;
  ships: Record<string, ContentShip>;
}
