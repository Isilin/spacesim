import { planetType } from "../../content/astro/planet-types.js";
import type { Atmosphere, CentralBody, Planet } from "../../model/universe.js";
import { createRng, type Rng } from "../../rng.js";
import {
  atmosphereRetention,
  auAt,
  equilibriumTempK,
  escapeVelocity,
  flareErosion,
  greenhouseK,
  irradianceAt,
  surfaceGravity,
  surfaceTempC,
} from "./physics.js";

/**
 * Fiche physique d'un corps (chantier 10, réécrite au chantier 45.2).
 *
 * ## Les trois béquilles qui ont disparu
 *
 * Ce module portait trois correctifs, documentés comme tels et tous nés du même défaut —
 * l'habitabilité était tirée INDÉPENDAMMENT de la physique, et il fallait ensuite les
 * réconcilier :
 *
 * 1. `BASE_TEMP[type]` donnait la température, et la distance à l'étoile ne l'écartait que de
 *    ±45 °C, « à dessein : le type du corps doit rester lisible ». Une glacée en orbite
 *    serrée restait donc glaciale.
 * 2. `temperatePull` tirait la fiche vers 15 °C quand l'habitabilité était haute, « pour que
 *    la fiche corrobore la donnée de jeu, pas la contredise ».
 * 3. `pickAtmosphere` pondérait l'atmosphère par l'habitabilité, pour la même raison.
 *
 * L'habitabilité tombant désormais de la physique (`physics.ts`), il n'y a plus rien à
 * réconcilier : la fiche et la donnée de jeu viennent de la même source. Les trois sont
 * supprimées, pas adaptées.
 *
 * ## Ce qui reste ici
 *
 * Ce qui n'appartient pas à la chaîne : la durée du jour, la période de révolution, et la
 * mise en forme. Le reste n'est plus qu'un appel à `physics.ts`.
 *
 * Toujours **dérivée de l'id du corps**, donc identique côté client et côté serveur, et
 * recalculable sans toucher au générateur (ADR 0002).
 */
export interface BodyPhysicals {
  radiusKm: number;
  /** Gravité de surface en g (1 = Terre). */
  gravityG: number;
  /** Vitesse de libération, en km/s — ce qui décide de l'atmosphère retenue. */
  escapeVelocityKms: number;
  /** Température moyenne de surface, en °C : équilibre radiatif + effet de serre. */
  meanTempC: number;
  /** Température d'équilibre, avant toute atmosphère — utile pour lire la serre. */
  equilibriumTempC: number;
  atmosphere: Atmosphere;
  /** Pression au sol, en bars. Zéro quand le corps ne retient rien. */
  pressureBar: number;
  /** Flux stellaire reçu, en constantes solaires (la Terre en reçoit 1). */
  irradiance: number;
  /** Durée de rotation, en heures. */
  dayLengthHours: number;
  /** Période de révolution autour du corps parent, en jours. */
  orbitPeriodDays: number;
}

/** Rayon terrestre, en kilomètres — le pont entre les unités de la chaîne et la fiche. */
const EARTH_RADIUS_KM = 6371;

/**
 * Facteur d'échelle d'une lune : un satellite est un corps réduit.
 *
 * Appliqué au RAYON, donc répercuté sur la gravité et la vitesse de libération par la
 * chaîne elle-même — c'est ce qui fait qu'une lune retient bien moins qu'une planète de même
 * nature, sans qu'aucune table ne l'énonce.
 */
const MOON_SCALE = 0.28;

/** Seuils de rétention : ce qu'un corps garde de ce qu'il dégaze. */
const RETENTION_NONE = 0.15;
const RETENTION_TRACE = 0.4;
const RETENTION_THIN = 0.8;

function range(rng: Rng, [min, max]: readonly [number, number]): number {
  return min + rng() * (max - min);
}

