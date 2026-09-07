import type { ResourceId } from "./resources.js";

/** Type d'atmosphère, du vide au voile écrasant. */
export const ATMOSPHERES = [
  "none",
  "trace",
  "thin",
  "breathable",
  "dense",
  "toxic",
  "corrosive",
  "reducing",
  "crushing",
] as const;

export type Atmosphere = (typeof ATMOSPHERES)[number];

/**
 * Zone thermique d'une orbite, relativement aux repères de son système.
 *
 * Vit dans le modèle et non dans `sim/` parce que les catalogues de `content/` la lisent :
 * c'est elle qui dit quel corps le générateur a le droit de poser où, et `content` ne doit
 * pas dépendre de `sim`.
 */
export const ORBIT_ZONES = ["inner", "habitable", "outer", "frozen"] as const;

export type OrbitZone = (typeof ORBIT_ZONES)[number];

/**
 * Deux axes plutôt qu'une énumération à plat (chantier 45.3).
 *
 * `PLANET_TYPES` confondait une TAILLE et un CLIMAT : « gazeuse » est une structure,
 * « océanique » un environnement, et rien ne permettait une super-Terre aride. Six entrées
 * couvraient trente combinaisons, en en interdisant vingt-quatre sans raison.
 *
 * La **classe** dit de quoi le corps est fait — rayon, densité, donc gravité et vitesse de
 * libération, donc ce qu'il peut retenir. La **variante** dit ce qu'il fait de sa position —
 * albédo, dégazage, effet de serre. La chaîne physique croise les deux.
 */
export const PLANET_CLASSES = [
  "rocky",
  "super_earth",
  "dwarf",
  "ice_giant",
  "gas_giant",
] as const;

export type PlanetClass = (typeof PLANET_CLASSES)[number];

export const PLANET_VARIANTS = [
  "temperate",
  "oceanic",
  "arid",
  "greenhouse",
  "volcanic",
  "toxic",
  "frozen",
  "barren",
  "irradiated",
  "chthonian",
] as const;

export type PlanetVariant = (typeof PLANET_VARIANTS)[number];

/**
 * Une lune n'est pas une petite planète (chantier 45.3).
 *
 * Elle porte les deux mêmes axes, mais tirés de TABLES DISTINCTES : ce qui décide de ce
 * qu'est une lune n'est pas sa zone thermique, c'est sa planète. Io est volcanique à cinq
 * unités astronomiques du Soleil, là où toute planète serait gelée — parce que Jupiter la
 * pétrit. Europe garde un océan liquide sous sa glace pour la même raison, et Titan tient
 * une atmosphère plus épaisse que la nôtre avec quatre fois moins de vitesse de libération,
 * parce qu'il fait assez froid pour que rien ne s'échappe.
 *
 * Réutiliser les axes planétaires aurait donc produit des lunes gelées et stériles partout,
 * en perdant exactement les objets qui rendent un cortège intéressant à explorer.
 *
 * Les EFFETS, eux, gardent la forme des définitions planétaires : la chaîne physique est la
 * même pour tout ce qui a une masse et une orbite. Ce sont les entrées de génération qui
 * diffèrent — la moitié que l'ADR 0021 gèle et que le CMS ne touchera jamais.
 */
export const MOON_CLASSES = ["regular", "irregular", "icy", "major"] as const;

export type MoonClass = (typeof MOON_CLASSES)[number];

export const MOON_VARIANTS = [
  "tidal",
  "subglacial",
  "thick_air",
  "airless",
  "belted",
  "shepherd",
] as const;

export type MoonVariant = (typeof MOON_VARIANTS)[number];

/** Modificateurs de rendement par ressource extraite sur place (1 = base). */
export type Deposits = Partial<Record<ResourceId, number>>;

