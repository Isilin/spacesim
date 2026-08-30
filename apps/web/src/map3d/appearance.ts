import type { PlanetType } from "@spacesim/shared";

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
