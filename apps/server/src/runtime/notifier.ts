import type { Empire } from "../empire.js";

/** Signal « l'état a changé » : chaque connexion recompose alors le snapshot de son empire. */
export type StateListener = () => void;

/**
 * Diffusion des changements d'état vers les connexions WebSocket ouvertes. Extrait de
 * `GameEngine` (chantier 19.6) : ce n'est qu'un hub d'observation, plus la règle
 * métier de réarmement des marqueurs de brouillard après chaque diffusion.
 */
export class Notifier {
  private listeners = new Set<StateListener>();

  constructor(private readonly empires: () => IterableIterator<Empire>) {}

  onChange(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(): void {
    // Signal seul : chaque connexion recompose le snapshot redacté de son empire
    // (7c-B). Le marqueur d'exploration se réarme par empire après diffusion.
    for (const listener of this.listeners) listener();
    for (const empire of this.empires()) {
      empire.explorationDirty = false;
      empire.universeDirty = false;
    }
  }
}