/** Corps colonisable : planète ou lune (les lunes orbitent une planète parente). */
export interface Planet {
  id: string;
  systemId: string;
  name: string;
  kind: "planet" | "moon";
  /** Pour les lunes : la planète orbitée. */
  parentPlanetId?: string;
  /**
   * Axe structurel : de quoi le corps est fait. Lu dans `planet-classes.ts` pour une planète,
   * dans `moon-classes.ts` pour une lune — c'est `kind` qui dit dans laquelle, et
   * `bodyStructure()` qui tranche une fois pour tous les appelants.
   */
  classId: string;
  /** Axe environnemental : ce qu'il fait de sa position. Même dédoublement que `classId`. */
  variantId: string;
  /**
   * Étoile hôte (chantier 45.2) — le corps central autour duquel ce corps tourne.
   *
   * Absent sur les corps matérialisés avant ce chantier, et sur un système sans étoile.
   * Toutes les planètes désignent l'ancre pour l'instant ; le champ existe parce que les
   * orbites de type S — chaque étoile d'une binaire large gardant son cortège — le
   * rempliront de plusieurs valeurs sans nouvelle migration.
   */
  hostStarId?: string;
  /** 0–100 : plafonne pop max, module croissance et entretien. */
  habitability: number;
  /** Nombre d'emplacements de bâtiments. */
  slots: number;
  deposits: Deposits;
  /** Rayon d'orbite (autour de l'étoile, ou de la planète parente pour une lune). */
  orbitRadius: number;
  /**
   * Position angulaire **à t=0**, en radians (chantier 31.1). Le corps orbite désormais :
   * l'angle courant est `orbitAngle + ω·tick`, calculé par `bodyPositionAt()` et jamais
   * persisté — voir [ADR 0006](../../../../docs/adr/0006-univers-volumetrique-deux-echelles.md).
   * `ω` n'est pas un champ non plus : elle se dérive de `orbitRadius`.
   */
  orbitAngle: number;
  /** Inclinaison du plan orbital sur le plan du système, en radians (chantier 31.1). */
  inclination: number;
  /** Longitude du nœud ascendant : orientation du plan orbital, en radians. */
  ascendingNode: number;
}

/** Ceinture d'astéroïdes — décor riche en gisements (exploitation minière : v2). */
export interface AsteroidBelt {
  id: string;
  systemId: string;
  name: string;
  orbitRadius: number;
  /** Inclinaison du plan de la ceinture, en radians (chantier 31.1). */
  inclination: number;
  /** Longitude du nœud ascendant : orientation du plan de la ceinture, en radians. */
  ascendingNode: number;
  deposits: Deposits;
}

/** Comptoir commercial PNJ, tenu par une faction. */
export interface TradingPost {
  id: string;
  systemId: string;
  factionId: string;
  name: string;
}

/** Nature d'un corps central : ce qui décide du catalogue où lire son type. */
export const CENTRAL_BODY_KINDS = ["star", "blackHole", "whiteHole"] as const;

export type CentralBodyKind = (typeof CENTRAL_BODY_KINDS)[number];

/**
 * Corps central d'un système : étoile, trou noir ou trou blanc (chantier 45.1).
 *
 * Un système en compte un à quatre. Le rang 0 est l'**ancre** — `orbitRadius` nul, à
 * l'origine du repère du système, ce que `bodyPositionAt` suppose déjà pour l'étoile
 * implicite d'aujourd'hui. Les suivants sont des compagnons en orbite autour du barycentre,
 * et portent les mêmes éléments orbitaux qu'une planète : `orbitPosition` s'applique tel
 * quel, sans seconde implémentation.
 *
 * `typeId` est une **chaîne ouverte**, résolue selon `kind` dans `content/astro/`. Le
 * catalogue devient éditable au palier 3 (ADR 0021) : un identifiant relu de la base ne
 * peut pas être prouvé membre d'une union, et chaque accesseur porte donc un repli
 * générique. C'est ce qui permet de supprimer les casts non vérifiés de `loadUniverse`
 * plutôt que d'en ajouter un de plus.
 */
export interface CentralBody {
  id: string;
  systemId: string;
  name: string;
  kind: CentralBodyKind;
  /** Id de catalogue, à lire dans la table que désigne `kind`. */
  typeId: string;
  /** Rang dans le système, par masse décroissante. 0 = ancre. */
  rank: number;
  /** Masse en masses solaires, tirée dans la fourchette du type puis **persistée**.
   *  La zone habitable et l'échelle des orbites en dérivent : la retirer du tirage la
   *  rendrait rejouable, et une galaxie matérialisée ne se régénère pas (ADR 0002). */
  mass: number;
  /** Zéro pour l'ancre ; sinon rayon d'orbite autour du barycentre. */
  orbitRadius: number;
  orbitAngle: number;
  inclination: number;
  ascendingNode: number;
}

