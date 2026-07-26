import { createRng, type Rng } from "../rng.js";
import type { Planet, PlanetType } from "../model/universe.js";

/** Type d'atmosphère, du vide au voile écrasant. */
export const ATMOSPHERES = ["none", "thin", "breathable", "toxic", "dense"] as const;

export type Atmosphere = (typeof ATMOSPHERES)[number];

/**
 * Fiche physique d'un corps — habillage, sans effet sur la simulation.
 *
 * Volontairement **dérivée de l'id du corps** plutôt que produite par le générateur
 * d'univers : la fiche s'ajoute sans toucher au générateur, donc sans invalider les
 * parties en cours, et se recalcule identiquement côté client comme côté serveur.
 */
export interface BodyPhysicals {
  radiusKm: number;
  /** Gravité de surface en g (1 = Terre). */
  gravityG: number;
  /** Température moyenne de surface, en °C. */
  meanTempC: number;
  atmosphere: Atmosphere;
  /** Durée de rotation, en heures. */
  dayLengthHours: number;
  /** Période de révolution autour du corps parent, en jours. */
  orbitPeriodDays: number;
}

/** [min, max] de rayon (km) par type, pour une planète. */
const RADIUS_RANGE: Record<PlanetType, [number, number]> = {
  telluric: [4800, 8200],
  oceanic: [5200, 7600],
  arid: [3400, 6800],
  frozen: [2600, 6000],
  volcanic: [3000, 6400],
  gas: [38000, 82000],
};

/** [min, max] de densité relative (Terre = 1) : une gazeuse est immense mais légère. */
const DENSITY_RANGE: Record<PlanetType, [number, number]> = {
  telluric: [0.9, 1.1],
  oceanic: [0.8, 1.0],
  arid: [0.85, 1.05],
  frozen: [0.5, 0.8],
  volcanic: [0.95, 1.25],
  gas: [0.15, 0.3],
};

/** Température de référence par type (°C), avant correction par la distance à l'étoile. */
const BASE_TEMP: Record<PlanetType, number> = {
  telluric: 14,
  oceanic: 12,
  arid: 38,
  frozen: -80,
  volcanic: 240,
  gas: -130,
};

/** Atmosphères plausibles par type, pondérées. */
const ATMOSPHERE_WEIGHTS: Record<PlanetType, readonly (readonly [Atmosphere, number])[]> = {
  telluric: [
    ["breathable", 5],
    ["thin", 3],
    ["toxic", 2],
  ],
  oceanic: [
    ["breathable", 6],
    ["dense", 2],
    ["thin", 1],
  ],
  arid: [
    ["thin", 5],
    ["none", 3],
    ["toxic", 2],
  ],
  frozen: [
    ["none", 5],
    ["thin", 4],
    ["toxic", 1],
  ],
  volcanic: [
    ["toxic", 6],
    ["dense", 3],
    ["thin", 1],
  ],
  gas: [["dense", 1]],
};

/** Orbite de référence : la distance où la température de base s'applique telle quelle. */
const REFERENCE_ORBIT = 180;

/**
 * Amplitude maximale (°C) de l'écart dû à la distance à l'étoile. Bornée à dessein :
 * le type du corps doit rester lisible — une glacée proche reste glaciale, une
 * volcanique lointaine reste brûlante.
 */
const TEMP_DISTANCE_SPREAD = 45;

/** Température de confort vers laquelle tend un monde très habitable. */
const TEMPERATE_C = 15;

function range(rng: Rng, [min, max]: [number, number]): number {
  return min + rng() * (max - min);
}

/**
 * Atmosphère tirée dans les possibilités du type, **pondérée par l'habitabilité** :
 * un monde très habitable respire, un monde hostile étouffe. Sans ce lien, la fiche
 * contredisait la donnée de jeu (planète à 90 d'habitabilité annoncée « toxique »).
 */
function pickAtmosphere(rng: Rng, type: PlanetType, habitability: number): Atmosphere {
  const bias = Math.max(0.2, habitability / 50);
  const entries = ATMOSPHERE_WEIGHTS[type].map(([value, weight]) => {
    if (value === "breathable") return [value, weight * bias * bias] as const;
    if (value === "none" || value === "toxic") return [value, weight / bias] as const;
    return [value, weight] as const;
  });
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [value, weight] of entries) {
    r -= weight;
    if (r <= 0) return value;
  }
  return entries[entries.length - 1]![0];
}

/**
 * Caractéristiques physiques d'une planète ou d'une lune. Déterministe : même corps,
 * même fiche, sans état ni cache.
 *
 * La température décroît avec l'éloignement de l'étoile (loi en 1/√r, calquée sur
 * l'équilibre radiatif) ; une lune hérite du rayon orbital de sa planète, transmis
 * par `parentOrbitRadius`.
 */
export function bodyPhysicals(planet: Planet, parentOrbitRadius?: number): BodyPhysicals {
  const rng = createRng(`body:${planet.id}`);
  const isMoon = planet.kind === "moon";

  // Une lune est un corps réduit : rayon et gravité à l'échelle d'un satellite.
  const moonScale = isMoon ? 0.28 : 1;
  const radiusKm = Math.round(range(rng, RADIUS_RANGE[planet.type]) * moonScale);
  const density = range(rng, DENSITY_RANGE[planet.type]);
  // g ∝ densité × rayon (à densité égale, un corps deux fois plus gros pèse deux fois plus).
  const gravityG = Math.round(density * (radiusKm / 6371) * 100) / 100;

  // Distance à l'étoile : pour une lune, celle de sa planète.
  const starDistance = Math.max(
    20,
    isMoon ? (parentOrbitRadius ?? REFERENCE_ORBIT) : planet.orbitRadius,
  );
  // Écart logarithmique borné : proche = plus chaud, loin = plus froid, sans jamais
  // renverser la nature du corps.
  const distanceOffset =
    TEMP_DISTANCE_SPREAD *
    Math.max(-1, Math.min(1, Math.log(REFERENCE_ORBIT / starDistance) / Math.log(4)));
  const raw = BASE_TEMP[planet.type] + distanceOffset + range(rng, [-8, 8]);
  // Un monde très habitable est forcément tempéré : la fiche doit corroborer la donnée
  // de jeu, pas la contredire.
  const temperatePull = (planet.habitability / 100) ** 2 * 0.7;
  const meanTempC = Math.round(raw * (1 - temperatePull) + TEMPERATE_C * temperatePull);

  return {
    radiusKm,
    gravityG,
    meanTempC,
    atmosphere: pickAtmosphere(rng, planet.type, planet.habitability),
    dayLengthHours: Math.round(range(rng, isMoon ? [40, 700] : [8, 90]) * 10) / 10,
    // Période orbitale : loi de Kepler (T ∝ r^1.5) autour du corps parent.
    orbitPeriodDays:
      Math.round(((planet.orbitRadius / (isMoon ? 4 : 40)) ** 1.5 + range(rng, [0.2, 2])) * 10) /
      10,
  };
}

/** Le corps est-il vivable sans combinaison ? (habillage : croisé avec l'habitabilité) */
export function isBreathable(physicals: BodyPhysicals): boolean {
  return (
    physicals.atmosphere === "breathable" && physicals.meanTempC > -20 && physicals.meanTempC < 55
  );
}
