import {
  blackHoleType,
  planetClass,
  planetVariant,
  starClass,
  whiteHoleType,
  type CentralBody,
  type ResourceId,
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

/**
 * Apparence d'un corps, lue des DEUX axes (chantier 45.3).
 *
 * La **variante** donne la couleur — c'est le climat qui fait qu'un monde est vert, bleu ou
 * rouge, pas sa taille. La **classe** donne le relief et la rugosité : une géante est lisse,
 * une naine criblée de cratères. La table qui vivait ici confondait les deux, faute d'axes
 * séparés dans le modèle.
 */
export function bodyAppearance(
  classId: string,
  variantId: string,
): BodyAppearance {
  const cls = planetClass(classId);
  const env = planetVariant(variantId);
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
 * Apparence d'un corps central — étoile ou singularité (chantier 45.2).
 *
 * La table qui vivait ici dupliquait, pour six classes dérivées, ce que les catalogues de
 * `content/astro/` portent désormais pour vingt-deux types persistés. Elle est remplacée par
 * une lecture : c'est le même doublon que `galaxyAppearance` avait créé, et qu'on ne
 * reproduit pas.
 *
 * Un corps absent — système redacté par le brouillard — rend l'étoile la plus banale : ce que
 * le joueur n'a pas visité ne doit rien lui annoncer.
 */
export function centralBodyAppearance(
  body: CentralBody | undefined,
): StarAppearance {
  if (!body) return GENERIC_STAR;

  if (body.kind === "star") {
    const def = starClass(body.typeId);
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

  // Une singularité ne rend ni cœur ni bord : c'est son disque qui porte la teinte, et la
  // lumière qu'il émet remplace celle d'une étoile absente. Une fontaine blanche, elle,
  // brille — d'où un cœur clair là où un trou noir en a un noir.
  const def =
    body.kind === "blackHole"
      ? blackHoleType(body.typeId)
      : whiteHoleType(body.typeId);
  const glowing = body.kind === "whiteHole";
  return {
    core: glowing ? "#ffffff" : "#000000",
    edge: glowing ? def.halo : "#000000",
    halo: def.halo,
    radius: 0.55,
    corona: 1.6,
    light: def.light,
    intensity: def.intensity,
    churn: 1,
  };
}

/** Apparence d'une classe d'étoile par son identifiant seul, quand le corps n'est pas là. */
export function starAppearance(typeId: string): StarAppearance {
  const def = starClass(typeId);
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
