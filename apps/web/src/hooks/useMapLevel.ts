import type { Galaxy, Planet, StarSystem, Universe } from "@spacesim/shared";
import { useParams } from "react-router-dom";
import { findBodyById, findGalaxyById, findSystemById } from "../state/selectors.js";

export interface MapLevel {
  level: "universe" | "galaxy" | "system" | "body";
  galaxy: Galaxy | null;
  system: StarSystem | null;
  body: Planet | null;
}

/**
 * Résout le niveau de carte courant (chantier 9.4) depuis les paramètres de route
 * (`/map/galaxy/:galaxyId/system/:systemId/body/:bodyId`) plutôt que d'un historique
 * maison — la hiérarchie univers→galaxie→système→corps est portée par l'URL elle-même.
 */
export function useMapLevel(universe: Universe): MapLevel {
  const { galaxyId, systemId, bodyId } = useParams();
  const galaxy = galaxyId ? findGalaxyById(universe, galaxyId) : null;
  const system = galaxy && systemId ? findSystemById(galaxy, systemId) : null;
  const body = system && bodyId ? findBodyById(system, bodyId) : null;
  const level = body ? "body" : system ? "system" : galaxy ? "galaxy" : "universe";
  return { level, galaxy, system, body };
}