export interface StarSystem {
  id: string;
  name: string;
  x: number;
  y: number;
  /** Écart au plan galactique (chantier 31.1) — centré sur 0, borné par `MAP_DEPTH`. */
  z: number;
  /**
   * Corps centraux (chantiers 45.1 puis 45.2). Tout système en porte au moins un, tiré
   * AVANT ses corps : c'est la luminosité de son ancre qui place la zone habitable, donc ce
   * que le générateur a le droit de poser à chaque orbite.
   *
   * Un **errant** n'en porte qu'un, et ce n'est pas une étoile — c'est son seul contenu, et
   * `isDrifter` en fait le discriminant.
   *
   * Optionnel et non « tableau vide », pour la même raison que `station`, `systemCount` et
   * `cloud` : l'univers part en entier à chaque `hello`, et `"stars":[]` sur cinq cents
   * systèmes coûte 5,7 Ko par galaxie détaillée pour ne rien dire. `universe.payload.test.ts`
   * mesure ce mur. Lire par `starsOf`, jamais par `system.stars` directement.
   *
   * Vidé par le brouillard au même titre que `planets` : un système inexploré ne doit pas
   * annoncer qu'il abrite un trou noir.
   */
  stars?: CentralBody[];
  /** Planètes et lunes (les lunes référencent leur parente via parentPlanetId). */
  planets: Planet[];
  belts: AsteroidBelt[];
  /**
   * Au plus un comptoir commercial par système. Le champ garde le nom `station` — le
   * générateur d'univers produit cette clé littéralement, gelée dans `universe.fixture.json` ;
   * la renommer forcerait une régénération de fixture + bump de `GENERATOR_VERSION` pour un
   * changement qui n'affecte ni probabilités ni ids ni tirages RNG. Seul le type a changé.
   */
  station?: TradingPost;
}

export interface Galaxy {
  id: string;
  name: string;
  /** Position sur la carte de l'univers. */
  x: number;
  y: number;
  /**
   * Écart au plan de l'univers (chantier 31.1). Comme `x`/`y`, dérivé de la seule paire
   * seed+index — jamais d'un flux RNG partagé, sans quoi matérialiser une galaxie de
   * frontière dépendrait de celles déjà tirées (ADR 0002).
   */
  z: number;
  /**
   * Type de galaxie (chantier 45.1) — id de catalogue, `content/astro/galaxy-types.ts`.
   *
   * Il **remplace** `galaxyMorphology()`, qui dérivait la forme de l'identifiant et de la
   * taille. Le sens de la dépendance s'inverse : le type précède et contraint la taille au
   * lieu d'en être déduit. L'ADR 0018 interdisait de le persister, l'ADR 0021 lève cette
   * interdiction — c'est le prix d'un type qui entre dans l'économie.
   *
   * Présent **aussi sur une galaxie condensée** : deux chaînes courtes sur le fil, et c'est
   * ce qui permet au palier univers de distinguer une elliptique d'une spirale barrée sans
   * recevoir un seul système.
   */
  typeId: string;
  systems: StarSystem[];
  /** Liaisons de saut intra-galactiques (graphe non orienté, connexe). */
  links: [string, string][];
  /**
   * Ponts d'Einstein-Rosen : paires de systèmes reliées par une bouche de trou noir et sa
   * fontaine blanche, **à l'intérieur d'une même galaxie** (chantier 45.1).
   *
   * Volontairement pas appelés « trous de ver » : `parentIndex`, juste en dessous, emploie
   * déjà ce mot pour l'arbre **inter**-galactique des portails. Deux raccourcis de portées
   * différentes qui porteraient le même nom se confondraient à la première relecture.
   *
   * Tenus hors de `links` : une arête de saut est pondérée par sa longueur 3D réelle, ce
   * qui n'a aucun sens pour un pont, et `links` porte l'invariant de connexité que
   * `universe.test.ts` verrouille. Les ponts sont un arc optionnel du graphe de routage —
   * voir `galaxyGraph(galaxy, bridges)`.
   */
  bridges: [string, string][];
  /** Système d'ancrage : seul point d'arrivée/départ des portails inter-galactiques. */
  anchorSystemId: string;
  /** Multiplicateur de richesse des gisements (galaxies lointaines plus riches). */
  depositBonus: number;
  /**
   * Parent dans l'arbre inter-galactique (trous de ver), figé par le serveur à la
   * matérialisation en DB — un changement des constantes de spirale ne recâble donc
   * jamais le réseau existant. `null` pour la galaxie mère ; absent quand la galaxie
   * sort du générateur pur (le calcul positionnel sert alors de repli).
   */
  parentIndex?: number | null;
  /**
   * Nombre de systèmes de la galaxie, y compris quand `systems` est vide (chantier 37.10).
   *
   * Le serveur ne transmet le détail des systèmes que des galaxies où le joueur a quelque
   * chose à faire ; les autres arrivent en condensé. Ce compte reste vrai des deux côtés —
   * c'est lui qu'affichent les fiches, jamais `systems.length`. Absent sur une galaxie
   * complète, où il vaut par définition `systems.length` : voir `systemCountOf`.
   */
  systemCount?: number;
  /**
   * Positions de systèmes aplaties (`x, y, z, x, y, z, …`), sous-échantillonnées, de quoi
   * dessiner le nuage du palier univers d'une galaxie transmise en condensé — et rien de
   * plus. Absent sur une galaxie complète, dont les vraies positions font foi.
   */
  cloud?: number[];
}

