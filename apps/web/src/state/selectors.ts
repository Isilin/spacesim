import type { Galaxy, Planet, StarSystem, Universe } from "@spacesim/shared";

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
