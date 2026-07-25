import type { ProposalKind, RelationState } from "../types.js";

/** Clé canonique d'une paire d'empires — ordre stable, indépendant de qui appelle. */
export function relationKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Après une paix, délai avant de pouvoir redéclarer la guerre au même empire. */
export const WAR_COOLDOWN_MS = 600_000;

/** Déclarer la guerre coûte de l'influence — plus question qu'elle soit gratuite. */
export const DECLARE_WAR_INFLUENCE_COST = 50;

/**
 * Une alliance ne se rompt pas en déclarant directement la guerre — il faut d'abord la
 * rompre (retour à neutre), sinon une alliance ne protégerait de rien.
 */
export function declareWarReason(
  current: RelationState,
  now: number,
  cooldownUntil: number | null,
): string | null {
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
export function proposeRelationReason(
  current: RelationState,
  proposed: ProposalKind,
): string | null {
  if (current === "war") return "En guerre — faites la paix d'abord";
  if (current === proposed)
    return proposed === "nap" ? "Déjà en pacte de non-agression" : "Déjà alliés";
  if (current === "alliance" && proposed === "nap")
    return "Rompez l'alliance avant de repasser au pacte";
  return null;
}

export function breakRelationReason(current: RelationState): string | null {
  if (current !== "nap" && current !== "alliance") return "Aucun pacte à rompre";
  return null;
}

/** Bornes du ratio de puissance de flotte acceptable pour qu'un PNJ accepte une alliance. */
export const NPC_ALLIANCE_MIN_POWER_RATIO = 0.2;
export const NPC_ALLIANCE_MAX_POWER_RATIO = 5;

/**
 * Un PNJ accepte-t-il une proposition ? Pur — la force relative (déjà calculée par
 * l'appelant, `sim/combat.ts` `fleetPower`) est le seul critère : un NAP est toujours
 * bienvenu (aucun engagement fort), une alliance seulement entre partenaires de force
 * comparable — ni un poids plume qui n'apporte rien, ni un colosse qui engloutirait le PNJ.
 */
export function npcAcceptsProposal(
  kind: ProposalKind,
  npcPower: number,
  proposerPower: number,
): boolean {
  if (kind === "nap") return true;
  if (npcPower <= 0 || proposerPower <= 0) return true;
  const ratio = proposerPower / npcPower;
  return ratio >= NPC_ALLIANCE_MIN_POWER_RATIO && ratio <= NPC_ALLIANCE_MAX_POWER_RATIO;
}
