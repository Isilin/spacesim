import type { ResourceId } from "./resources.js";

export const PLANET_TYPES = ["telluric", "oceanic", "volcanic", "frozen", "arid", "gas"] as const;

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
  /** Position angulaire sur l'orbite, en radians. */
  orbitAngle: number;
}

/** Ceinture d'astéroïdes — décor riche en gisements (exploitation minière : v2). */
export interface AsteroidBelt {
  id: string;
  systemId: string;
  name: string;
  orbitRadius: number;
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
