import type {
  GalaxyMorphology,
  PlanetType,
  ResourceId,
  StarClass,
} from "@spacesim/shared";

/**
 * Registre d'apparence (chantier 31.18). Traduit une donnée de jeu — type de planète,
 * nature de site, classe de châssis — en paramètres de rendu.
 *
 * **Tout accès passe par un repli générique.** Le contenu du jeu est éditable depuis
 * l'admin (chantier 23) : une entrée créée sans coder doit rendre une forme neutre, pas
 * casser la vue ni disparaître. C'est la condition pour que le CMS tienne sa promesse.
 *
 * Décision et alternatives écartées : ADR
 * [0007](../../../../docs/adr/0007-habillage-3d-procedural-et-parametrique.md).
 */
export interface BodyAppearance {
  /** Teinte de base de la surface. */
  color: string;
  /** Teinte des reliefs / nuages, mélangée par le bruit du shader. */
  accent: string;
  /** Rugosité : une géante gazeuse est lisse, un monde volcanique mat. */
  roughness: number;
  /** Amplitude du bruit de surface — 0 rend une sphère unie. */
  relief: number;
}

const GENERIC_BODY: BodyAppearance = {
  color: "#8a8f98",
  accent: "#6b7078",
  roughness: 0.85,
  relief: 0.35,
};

const BODIES: Record<PlanetType, BodyAppearance> = {
  telluric: {
    color: "#5f8f52",
    accent: "#8fae6a",
    roughness: 0.9,
    relief: 0.55,
  },
  oceanic: {
    color: "#2f6f9f",
    accent: "#7fc8e8",
    roughness: 0.35,
    relief: 0.3,
  },
  volcanic: {
    color: "#7a2f28",
    accent: "#e0762f",
    roughness: 0.95,
    relief: 0.75,
  },
  frozen: { color: "#9fbcd4", accent: "#e8f4ff", roughness: 0.5, relief: 0.4 },
  arid: { color: "#a8874a", accent: "#d8b877", roughness: 0.95, relief: 0.6 },
  gas: { color: "#8f6fb0", accent: "#d8b0e0", roughness: 0.15, relief: 0.2 },
};

export function bodyAppearance(type: string): BodyAppearance {
  return BODIES[type as PlanetType] ?? GENERIC_BODY;
}

/** Teinte d'un site découvert au scan (chantier 31.11). */
const SITES: Record<string, string> = {
  wreck: "#e0b64f",
  anomaly: "#b48fe0",
  cache: "#56d364",
};

export function siteColor(kind: string): string {
  return SITES[kind] ?? "#c8ccd2";
}

/**
 * Apparence d'une étoile selon sa classe (chantier 35.10).
 *
 * `radius` et `corona` sont des facteurs appliqués aux tailles de lecture du palier
 * système : une géante doit se voir immense sans que son système cesse de tenir dans le
 * cadre. `light` est ce que la ponctuelle centrale émet — une naine rouge éclaire peu et
 * rouge, un trou noir n'éclaire pas du tout et laisse son disque d'accrétion s'en charger.
 */
export interface StarAppearance {
  core: string;
  edge: string;
  halo: string;
  radius: number;
  corona: number;
  light: string;
  intensity: number;
  /** Vitesse de défilement de la granulation : une géante bout lentement. */
  churn: number;
}

const GENERIC_STAR: StarAppearance = {
  core: "#fff0c2",
  edge: "#ff8a3d",
  halo: "#ffae52",
  radius: 1,
  corona: 1,
  light: "#ffffff",
  intensity: 3,
  churn: 1,
};

