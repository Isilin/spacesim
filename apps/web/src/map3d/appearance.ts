import {
  blackHoleType,
  bodyEnvironment,
  bodyStructure,
  beltType,
  starClass,
  whiteHoleType,
  type BodyRef,
  type CentralBody,
} from "@spacesim/shared";
import { astroOverrides } from "../state/astro-content.js";

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

/**
 * Apparence d'un corps, lue des DEUX axes (chantier 45.3).
 *
 * La **variante** donne la couleur — c'est le climat qui fait qu'un monde est vert, bleu ou
 * rouge, pas sa taille. La **classe** donne le relief et la rugosité : une géante est lisse,
 * une naine criblée de cratères. La table qui vivait ici confondait les deux, faute d'axes
 * séparés dans le modèle.
 *
 * Le corps passe en entier plutôt que ses deux identifiants : c'est `kind` qui décide si on
 * lit les catalogues de planètes ou ceux de lunes, et l'appelant n'a pas à le savoir.
 */
export function bodyAppearance(body: BodyRef): BodyAppearance {
  const overrides = astroOverrides();
  const cls = bodyStructure(body, overrides);
  const env = bodyEnvironment(body, overrides);
  return {
    color: env.color,
    accent: env.accent,
    roughness: cls.roughness,
    relief: cls.relief,
  };
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

/**
 * Ce qu'une SINGULARITÉ demande au rendu — un jeu de champs distinct de celui d'une étoile.
 *
 * Ses deux rayons sont en **unités de scène**, tels que les catalogues les portent : 7,15
 * d'horizon pour un stellaire, 51 pour un supermassif. Ceux d'une `StarAppearance` sont des
 * FACTEURS sans dimension, multipliés par la taille de lecture du palier système.
 *
 * C'est cette confusion d'unités qui a produit le défaut du chantier 45 : un unique champ
 * `radius` servant aux deux, une singularité y était écrite `0.55` en dur — soit très
 * exactement `7,15 / 13`, les proportions du trou noir stellaire. Les onze types rendaient
 * donc la même taille, et les trois rayons du catalogue, pourtant éditables au CMS, ne
 * changeaient rien.
 */
export interface SingularityAppearance {
  /** Rayon de l'horizon, en unités de scène. */
  horizonRadius: number;
  /** Rayon externe du disque d'accrétion. **Zéro veut dire « pas de disque »** — un dormant. */
  discRadius: number;
  /** Teinte de la bouche : noire pour un trou, claire pour une fontaine, qui rend ce qu'elle a pris. */
  mouth: string;
  halo: string;
  light: string;
  intensity: number;
}

/**
 * Apparence d'un corps central — étoile ou singularité (chantiers 45.2 puis 46).
 *
 * La table qui vivait ici dupliquait, pour six classes dérivées, ce que les catalogues de
 * `content/astro/` portent désormais pour vingt-deux types persistés. Elle est remplacée par
 * une lecture : c'est le même doublon que `galaxyAppearance` avait créé, et qu'on ne
 * reproduit pas.
 *
 * **Une union discriminée**, et non un type unique : les deux familles ne demandent pas les
 * mêmes grandeurs, et prétendre le contraire a coûté le défaut décrit sur
 * `SingularityAppearance`. Le compilateur force désormais l'appelant à traiter les deux
 * branches — une troisième famille de `kind` ne pourra plus retomber en silence sur des
 * valeurs stellaires.
 *
 * Un corps absent — système redacté par le brouillard — rend l'étoile la plus banale : ce que
 * le joueur n'a pas visité ne doit rien lui annoncer.
 */
export type CentralBodyLook =
  | { kind: "star"; star: StarAppearance }
  | { kind: "singularity"; singularity: SingularityAppearance };

export function centralBodyAppearance(
  body: CentralBody | undefined,
): CentralBodyLook {
  if (!body || body.kind === "star") {
    return {
      kind: "star",
      star: body ? starAppearance(body.typeId) : GENERIC_STAR,
    };
  }

  // Une singularité ne rend ni cœur ni bord : c'est son disque qui porte la teinte, et la
  // lumière qu'il émet remplace celle d'une étoile absente. Une fontaine blanche, elle,
  // brille — d'où une bouche claire là où un trou noir en a une noire.
  const overrides = astroOverrides();
  // La bouche d'une fontaine et l'horizon d'un trou noir sont le même objet de scène : la
  // frontière d'où plus rien ne revient, ou d'où tout sort. Les catalogues les nomment
  // différemment parce que ce ne sont pas la même chose en physique.
  const def =
    body.kind === "blackHole"
      ? blackHoleType(body.typeId, overrides)
      : whiteHoleType(body.typeId, overrides);
  const horizonRadius =
    body.kind === "blackHole"
      ? blackHoleType(body.typeId, overrides).horizonRadius
      : whiteHoleType(body.typeId, overrides).mouthRadius;
  return {
    kind: "singularity",
    singularity: {
      horizonRadius,
      discRadius: def.discRadius,
      mouth: body.kind === "whiteHole" ? "#f2f7ff" : "#000000",
      halo: def.halo,
      light: def.light,
      intensity: def.intensity,
    },
  };
}

/** Apparence d'une classe d'étoile par son identifiant seul, quand le corps n'est pas là. */
export function starAppearance(typeId: string): StarAppearance {
  const def = starClass(typeId, astroOverrides());
  return {
    core: def.core,
    edge: def.edge,
    halo: def.halo,
    radius: def.radius,
    corona: def.corona,
    light: def.light,
    intensity: def.intensity,
    churn: def.churn,
  };
}

/**
 * Teinte d'une ceinture, lue de sa COMPOSITION depuis le chantier 45.3.
 *
 * Elle se déduisait du gisement dominant, ce qui ne pouvait dire qu'une chose : « du
 * minerai ». Toutes les ceintures sortaient donc de la même couleur, puisque toutes en
 * portaient. Le type dit ce dont elles sont faites, et une glacée ne ressemble plus à un
 * champ de débris.
 */
export function asteroidTint(belt: { typeId: string }): string {
  return beltType(belt.typeId, astroOverrides()).tint;
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
