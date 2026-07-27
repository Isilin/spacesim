import type { Colony, Galaxy, Planet, StarSystem, Universe } from "@spacesim/shared";
import type { GameStoreState } from "./game-store.js";

// ── Résolution des niveaux de carte (route-couplée : consommée par useMapLevel). ──

export function findGalaxyById(universe: Universe, id: string): Galaxy | null {
  return universe.galaxies.find((g) => g.id === id) ?? null;
}

export function findSystemById(galaxy: Galaxy, id: string): StarSystem | null {
  return galaxy.systems.find((s) => s.id === id) ?? null;
}

export function findBodyById(system: StarSystem, id: string): Planet | null {
  return system.planets.find((p) => p.id === id) ?? null;
}

// ── Sélecteurs de store (chantier 4.4) : dérivations consommées directement par les
// composants via useGameStore(select...), pour éviter de faire transiter ces valeurs
// par une chaîne de props depuis App.tsx. ──

/** Colonie active : celle de `?colony=`, sinon la première (comportement historique). */
export function selectActiveColony(colonyId: string | null) {
  return (state: GameStoreState): Colony | null =>
    state.colonies.find((c) => c.id === colonyId) ?? state.colonies[0] ?? null;
}