const STARS: Record<StarClass, StarAppearance> = {
  redDwarf: {
    core: "#ffb27a",
    edge: "#d8452a",
    halo: "#e0603a",
    radius: 0.62,
    corona: 0.8,
    light: "#ffb089",
    intensity: 2,
    churn: 0.55,
  },
  mainSequence: GENERIC_STAR,
  giant: {
    core: "#ffd9a0",
    edge: "#e05a2a",
    halo: "#ff8a4a",
    radius: 1.7,
    corona: 1.5,
    light: "#ffd0a0",
    intensity: 3.6,
    churn: 0.4,
  },
  whiteDwarf: {
    core: "#f2f8ff",
    edge: "#9fc4ff",
    halo: "#cfe2ff",
    radius: 0.34,
    corona: 0.55,
    light: "#dceaff",
    intensity: 2.4,
    churn: 1.8,
  },
  pulsar: {
    core: "#eaf4ff",
    edge: "#7aa8ff",
    halo: "#9fd0ff",
    radius: 0.3,
    corona: 0.5,
    light: "#cfe4ff",
    intensity: 2.6,
    churn: 2.6,
  },
  blackHole: {
    // L'horizon ne rend rien de tout cela — c'est le disque qui porte la teinte, et la
    // lumière qu'il émet, chaude et faible, remplace celle d'une étoile absente.
    core: "#000000",
    edge: "#000000",
    halo: "#ff8a3d",
    radius: 0.55,
    corona: 1.6,
    light: "#ffb37a",
    intensity: 1.1,
    churn: 1,
  },
};

export function starAppearance(starClass: string): StarAppearance {
  return STARS[starClass as StarClass] ?? GENERIC_STAR;
}

/**
 * Apparence d'une galaxie selon sa morphologie (chantier 35.10). `arms` à zéro décrit un
 * nuage sans bras — c'est ce qui distingue une elliptique d'une spirale.
 */
export interface GalaxyAppearance {
  arms: number;
  /** Nombre de tours parcourus par un bras, en radians. */
  winding: number;
  /** Longueur de la barre centrale, en part du rayon. Zéro pour une spirale simple. */
  bar: number;
  /** Dispersion perpendiculaire aux bras, en part du rayon. */
  scatter: number;
}

const GENERIC_GALAXY: GalaxyAppearance = {
  arms: 2,
  winding: Math.PI * 3,
  bar: 0,
  scatter: 0.28,
};

const GALAXIES: Record<GalaxyMorphology, GalaxyAppearance> = {
  spiral: GENERIC_GALAXY,
  barred: { arms: 2, winding: Math.PI * 2.2, bar: 0.42, scatter: 0.22 },
  elliptical: { arms: 0, winding: 0, bar: 0, scatter: 1 },
  irregular: { arms: 3, winding: Math.PI * 1.2, bar: 0, scatter: 0.75 },
};

export function galaxyAppearance(morphology: string): GalaxyAppearance {
  return GALAXIES[morphology as GalaxyMorphology] ?? GENERIC_GALAXY;
}

/**
 * Teinte d'une ceinture selon ce qu'on y extrait (chantier 35.10). Une ceinture de fer ne
 * doit pas ressembler à une ceinture de glace : c'est la seule information qu'elle porte, et
 * elle était invisible.
 */
const ORES: Record<string, string> = {
  ore: "#8a7458",
  metals: "#8f9aa6",
  components: "#9a86c4",
  energy: "#c4a86a",
  food: "#7e9463",
};

export function asteroidTint(
  deposits: Partial<Record<ResourceId, number>>,
): string {
  const best = Object.entries(deposits).sort(
    (a, b) => (b[1] ?? 0) - (a[1] ?? 0),
  )[0];
  return (best && ORES[best[0]]) ?? "#6b5a44";
}

/**
 * Teinte d'une faction NPC (chantier 35.8). Repli générique obligatoire : une faction
 * ajoutée depuis l'admin doit rendre une couleur neutre, pas casser la vue.
 */
const FACTIONS: Record<string, string> = {
  syndicate: "#e0b64f",
  consortium: "#8fb8e0",
  guild: "#c9a0dc",
};

export function factionTint(factionId: string): string {
  return FACTIONS[factionId] ?? "#b9a37a";
}

/**
 * Graine numérique stable tirée d'un identifiant. Deux corps du même type doivent
 * différer sans rien persister : c'est l'id qui fait la variété, comme partout ailleurs
 * dans la génération de l'univers.
 */
export function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}
