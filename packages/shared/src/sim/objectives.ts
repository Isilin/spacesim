import type { Rng } from "../rng.js";
import type { Objective, ObjectiveKind } from "../types.js";

export const OBJECTIVE_KINDS: readonly ObjectiveKind[] = [
  "colonize_n_systems",
  "hold_system",
  "lead_population",
  "lead_influence",
];

/** Fenêtre d'un objectif éphémère : assez courte pour rester un but de session, pas une corvée. */
export const OBJECTIVE_DURATION_MS = 3_600_000;

/** Récompense en crédits versée à la validation. */
export const OBJECTIVE_REWARD_CREDITS = 200;

/** Un seul objectif éphémère actif à la fois par empire — lisible, pas une liste de courses. */
export const MAX_OPEN_OBJECTIVES_PER_EMPIRE = 1;

export type ObjectiveSpec = Omit<Objective, "id" | "empireId" | "status">;

/**
 * Tire un nouvel objectif éphémère pour un empire, selon son état courant. Pur et
 * déterministe pour un rng donné (dérivé du tick côté serveur, comme les repaires
 * pirates et les humeurs de faction). `hold_system` n'est tiré que si l'empire a déjà
 * une revendication à défendre, sinon le but serait vide de sens.
 */
export function generateObjectiveSpec(
  rng: Rng,
  now: number,
  colonyCount: number,
  claimedSystemIds: readonly string[],
): ObjectiveSpec {
  const eligible = OBJECTIVE_KINDS.filter((k) => k !== "hold_system" || claimedSystemIds.length > 0);
  const kind = eligible[Math.floor(rng() * eligible.length)]!;
  const spec: ObjectiveSpec = {
    kind,
    reward: OBJECTIVE_REWARD_CREDITS,
    createdAt: now,
    deadline: now + OBJECTIVE_DURATION_MS,
  };
  if (kind === "colonize_n_systems") {
    spec.targetCount = colonyCount + 1 + Math.floor(rng() * 2); // +1 ou +2 colonies de plus qu'aujourd'hui
  }
  if (kind === "hold_system") {
    spec.targetSystemId = claimedSystemIds[Math.floor(rng() * claimedSystemIds.length)];
  }
  return spec;
}

/** État courant de l'empire nécessaire pour évaluer si un objectif est rempli. */
export interface ObjectiveProgress {
  colonyCount: number;
  claimedSystemIds: readonly string[];
  leadsPopulation: boolean;
  leadsInfluence: boolean;
}

/**
 * Un objectif est-il rempli ? Pur — l'appelant calcule `progress` depuis l'état du
 * moteur (nombre de colonies, revendications, classements population/influence).
 */
export function objectiveMet(
  spec: Pick<Objective, "kind" | "targetCount" | "targetSystemId">,
  progress: ObjectiveProgress,
): boolean {
  switch (spec.kind) {
    case "colonize_n_systems":
      return progress.colonyCount >= (spec.targetCount ?? Infinity);
    case "hold_system":
      return spec.targetSystemId !== undefined && progress.claimedSystemIds.includes(spec.targetSystemId);
    case "lead_population":
      return progress.leadsPopulation;
    case "lead_influence":
      return progress.leadsInfluence;
    default:
      return false;
  }
}
