export const RELATION_STATES = ["neutral", "nap", "alliance", "war"] as const;

export type RelationState = (typeof RELATION_STATES)[number];

/**
 * Relation entre deux empires (chantier 16). Paire canonique (`empireA` < `empireB`,
 * voir `relationKey`) : une seule ligne décrit une relation symétrique. `until` est un
 * cooldown (ex. guerre interdite peu après une paix), pas une durée de pacte — NAP et
 * alliance restent en vigueur tant qu'aucune des parties ne les rompt.
 */
export interface Relation {
  empireA: string;
  empireB: string;
  state: RelationState;
  since: number;
  until: number | null;
}

/** Clé canonique d'une paire d'empires — ordre stable, indépendant de qui appelle. */
export function relationKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Après une paix, délai avant de pouvoir redéclarer la guerre au même empire. */
export const WAR_COOLDOWN_MS = 600_000;

/**
 * Une alliance ne se rompt pas en déclarant directement la guerre — il faut d'abord la
 * rompre (retour à neutre), sinon une alliance ne protégerait de rien.
 */
export function declareWarReason(current: RelationState, now: number, cooldownUntil: number | null): string | null {
  if (current === "war") return "Déjà en guerre";
  if (current === "alliance") return "Rompez l'alliance avant de déclarer la guerre";
  if (cooldownUntil !== null && now < cooldownUntil) return "Cooldown de guerre en cours";
  return null;
}

export function makePeaceReason(current: RelationState): string | null {
  if (current !== "war") return "Pas en guerre";
  return null;
}

/** Un pacte (NAP ou alliance) ne se propose pas en pleine guerre, ni s'il existe déjà. */
export function proposeRelationReason(current: RelationState, proposed: "nap" | "alliance"): string | null {
  if (current === "war") return "En guerre — faites la paix d'abord";
  if (current === proposed) return proposed === "nap" ? "Déjà en pacte de non-agression" : "Déjà alliés";
  if (current === "alliance" && proposed === "nap") return "Rompez l'alliance avant de repasser au pacte";
  return null;
}

export function breakRelationReason(current: RelationState): string | null {
  if (current !== "nap" && current !== "alliance") return "Aucun pacte à rompre";
  return null;
}
