/**
 * Types de trous blancs (chantier 45.1) — la seule famille inventée du chantier.
 *
 * Aucune contrepartie réelle n'a jamais été observée, et rien dans la relativité générale
 * n'oblige à ce qu'il en existe : cette famille est de la science-fiction assumée, et c'est
 * dit ici pour qu'aucun lecteur ne cherche la source astronomique qui n'existe pas.
 *
 * Trois rôles cumulés :
 *
 * 1. **Sortie d'un pont d'Einstein-Rosen.** Chaque bouche est appariée à un trou noir de la
 *    même galaxie (`Galaxy.bridges`), la paire étant tirée entre deux systèmes éloignés
 *    dans le graphe — c'est là qu'un raccourci a du sens sur un diamètre de 59 sauts
 *    (ADR 0018). Le mot « trou de ver » est réservé à l'arbre **inter**-galactique des
 *    portails, qui l'emploie déjà (`Galaxy.parentIndex`). L'inter-galactique reste le
 *    domaine des `Gateway` : le modèle ne l'interdit pas, le générateur ne le produit pas.
 * 2. **Source de matière exotique**, la seule du jeu.
 * 3. **Objet de lore** — le plus rare que le joueur puisse rencontrer.
 *
 * Mêmes deux moitiés que `black-hole-types.ts` : entrées de génération gelées d'un côté,
 * effets et habillage éditables de l'autre (ADR 0021).
 */

import {
  type AstroOverrides,
  NO_ASTRO_OVERRIDES,
  patched,
} from "./overrides.js";
import type { BlackHolePlacement } from "./black-hole-types.js";

export const WHITE_HOLE_TYPE_IDS = [
  "nascent",
  "stable",
  "torrent",
  "echo",
] as const;

export type WhiteHoleTypeId = (typeof WHITE_HOLE_TYPE_IDS)[number];

export interface WhiteHoleTypeDef {
  id: string;

  // ── Entrées de génération — jamais éditables ──

  /**
   * Masses solaires. Une fontaine n'a pas de masse au sens où un trou noir en a une, mais
   * un corps central en a besoin : c'est elle qui fixe le barycentre autour duquel tournent
   * les compagnons, et l'échelle des orbites d'un système qu'elle ancrerait.
   */
  massRange: readonly [number, number];
  /**
   * Emplacements permis. Aucun trou blanc ne peut valoir `"core"` : un bulbe de galaxie
   * accrète, il n'éjecte pas.
   */
  placements: readonly BlackHolePlacement[];
  weights: Partial<Record<BlackHolePlacement, number>>;
  /**
   * Portée du pont, en sauts du graphe séparant les deux bouches. C'est une
   * contrainte d'appariement, pas une distance : le générateur cherche une paire de
   * systèmes dont la distance en sauts tombe dans cette fourchette.
   */
  wormholeRange: readonly [number, number];
  /**
   * Le passage est-il toujours ouvert ? Une bouche intermittente est franchissable, mais
   * jamais au moment choisi — c'est ce qui distingue un raccourci fiable d'une curiosité.
   */
  permanent: boolean;

  // ── Effets ──

  depositMult: number;
  energyMult: number;
  /** Même rendement que pour un trou noir — voir `BlackHoleTypeDef.exoticYield`. */
  exoticYield: number;
  hazard: number;
  radiation: number;

  // ── Habillage ──

  /** Rayon du flux éjecté, dans le repère de système. L'équivalent visuel d'un disque. */
  discRadius: number;
  /** Rayon de la bouche. Pas un horizon : rien n'y tombe, tout en sort. */
  mouthRadius: number;
  halo: string;
  light: string;
  intensity: number;
}

export interface StaticWhiteHoleTypeDef extends WhiteHoleTypeDef {
  id: WhiteHoleTypeId;
}

export const WHITE_HOLE_TYPES: Record<WhiteHoleTypeId, StaticWhiteHoleTypeDef> =
  {
    // Vient de s'ouvrir : le passage se referme et se rouvre, praticable mais pas fiable.
    nascent: {
      id: "nascent",
      massRange: [2, 8],
      placements: ["drifter"],
      weights: { drifter: 3 },
      wormholeRange: [8, 15],
      permanent: false,
      depositMult: 1.0,
      energyMult: 1.4,
      exoticYield: 1.2,
      hazard: 3,
      radiation: 3,
      discRadius: 30,
      mouthRadius: 5.5,
      halo: "#d7f0ff",
      light: "#eaf8ff",
      intensity: 2.4,
    },
    // Le raccourci fiable : c'est celui-là qui change réellement la carte d'une galaxie.
    stable: {
      id: "stable",
      massRange: [4, 14],
      placements: ["drifter", "primary"],
      weights: { drifter: 4, primary: 2 },
      wormholeRange: [20, 40],
      permanent: true,
      depositMult: 1.0,
      energyMult: 1.8,
      exoticYield: 1.5,
      hazard: 2,
      radiation: 2,
      discRadius: 44,
      mouthRadius: 7.5,
      halo: "#eaf6ff",
      light: "#ffffff",
      intensity: 3.0,
    },
    // Éjecte plus qu'il ne laisse passer : la meilleure récolte du jeu, dans un flux qui
    // abîme les coques.
    torrent: {
      id: "torrent",
      massRange: [10, 30],
      placements: ["primary"],
      weights: { primary: 1 },
      wormholeRange: [12, 25],
      permanent: true,
      depositMult: 1.1,
      energyMult: 3.0,
      exoticYield: 2.4,
      hazard: 4,
      radiation: 4,
      discRadius: 96,
      mouthRadius: 10,
      halo: "#fff2d0",
      light: "#fff8e4",
      intensity: 3.6,
    },
    // Rigoureusement apparié à un trou noir nommé, à l'autre bout de la galaxie : y entrer,
    // c'est ressortir là-bas.
    echo: {
      id: "echo",
      massRange: [3, 10],
      placements: ["drifter"],
      weights: { drifter: 2 },
      wormholeRange: [40, 59],
      permanent: true,
      depositMult: 1.0,
      energyMult: 1.2,
      exoticYield: 1.0,
      hazard: 1,
      radiation: 1,
      discRadius: 38,
      mouthRadius: 6.5,
      halo: "#cbd8ff",
      light: "#e0e8ff",
      intensity: 2.6,
    },
  };

/** Repli neutre — même règle que `blackHoleType`. */
const GENERIC_WHITE_HOLE: WhiteHoleTypeDef = WHITE_HOLE_TYPES.stable;

export function whiteHoleType(
  id: string,
  overrides: AstroOverrides = NO_ASTRO_OVERRIDES,
): WhiteHoleTypeDef {
  return patched<WhiteHoleTypeDef>(
    WHITE_HOLE_TYPES[id as WhiteHoleTypeId] ?? GENERIC_WHITE_HOLE,
    overrides.whiteHole?.[id],
  );
}
