import type {
  Colony,
  Galaxy,
  Planet,
  StarSystem,
  ClientUniverse,
} from "@spacesim/shared";
import type { GameStoreState } from "./game-store.js";

// ── Résolution des objets de carte par identifiant. ──

export function findGalaxyById(
  universe: ClientUniverse,
  id: string,
): Galaxy | null {
  return universe.galaxies.find((g) => g.id === id) ?? null;
}

export function findSystemById(galaxy: Galaxy, id: string): StarSystem | null {
  return galaxy.systems.find((s) => s.id === id) ?? null;
}

export function findBodyById(system: StarSystem, id: string): Planet | null {
  return system.planets.find((p) => p.id === id) ?? null;
}

/** Chemin complet d'un objet de carte : de quelle galaxie, de quel système il relève. */
export interface UniversePath {
  galaxyId: string | null;
  systemId: string | null;
  bodyId: string | null;
}

/**
 * Index identifiant → chemin, pour tout ce que la carte sait viser (chantier 35.3).
 *
 * Les trois `findXById` ci-dessus sont des balayages linéaires, et le zoom continu ancre
 * la caméra par identifiant à chaque image. À 200 galaxies — le plafond du générateur —
 * cela ferait plusieurs milliers de comparaisons par image pour retrouver ce que l'URL
 * désigne déjà. L'index se construit une fois par identité d'`universe`, c'est-à-dire
 * seulement quand le serveur renvoie l'univers.
 */
export function buildUniverseIndex(
  universe: ClientUniverse,
): Map<string, UniversePath> {
  const index = new Map<string, UniversePath>();
  for (const galaxy of universe.galaxies) {
    index.set(galaxy.id, {
      galaxyId: galaxy.id,
      systemId: null,
      bodyId: null,
    });
    for (const system of galaxy.systems) {
      index.set(system.id, {
        galaxyId: galaxy.id,
        systemId: system.id,
        bodyId: null,
      });
      for (const planet of system.planets) {
        index.set(planet.id, {
          galaxyId: galaxy.id,
          systemId: system.id,
          bodyId: planet.id,
        });
      }
    }
  }
  return index;
}

// ── Sélecteurs de store (chantier 4.4) : dérivations consommées directement par les
// composants via useGameStore(select...), pour éviter de faire transiter ces valeurs
// par une chaîne de props depuis App.tsx. ──

/** Colonie active : celle de `?colony=`, sinon la première (comportement historique). */
export function selectActiveColony(colonyId: string | null) {
  return (state: GameStoreState): Colony | null =>
    state.colonies.find((c) => c.id === colonyId) ?? state.colonies[0] ?? null;
}

/** Un système est exploré s'il figure dans `exploredSystemIds`. */
export function selectExplored(systemId: string) {
  return (state: GameStoreState): boolean =>
    state.exploredSystemIds.includes(systemId);
}
