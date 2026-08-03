import {
  FRONTIER_GALAXIES,
  MAX_EMPIRES_PER_GALAXY,
  MAX_GALAXIES,
} from "../../constants.js";

/** Occupation d'une galaxie, du point de vue de l'expansion de l'univers. */
export interface GalaxyOccupancy {
  index: number;
  /** Nombre de colonies, tous empires confondus. */
  colonies: number;
  /** Nombre d'empires distincts y possédant au moins une colonie. */
  empires: number;
  /** Planètes colonisables encore libres (hors gazeuses). */
  freeHabitable: number;
}

export interface FrontierConfig {
  /** Galaxies vierges de toute colonie à maintenir au-delà du front de peuplement. */
  frontier: number;
  /** Plafond de sécurité sur la taille totale de l'univers. */
  maxGalaxies: number;
}

export const DEFAULT_FRONTIER: FrontierConfig = {
  frontier: FRONTIER_GALAXIES,
  maxGalaxies: MAX_GALAXIES,
};

/**
 * Combien de galaxies ouvrir pour maintenir la frontière glissante.
 *
 * Invariant : il doit toujours rester `frontier` galaxies sans la moindre colonie —
 * de la place à explorer devant soi, quel que soit le nombre de joueurs. Coloniser
 * la dernière galaxie vierge pousse donc mécaniquement le bord de l'univers.
 */
export function galaxiesToAdd(
  occupancy: readonly GalaxyOccupancy[],
  config: FrontierConfig = DEFAULT_FRONTIER,
): number {
  const empty = occupancy.filter((g) => g.colonies === 0).length;
  const missing = Math.max(0, config.frontier - empty);
  const room = Math.max(0, config.maxGalaxies - occupancy.length);
  return Math.min(missing, room);
}

/**
 * Galaxie d'accueil d'un nouvel empire : la plus proche du centre qui a encore de la
 * place, en préférant celles déjà peuplées. Les joueurs naissent ainsi voisins —
 * commerce, frontières et PvP dès le départ — plutôt qu'isolés chacun dans son coin.
 * `null` = aucune galaxie disponible, l'appelant doit étendre l'univers.
 */
export function pickStarterGalaxy(
  occupancy: readonly GalaxyOccupancy[],
  maxEmpires = MAX_EMPIRES_PER_GALAXY,
): number | null {
  const eligible = occupancy.filter(
    (g) => g.empires < maxEmpires && g.freeHabitable > 0,
  );
  if (eligible.length === 0) return null;
  const populated = eligible.filter((g) => g.empires > 0);
  const pool = populated.length > 0 ? populated : eligible;
  return pool.reduce((best, g) => (g.index < best.index ? g : best)).index;
}
