import {
  bodyEnvironment,
  bodyStructure,
} from "../../content/astro/body-defs.js";
import type { Atmosphere, CentralBody, Planet } from "../../model/universe.js";
import { createRng, type Rng } from "../../rng.js";
import { orbitalPeriodTicks, type SpinElements } from "./geometry.js";
import {
  atmosphereRetention,
  auAt,
  equilibriumTempK,
  escapeVelocity,
  flareErosion,
  greenhouseK,
  irradianceAt,
  lightingFor,
  lockedToPlanet,
  lockedToStar,
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
 * Ce qui n'appartient pas à la chaîne : la rotation propre, la période de révolution, et la
 * mise en forme. Le reste n'est plus qu'un appel à `physics.ts` — et la révolution, depuis le
 * chantier 50.2, un appel à `geometry.ts`.
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
  /**
   * Rotation propre : axe, période, phase (chantier 50.2). `spin.periodTicks` EST la durée du
   * jour — aucun autre champ ne la dit, donc aucun ne peut la contredire.
   */
  spin: SpinElements;
  /**
   * Période de révolution autour du corps parent, en ticks : celle-là même que l'écran montre,
   * lue dans `geometry.ts`. La fiche en calculait une seconde, avec sa propre loi de Kepler.
   */
  orbitPeriodTicks: number;
  /** Le corps montre-t-il toujours la même face à ce qu'il orbite ? (chantier 50.3) */
  tidallyLocked: boolean;
}

/** Rayon terrestre, en kilomètres — le pont entre les unités de la chaîne et la fiche. */
const EARTH_RADIUS_KM = 6371;

/** Seuils de rétention : ce qu'un corps garde de ce qu'il dégaze. */
const RETENTION_NONE = 0.15;
const RETENTION_TRACE = 0.4;
const RETENTION_THIN = 0.8;

/**
 * Période de rotation propre d'un corps libre, en ticks — 2 à 20 minutes de temps réel
 * (chantier 50.2).
 *
 * Le spin ne décide de rien : c'est le seul mouvement du jeu qu'on puisse régler pour l'œil.
 * Les orbites restent réglées pour la stratégie (chantier 31.9), et la plus rapide du jeu —
 * une lune interne, 1 440 ticks — reste six fois plus longue que le jour le plus long ; une
 * planète, 3 600 ticks au plus vite, quinze fois. Le jour redevient plus court que l'année, ce
 * qu'il n'était plus : l'ancien tirage donnait 8 à 90 h contre des révolutions de 2 à 51 h.
 */
export const SPIN_PERIOD_TICKS = [24, 240] as const;

/**
 * Obliquité d'un corps libre, en radians : 0 à 29°, l'ordre de la Terre, de Mars ou de
 * Saturne. Un corps verrouillé n'en a pas — les marées qui ont figé sa rotation ont aussi
 * redressé son axe.
 */
const AXIAL_TILT = [0, 0.5] as const;

/** Part des corps libres qui tournent à contresens de leur orbite, comme Vénus. */
const RETROGRADE_SHARE = 0.1;

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
  // `bodyStructure` choisit la table selon `kind` : une lune se lit dans les catalogues de
  // lunes, dont les rayons sont déjà des rayons de lune (0,02 à 0,46 rayon terrestre).
  //
  // Le facteur 0,28 qui vivait ici disparaît avec eux, et avec lui un désaccord silencieux :
  // le générateur calculait l'habitabilité d'une lune sur le rayon PLEIN de sa classe
  // planétaire quand cette fiche en affichait 28 %. Les deux lisent maintenant la même table.
  const cls = bodyStructure(planet);
  const env = bodyEnvironment(planet);

  const radiusEarth = range(rng, cls.radiusRange);
  const density = range(rng, cls.densityRange);
  const gravityG = surfaceGravity(radiusEarth, density);
  const escapeKms = escapeVelocity(radiusEarth, density);

  const orbitRadius = isMoon
    ? (parentOrbitRadius ?? planet.orbitRadius)
    : planet.orbitRadius;
  // En binaire large, seule l'étoile hôte chauffe : compter la compagne lointaine
  // déplacerait la zone habitable et rendrait la fiche fausse.
  const lighting = lightingFor(stars, planet.hostStarId, orbitRadius);
  const irradiance = irradianceAt(lighting, auAt(lighting, orbitRadius));
  const equilibrium = equilibriumTempK(irradiance, env.albedo);

  const retention =
    atmosphereRetention(escapeKms, equilibrium) *
    (1 - (1 - flareErosion(lighting)) * (1 - cls.magnetosphere));
  const atmosphere = retainedAtmosphere(env.atmosphere, retention);
  const pressureBar =
    atmosphere === "none"
      ? 0
      : env.outgassingBar * Math.min(1.5, Math.max(0, retention));
  const meanTempC = surfaceTempC(
    equilibrium,
    greenhouseK(pressureBar, env.greenhousePerBar),
  );

  // Une seule loi de Kepler : la révolution est celle que l'écran montre (chantier 50.2).
  const orbitPeriodTicks = orbitalPeriodTicks(planet);
  // Deux verrouillages, deux seuils (chantier 50.3) : une lune se verrouille sur sa planète,
  // une planète sur l'étoile qui l'éclaire.
  const tidallyLocked = isMoon
    ? lockedToPlanet(planet.orbitRadius)
    : lockedToStar(lighting, orbitRadius);

  // Le jour se tire à la place qu'occupait l'ancien, les tirages nouveaux viennent après : le
  // rayon et la densité d'un corps restent ceux d'avant le chantier. Un corps verrouillé tire
  // comme les autres et ignore le résultat — sans quoi retoucher un seuil décalerait l'axe de
  // tous les corps qu'il fait basculer.
  const freeDay = range(rng, SPIN_PERIOD_TICKS);
  const tilt = range(rng, AXIAL_TILT);
  const axisNode = rng() * Math.PI * 2;
  const phase = rng() * Math.PI * 2;
  const retrograde = rng() < RETROGRADE_SHARE;
  const spin: SpinElements = tidallyLocked
    ? {
        // Un jour égal à l'année, un axe droit, et la phase de l'orbite : c'est ce qui garde
        // la même face tournée vers ce que le corps orbite.
        axialTilt: 0,
        axisNode: 0,
        periodTicks: orbitPeriodTicks,
        spinAngle: planet.orbitAngle,
        retrograde: false,
      }
    : {
        axialTilt: tilt,
        axisNode,
        periodTicks: freeDay,
        spinAngle: phase,
        retrograde,
      };

  return {
    radiusKm: Math.round(radiusEarth * EARTH_RADIUS_KM),
    gravityG: Math.round(gravityG * 100) / 100,
    escapeVelocityKms: Math.round(escapeKms * 100) / 100,
    meanTempC: Math.round(meanTempC),
    equilibriumTempC: Math.round(equilibrium - 273.15),
    atmosphere,
    pressureBar: Math.round(pressureBar * 1000) / 1000,
    irradiance: Math.round(irradiance * 1000) / 1000,
    spin,
    orbitPeriodTicks,
    tidallyLocked,
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
