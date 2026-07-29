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

/** Contenu chargé en mémoire (`GameRuntime.content`) — remplacé en bloc à chaque édition
 *  admin (édition en live, chantier 23 décision 3), jamais muté en place. */
export interface ContentBundle {
  warships: Record<string, ContentWarship>;
  combatTuning: ContentCombatTuning;
}