/** Nombre de systèmes d'une galaxie, complète ou condensée. */
export function systemCountOf(galaxy: Galaxy): number {
  return galaxy.systemCount ?? galaxy.systems.length;
}

/**
 * Corps centraux d'un système, absents comme vides. Même rôle que `systemCountOf` : un
 * seul endroit sait que le champ est optionnel, et le reste du code lit un tableau.
 */
export function starsOf(system: StarSystem): readonly CentralBody[] {
  return system.stars ?? EMPTY_STARS;
}

/** Partagé plutôt que réalloué : `starsOf` est appelé sur le chemin chaud du rendu. */
const EMPTY_STARS: readonly CentralBody[] = [];

/**
 * Corps central principal — l'ancre, à l'origine du repère du système.
 *
 * Absent d'un système redacté par le brouillard : un système inexploré n'annonce pas ce
 * qu'il abrite, et l'appelant doit prévoir le cas plutôt que supposer une étoile.
 */
export function primaryOf(system: StarSystem): CentralBody | undefined {
  return starsOf(system)[0];
}

/**
 * Le système est-il un errant — une singularité sans étoile ni monde ?
 *
 * Le discriminant est la **nature de l'ancre**, et non « a-t-il des corps centraux » : depuis
 * que le palier 2 en donne à tous les systèmes, cette seconde lecture ne distinguait plus
 * rien. Un système redacté n'a pas d'ancre connue et n'est donc pas réputé errant, ce qui est
 * la bonne réponse : le brouillard ne doit pas révéler l'inverse non plus.
 */
export function isDrifter(system: StarSystem): boolean {
  const anchor = primaryOf(system);
  return anchor !== undefined && anchor.kind !== "star";
}

/** Méga-projet de portail vers une galaxie lointaine (contributions par convois). */
export interface Gateway {
  /** Galaxie cible. */
  galaxyId: string;
  /** Ressources déjà livrées au chantier. */
  progress: Partial<Record<ResourceId, number>>;
  /** Timer final d'activation une fois le coût couvert (timestamp ms), sinon null. */
  activatesAt: number | null;
  active: boolean;
}

export interface Universe {
  seed: string;
  galaxies: Galaxy[];
}

/**
 * L'univers tel qu'il part au client (chantier 37.10) : **sans la seed**.
 *
 * Le générateur est déterministe et vit dans le paquet du navigateur. Transmettre la seed
 * revenait à transmettre la clé de tout ce que le brouillard prétend cacher — planètes et
 * gisements des systèmes inexplorés compris. Le client n'en a jamais rien fait ; ce type
 * rend l'omission vérifiable par le compilateur plutôt que par la discipline.
 */
export type ClientUniverse = Omit<Universe, "seed">;