/**
 * Ce qui survit de l'atmosphère proposée par le type, une fois la rétention appliquée.
 *
 * Le type dit ce que le corps **tenterait** de tenir ; la physique dit ce qu'il en garde. Un
 * monde volcanique dégaze une atmosphère toxique, mais s'il est trop léger et trop chaud il
 * reste nu — c'est le couplage qu'aucune table par type ne pouvait exprimer, et c'est lui qui
 * fait qu'une lune et une super-Terre de même nature ne se ressemblent pas.
 */
function retainedAtmosphere(
  proposed: Atmosphere,
  retention: number,
): Atmosphere {
  if (proposed === "none" || retention < RETENTION_NONE) return "none";
  if (retention < RETENTION_TRACE) return "trace";
  if (retention < RETENTION_THIN) {
    // Une atmosphère qui fuit perd d'abord ce qu'elle a de plus léger : il en reste un
    // voile, quelle que soit la composition qu'elle visait.
    return proposed === "breathable" ? "thin" : proposed;
  }
  return proposed;
}

/**
 * Caractéristiques physiques d'une planète ou d'une lune. Déterministe : même corps, même
 * fiche, sans état ni cache.
 *
 * `stars` porte les corps centraux du système : c'est d'eux que viennent l'irradiance et donc
 * la température. Un système sans étoile — un errant — rend une fiche glacée, ce qui est la
 * bonne réponse. Une lune hérite de la distance orbitale de sa planète, transmise par
 * `parentOrbitRadius` : c'est celle-là qui la chauffe, pas son orbite propre.
 */
export function bodyPhysicals(
  planet: Planet,
  stars: readonly CentralBody[] = [],
  parentOrbitRadius?: number,
): BodyPhysicals {
  const rng = createRng(`body:${planet.id}`);
  const isMoon = planet.kind === "moon";
  const def = planetType(planet.type);

  const scale = isMoon ? MOON_SCALE : 1;
  const radiusEarth = range(rng, def.radiusRange) * scale;
  const density = range(rng, def.densityRange);
  const gravityG = surfaceGravity(radiusEarth, density);
  const escapeKms = escapeVelocity(radiusEarth, density);

  const orbitRadius = isMoon
    ? (parentOrbitRadius ?? planet.orbitRadius)
    : planet.orbitRadius;
  const irradiance = irradianceAt(stars, auAt(stars, orbitRadius));
  const equilibrium = equilibriumTempK(irradiance, def.albedo);

  const retention =
    atmosphereRetention(escapeKms, equilibrium) * flareErosion(stars);
  const atmosphere = retainedAtmosphere(def.atmosphere, retention);
  const pressureBar =
    atmosphere === "none"
      ? 0
      : def.outgassingBar * Math.min(1.5, Math.max(0, retention));
  const meanTempC = surfaceTempC(
    equilibrium,
    greenhouseK(pressureBar, def.greenhousePerBar),
  );

  return {
    radiusKm: Math.round(radiusEarth * EARTH_RADIUS_KM),
    gravityG: Math.round(gravityG * 100) / 100,
    escapeVelocityKms: Math.round(escapeKms * 100) / 100,
    meanTempC: Math.round(meanTempC),
    equilibriumTempC: Math.round(equilibrium - 273.15),
    atmosphere,
    pressureBar: Math.round(pressureBar * 1000) / 1000,
    irradiance: Math.round(irradiance * 1000) / 1000,
    dayLengthHours:
      Math.round(range(rng, isMoon ? [40, 700] : [8, 90]) * 10) / 10,
    // Période orbitale : loi de Kepler (T ∝ r^1.5) autour du corps parent.
    orbitPeriodDays:
      Math.round(
        ((planet.orbitRadius / (isMoon ? 4 : 40)) ** 1.5 +
          range(rng, [0.2, 2])) *
          10,
      ) / 10,
  };
}

/** Le corps est-il vivable sans combinaison ? (habillage : croisé avec l'habitabilité) */
export function isBreathable(physicals: BodyPhysicals): boolean {
  return (
    physicals.atmosphere === "breathable" &&
    physicals.meanTempC > -20 &&
    physicals.meanTempC < 55
  );
}
