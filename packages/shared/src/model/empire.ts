import type { RelationState } from "./social.js";

export interface ActiveResearch {
  techId: string;
  startedAt: number;
  finishesAt: number;
}

/**
 * Empire (joueur) partageant l'univers d'une partie (chantier 7 — multi territorial).
 * En solo, un unique Player possède toutes les entités.
 */
export interface Player {
  id: string;
  name: string;
  /** Couleur d'affichage du territoire sur la carte. */
  color: string;
  joinedAt: number;
}

export interface GameState {
  id: string;
  seed: string;
  tick: number;
  /** Timestamp ms du dernier tick appliqué. */
  lastTickAt: number;
  /** Ids des techs acquises (voir content/techs). */
  researched: string[];
  /** Recherche en cours (une seule à la fois), timer réel. */
  research: ActiveResearch | null;
  /** Chaîne de techs planifiée, lancée l'une après l'autre (chantier 11). */
  researchQueue: string[];
  /** Influence de l'empire (générée par la population satisfaite + monuments). */
  influence: number;
  /** Réputation par faction (gagnée en commerçant). */
  factionRep: Record<string, number>;
  /** Systèmes revendiqués (bonus locaux, entretien en influence). */
  claimedSystemIds: string[];
}

/** Ligne de classement d'un empire (données publiques agrégées — chantier 7e). */
export interface LeaderboardEntry {
  id: string;
  name: string;
  color: string;
  colonies: number;
  population: number;
  claimed: number;
  influence: number;
  /** Score composite servant au tri du classement. */
  score: number;
  /** Relation de l'empire qui reçoit ce classement envers celui-ci (chantier 16). */
  relation: RelationState;
  /**
   * Empire piloté par un joueur ou par le jeu (chantier 32.11). Information déjà
   * publique — un empire PNJ publie des contrats sous une bannière de faction — et
   * nécessaire au client pour ne pas proposer d'inviter un PNJ dans une corporation,
   * geste que le serveur refuse (ADR 0009).
   */
  kind: "human" | "npc";
  /**
   * Corporation de cet empire, si elle existe (chantier 32.11). Nom et sigle seulement :
   * ils sont publics comme un nom d'empire, alors que le coffre et le détail des rôles
   * ne partent qu'aux membres (ADR 0009). C'est ce qui rend une corporation lisible par
   * des tiers — sans quoi elle n'existerait que pour les siens.
   */
  corporationName?: string;
  corporationTag?: string;
}

/** Système revendiqué visible d'un empire, avec la couleur du propriétaire (chantier 7e). */
export interface Territory {
  systemId: string;
  ownerId: string;
  ownerColor: string;
}
