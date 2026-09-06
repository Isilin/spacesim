import type { ResourceId } from "./resources.js";

export const PLANET_TYPES = [
  "telluric",
  "oceanic",
  "volcanic",
  "frozen",
  "arid",
  "gas",
] as const;

export type PlanetType = (typeof PLANET_TYPES)[number];

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
  type: PlanetType;
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

export interface StarSystem {
  id: string;
  name: string;
  x: number;
  y: number;
  /** Écart au plan galactique (chantier 31.1) — centré sur 0, borné par `MAP_DEPTH`. */
  z: number;
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
  systems: StarSystem[];
  /** Liaisons de saut intra-galactiques (graphe non orienté, connexe). */
  links: [string, string][];
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
