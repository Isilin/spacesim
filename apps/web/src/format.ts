import { allSystems, type Universe } from "@spacesim/shared";

/**
 * Durée lisible pour un compte à rebours : `12s`, `3m05s`, `1h04`. Les timers font foi
 * côté serveur ; l'affichage se contente de l'écoulement local.
 *
 * Remplace les copies `formatEta` / `formatDuration` qui vivaient dans presque chaque
 * vue — même logique, la variante avec heures étant un sur-ensemble de celle sans.
 */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  if (m >= 60) return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
  if (m > 0) return `${m}m${String(s % 60).padStart(2, "0")}s`;
  return `${s}s`;
}

/** Système contenant un corps donné (utilitaire d'affichage partagé). */
export function systemIdOf(universe: Universe, planetId: string): string | undefined {
  return allSystems(universe).find((s) => s.planets.some((p) => p.id === planetId))?.id;
}
