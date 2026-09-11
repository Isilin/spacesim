import { primaryOf, starsOf, type StarSystem } from "../../model/universe.js";
import { createRng, randInt } from "../../rng.js";
import type { EccentricElements } from "./geometry.js";
import { orbitsBarycenter } from "./physics.js";

/**
 * Géocroiseurs (chantier 50.8) : de petits corps dont l'orbite excentrique coupe celle d'une
 * planète — plus près de l'étoile qu'elle à leur périastre, plus loin à leur apoastre.
 *
 * Dérivés de l'identifiant du système et jamais persistés, comme `bodyPhysicals` : ni colonne,
 * ni octet sur le fil, ni version de générateur. Aucune mécanique ne les lit — ni minage, ni
 * impact, ni interception : ils existent pour être vus.
 *
 * Seules les orbites autour de l'origine sont coupées. Un monde qui tourne autour de la
 * compagne d'une binaire large est à des centaines d'unités du barycentre qu'un géocroiseur
 * entoure : les deux orbites ne se croisent pas, et prétendre le contraire serait faux.
 */
export interface Crosser extends EccentricElements {
  id: string;
  systemId: string;
  /** La planète dont il coupe l'orbite. */
  crossesId: string;
}

/** Au plus deux par système : au-delà, ils cesseraient d'être une rencontre. */
const MAX_CROSSERS = 2;

export function crossersOf(system: StarSystem): Crosser[] {
  const stars = starsOf(system);
  const anchor = primaryOf(system)?.id;
  const targets = system.planets.filter(
    (p) =>
      p.kind === "planet" &&
      (!p.hostStarId ||
        p.hostStarId === anchor ||
        orbitsBarycenter(stars, p.orbitRadius)),
  );
  if (targets.length === 0) return [];

  const rng = createRng(`crossers:${system.id}`);
  const count = randInt(rng, 0, MAX_CROSSERS);
  const crossers: Crosser[] = [];
  for (let i = 1; i <= count; i++) {
    const target = targets[randInt(rng, 0, targets.length - 1)]!;
    // Périastre en deçà de l'orbite visée, apoastre au-delà : l'ellipse la coupe deux fois.
    // Les deux bornes tiennent l'excentricité entre 0,15 et 0,4.
    const periapsis = target.orbitRadius * (0.6 + rng() * 0.25);
    const apoapsis = target.orbitRadius * (1.15 + rng() * 0.25);
    crossers.push({
      id: `${system.id}-x${i}`,
      systemId: system.id,
      crossesId: target.id,
      orbitRadius: (periapsis + apoapsis) / 2,
      eccentricity: (apoapsis - periapsis) / (apoapsis + periapsis),
      orbitAngle: rng() * Math.PI * 2,
      meanAnomaly: rng() * Math.PI * 2,
      inclination: (rng() - 0.5) * 0.4,
      ascendingNode: rng() * Math.PI * 2,
    });
  }
  return crossers;
}
