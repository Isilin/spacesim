import { TICK_MS } from "@spacesim/shared";

/** Ce que le scheduler doit pouvoir avancer — un sous-ensemble minimal de `GameEngine`. */
export interface TickHost {
  lastTickAt(): number;
  advance(ticks: number): void;
}

/**
 * Cycle de vie du process serveur : démarre/arrête l'intervalle de tick réel.
 * Extrait de `GameEngine` (chantier 19.6) — aucune logique de jeu, seulement la
 * cadence. Un seul `Scheduler` par moteur ; `start()` est idempotent.
 */
export class Scheduler {
  private interval: NodeJS.Timeout | null = null;

  constructor(private readonly host: TickHost) {}

  start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => {
      const missed = Math.floor((Date.now() - this.host.lastTickAt()) / TICK_MS);
      if (missed > 0) this.host.advance(missed);
    }, TICK_MS);
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }
}
