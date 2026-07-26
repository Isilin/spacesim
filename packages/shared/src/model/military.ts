/** Flotte militaire du joueur : vaisseaux (content/warships) stationnés dans un système. */
export interface Fleet {
  id: string;
  /** Empire propriétaire (chantier 7 ; optionnel pendant la transition mono→multi). */
  ownerId?: string;
  name: string;
  /** Système où la flotte est stationnée (ou d'origine pendant un déplacement). */
  systemId: string;
  /** Colonie de rattachement (paie la production). */
  homeColonyId: string;
  ships: Partial<Record<string, number>>;
  /** Directive par phase de combat (long / medium / short). */
  directives: Record<string, string>;
  /** File de production de vaisseaux (au chantier naval du système). */
  queue: { warshipId: string; startedAt: number; finishesAt: number }[];
  /** Déplacement en cours vers un système, sinon null. */
  movement: { toSystemId: string; departedAt: number; arrivesAt: number } | null;
}

/**
 * Présence étrangère visible d'un empire, là où il a de la visibilité (chantier 7d) :
 * vue redactée d'une entité appartenant à un AUTRE empire, suffisante pour l'afficher
 * sur la carte et la cibler en PvP.
 */
export interface ForeignFleet {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerColor: string;
  name: string;
  systemId: string;
  ships: Partial<Record<string, number>>;
}

/** Repaire de pirates PNJ : menace un système, à nettoyer par une flotte. */
export interface PirateLair {
  id: string;
  systemId: string;
  ships: Partial<Record<string, number>>;
  directives: Record<string, string>;
  /** Butin en crédits libéré à la destruction. */
  bounty: number;
}

/** Rapport de bataille archivé (rejouable dans l'UI), le plus récent en tête. */
export interface StoredBattle {
  id: string;
  at: number;
  systemId: string;
  attackerName: string;
  defenderName: string;
  report: unknown;
}
