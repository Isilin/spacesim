import {
  CHASSIS,
  MODULES,
  type ChassisKind,
  type ModuleRole,
  type SlotType,
} from "@spacesim/shared";
import { hullScale, isHeavyTier } from "../shipScale.js";
import { seedOf } from "./appearance.js";
import {
  antennaCluster,
  decorateSection,
  type DetailPart,
  radialBox,
  radiatorFins,
  rng,
  type Section,
} from "./greeble.js";
import { slotColor, structureColor } from "./theme.js";

/**
 * Composition géométrique d'un vaisseau (chantier 33.4) — **fonction pure**, aucune
 * dépendance à three.js ni au DOM.
 *
 * Le dépôt n'a aucun test de composant three.js et aucun mock : la seule couverture du
 * rendu est l'e2e. Plutôt que d'ajouter un harnais WebGL pour vérifier une décision de
 * forme, on sort la décision du rendu — même séparation que `bounds.ts`, testé sans
 * navigateur depuis le chantier 31.24. Voir
 * [ADR 0013](../../../../docs/adr/0013-registre-holographique-des-apercus.md).
 *
 * Convention d'axes : le vaisseau pointe vers **+X**, `y` est la largeur, `z` la hauteur.
 */

export type PartShape =
  /** Tronc de cône à faces plates — le seul volume dont les arêtes dessinent des
   *  panneaux plutôt qu'un fil de fer. */
  | {
      kind: "prism";
      rFore: number;
      rAft: number;
      length: number;
      sides: number;
    }
  | { kind: "cone"; radius: number; height: number; sides: number }
  | { kind: "box"; size: [number, number, number] }
  | { kind: "torus"; radius: number; tube: number; segments: number }
  | { kind: "capsule"; radius: number; length: number }
  | { kind: "sphere"; radius: number };

export interface ShipPart {
  /** Clé stable de rendu — et poignée de test. */
  id: string;
  shape: PartShape;
  position: [number, number, number];
  rotation: [number, number, number];
  color: string;
  /** La seule lueur autorisée par objet : les tuyères (`ui-brief`). */
  emissive?: boolean;
  /** Décor : arêtes seules, sans remplissage (chantier 34.4). */
  wire?: boolean;
  /** `0` supprime la passe d'arêtes — sur un volume lissé elle dégénère en fil de fer. */
  edgeAngle: number;
}

export interface ShipLayout {
  parts: ShipPart[];
  /** Rayon englobant : c'est lui qui doit cadrer la caméra, pas une formule à la main. */
  radius: number;
}

/**
 * Profil de coque par classe de châssis.
 *
 * **Autoré à la main**, exactement comme l'art 2D de `ShipHullDiagram` l'est déjà (« composé
 * à la main pour un rendu maîtrisé »). C'est la mitigation directe du risque que l'ADR 0007
 * s'était désigné : du bruit procédural ne fabrique pas une identité, six profils écrits à
 * la main oui — et six profils ne sont pas un pipeline d'assets.
 */
interface HullProfile {
  /** Sections de la proue vers la poupe : `[xAvant, xArrière, rAvant, rArrière]`. */
  sections: [number, number, number, number][];
  sides: number;
  /** Aplatissement vertical de la coque entière : 1 = ronde, 0,7 = dalle. */
  flatten: number;
  fins: number;
  nozzles: number;
  /** Poutre apparente entre le corps et le bloc moteur — lit « remorqueur + conteneur ». */
  spine: boolean;
  signature: "drill" | "ring" | "mast" | "none";
}

const HULLS: Record<ChassisKind, HullProfile> = {
  generic: {
    sections: [
      [1.2, 0.5, 0.28, 0.45],
      [0.5, -0.6, 0.45, 0.5],
      [-0.6, -1.2, 0.5, 0.38],
    ],
    sides: 12,
    flatten: 0.85,
    fins: 2,
    nozzles: 1,
    spine: false,
    signature: "none",
  },
  military: {
    sections: [
      [1.7, 0.8, 0.14, 0.32],
      [0.8, -0.4, 0.32, 0.4],
      [-0.4, -1.3, 0.4, 0.28],
    ],
    sides: 8,
    flatten: 0.7,
    fins: 3,
    nozzles: 2,
    spine: false,
    signature: "none",
  },
  freighter: {
    // Nez court puis, après la poutre, un corps de caisson : la silhouette qui dit
    // « remorqueur tirant un conteneur » sans qu'on ait à l'écrire.
    sections: [
      [1.3, 0.85, 0.34, 0.44],
      [0.15, -1.15, 0.7, 0.7],
    ],
    sides: 6,
    flatten: 1,
    fins: 0,
    nozzles: 1,
    spine: true,
    signature: "none",
  },
  miner: {
    sections: [
      [0.95, 0.25, 0.5, 0.72],
      [0.25, -1, 0.72, 0.54],
    ],
    sides: 6,
    flatten: 1.25,
    fins: 0,
    nozzles: 1,
    spine: false,
    signature: "drill",
  },
  colonizer: {
    sections: [
      [1.25, 0.5, 0.3, 0.58],
      [0.5, -0.7, 0.58, 0.62],
      [-0.7, -1.25, 0.62, 0.4],
    ],
    sides: 10,
    flatten: 1,
    fins: 0,
    nozzles: 1,
    spine: false,
    signature: "ring",
  },
  explorer: {
    sections: [
      [1.5, 0.6, 0.1, 0.24],
      [0.6, -0.8, 0.24, 0.28],
      [-0.8, -1.2, 0.28, 0.2],
    ],
    sides: 6,
    flatten: 0.9,
    fins: 0,
    nozzles: 2,
    spine: false,
    signature: "mast",
  },
};

/**
 * Bande de montage par type d'emplacement : où la pièce se pose sur la coque. Reprend
 * l'ordre de haut en bas du diagramme 2D (armes en avant, propulsion à l'arrière) pour que
 * les deux vues racontent le même vaisseau.
 */
const MOUNT: Record<
  SlotType,
  { x: number; place: "dorsal" | "flank" | "flush" | "outboard" }
> = {
  weapon: { x: 0.72, place: "dorsal" },
  utility: { x: 0.05, place: "flank" },
  defense: { x: -0.35, place: "flush" },
  propulsion: { x: -1.05, place: "outboard" },
};

/** Rayon extérieur de la coque à une abscisse donnée — sert à plaquer les pièces dessus. */
function hullRadiusAt(profile: HullProfile, x: number): number {
  for (const [fore, aft, rFore, rAft] of profile.sections) {
    if (x <= fore && x >= aft) {
      const t = (fore - x) / Math.max(1e-6, fore - aft);
      return rFore + (rAft - rFore) * t;
    }
  }
  return profile.sections[0]![2];
}

/** Primitive d'un module, exprimée en décalage relatif à son point de montage. */
interface ModulePiece {
  shape: PartShape;
  offset: [number, number, number];
  edgeAngle: number;
}

/**
 * Tonnage le plus lourd du catalogue — calculé, jamais recopié : une valeur en dur
 * deviendrait fausse au premier module ajouté au contenu.
 */
const MAX_MODULE_TONNAGE = Object.values(MODULES).reduce(
  (max, def) => Math.max(max, def.tonnage),
  1,
);

/**
 * Taille apparente d'un module, tirée de son **tonnage**.
 *
 * Elle était figée à 0,3 pour tous : un bouclier aegis et un pod de cargo faisaient
 * exactement la même bosse. La donnée existait déjà, le rendu ne la lisait pas.
 */
function moduleSize(moduleId: string): number {
  const def = MODULES[moduleId as keyof typeof MODULES];
  if (!def) return 0.3;
  return 0.22 + 0.2 * Math.min(1, def.tonnage / MAX_MODULE_TONNAGE);
}

/**
 * Silhouette d'un module, dérivée de son **rôle** — huit formes, contre quatre aujourd'hui.
 *
 * Le modèle porte déjà huit `ModuleRole` et seulement quatre `SlotType` ; le rendu
 * n'exploitait que les quatre. La couleur reste celle de l'emplacement — c'est la légende
 * que le diagramme 2D a déjà apprise au joueur — et la **forme** devient l'information que
 * la 3D ajoute.
 *
 * Chaque rôle rend désormais quatre à dix primitives au lieu d'une à trois (chantier
 * 34.4) : ce qui distingue un canon d'un tube, c'est son frettage, son berceau et son
 * évent, pas son cylindre.
 */
function moduleShapes(
  role: ModuleRole,
  size: number,
  reach: number,
): ModulePiece[] {
  switch (role) {
    case "weapon": {
      // Fût + frettes + culasse + berceau. La longueur du fût vient de la PORTÉE du
      // module : un railgun longue portée est visiblement plus long qu'un autocanon.
      const barrel = size * (1 + reach * 1.6);
      const pieces: ModulePiece[] = [
        {
          shape: {
            kind: "prism",
            rFore: size * 0.24,
            rAft: size * 0.3,
            length: barrel,
            sides: 8,
          },
          offset: [size * 0.5, 0, 0],
          edgeAngle: 15,
        },
        {
          shape: { kind: "box", size: [size * 0.7, size * 0.8, size * 0.7] },
          offset: [-size * 0.35, 0, 0],
          edgeAngle: 15,
        },
        // Berceau : la pièce qui rattache l'arme à la coque au lieu de la faire flotter.
        {
          shape: { kind: "box", size: [size * 0.9, size * 0.5, size * 0.22] },
          offset: [-size * 0.1, 0, -size * 0.42],
          edgeAngle: 15,
        },
        // Frein de bouche.
        {
          shape: {
            kind: "prism",
            rFore: size * 0.34,
            rAft: size * 0.34,
            length: size * 0.12,
            sides: 8,
          },
          offset: [size * 0.5 + barrel * 0.42, 0, 0],
          edgeAngle: 18,
        },
      ];
      // Frettes le long du fût : trois anneaux d'arêtes pour trois volumes très plats.
      for (let i = 0; i < 3; i++) {
        pieces.push({
          shape: {
            kind: "prism",
            rFore: size * 0.32,
            rAft: size * 0.32,
            length: size * 0.07,
            sides: 8,
          },
          offset: [size * 0.5 + barrel * (i * 0.3 - 0.3), 0, 0],
          edgeAngle: 18,
        });
      }
      return pieces;
    }
    case "defense": {
      // Ceinture de blindage plaquée sur la coque, segmentée : une seule dalle lisait
      // comme une caisse, trois écailles lisent comme un blindage.
      const pieces: ModulePiece[] = [];
      for (let i = 0; i < 3; i++) {
        pieces.push({
          shape: {
            kind: "box",
            size: [size * 0.5, size * 0.22, size * (1.1 - i * 0.16)],
          },
          offset: [(i - 1) * size * 0.56, 0, 0],
          edgeAngle: 15,
        });
      }
      for (const side of [1, -1]) {
        pieces.push({
          shape: { kind: "box", size: [size * 1.7, size * 0.1, size * 0.2] },
          offset: [0, 0, side * size * 0.6],
          edgeAngle: 15,
        });
      }
      return pieces;
    }
    case "propulsion": {
      const pieces: ModulePiece[] = [
        {
          shape: { kind: "capsule", radius: size * 0.32, length: size * 1.1 },
          offset: [0, 0, 0],
          edgeAngle: 0,
        },
        {
          shape: {
            kind: "prism",
            rFore: size * 0.3,
            rAft: size * 0.5,
            length: size * 0.5,
            sides: 8,
          },
          offset: [-size * 0.85, 0, 0],
          edgeAngle: 15,
        },
        // Prise d'admission à l'avant : sans elle, la nacelle n'a pas de sens de marche.
        {
          shape: {
            kind: "prism",
            rFore: size * 0.36,
            rAft: size * 0.28,
            length: size * 0.3,
            sides: 8,
          },
          offset: [size * 0.78, 0, 0],
          edgeAngle: 15,
        },
      ];
      for (let i = 0; i < 3; i++) {
        pieces.push({
          shape: {
            kind: "prism",
            rFore: size * 0.37,
            rAft: size * 0.37,
            length: size * 0.06,
            sides: 8,
          },
          offset: [size * (i * 0.4 - 0.4), 0, 0],
          edgeAngle: 18,
        });
      }
      return pieces;
    }
    case "cargo": {
      // La chose la plus anguleuse du vaisseau, délibérément : un conteneur se reconnaît à
      // ses arêtes. On en met donc davantage — longerons et porte.
      const pieces: ModulePiece[] = [
        {
          shape: { kind: "box", size: [size * 1.5, size * 0.9, size * 0.9] },
          offset: [0, 0, 0],
          edgeAngle: 15,
        },
        {
          shape: { kind: "box", size: [size * 0.12, size * 0.7, size * 0.7] },
          offset: [size * 0.76, 0, 0],
          edgeAngle: 15,
        },
      ];
      for (const side of [1, -1]) {
        for (const up of [1, -1]) {
          pieces.push({
            shape: {
              kind: "box",
              size: [size * 1.6, size * 0.08, size * 0.14],
            },
            offset: [0, side * size * 0.47, up * size * 0.36],
            edgeAngle: 15,
          });
        }
      }
      return pieces;
    }
    case "mining": {
      const pieces: ModulePiece[] = [
        {
          shape: {
            kind: "cone",
            radius: size * 0.42,
            height: size * 1.3,
            sides: 8,
          },
          offset: [size * 0.6, 0, 0],
          edgeAngle: 15,
        },
        {
          shape: {
            kind: "torus",
            radius: size * 0.45,
            tube: size * 0.12,
            segments: 8,
          },
          offset: [0, 0, 0],
          edgeAngle: 0,
        },
        {
          shape: {
            kind: "prism",
            rFore: size * 0.3,
            rAft: size * 0.38,
            length: size * 0.6,
            sides: 6,
          },
          offset: [-size * 0.4, 0, 0],
          edgeAngle: 15,
        },
      ];
      // Mâchoires autour du cône : la signature d'une tête de forage.
      for (let i = 0; i < 3; i++) {
        const angle = (i * Math.PI * 2) / 3;
        pieces.push({
          shape: { kind: "box", size: [size * 0.7, size * 0.1, size * 0.22] },
          offset: [
            size * 0.55,
            Math.cos(angle) * size * 0.42,
            Math.sin(angle) * size * 0.42,
          ],
          edgeAngle: 15,
        });
      }
      return pieces;
    }
    case "habitat": {
      // Sphère + ceinture + hublots. La sphère seule n'a aucune arête, donc aucune lecture
      // en registre holographique : c'est la ceinture qui la rend visible.
      const pieces: ModulePiece[] = [
        {
          shape: { kind: "sphere", radius: size * 0.6 },
          offset: [0, 0, 0],
          edgeAngle: 0,
        },
        {
          shape: {
            kind: "torus",
            radius: size * 0.61,
            tube: size * 0.06,
            segments: 10,
          },
          offset: [0, 0, 0],
          edgeAngle: 0,
        },
        {
          shape: {
            kind: "prism",
            rFore: size * 0.3,
            rAft: size * 0.3,
            length: size * 0.3,
            sides: 6,
          },
          offset: [-size * 0.65, 0, 0],
          edgeAngle: 15,
        },
      ];
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2 + Math.PI / 4;
        pieces.push({
          shape: { kind: "box", size: [size * 0.16, size * 0.16, size * 0.1] },
          offset: [
            Math.cos(angle) * size * 0.42,
            Math.sin(angle) * size * 0.42,
            size * 0.42,
          ],
          edgeAngle: 15,
        });
      }
      return pieces;
    }
    case "sensor": {
      const pieces: ModulePiece[] = [
        {
          shape: {
            kind: "prism",
            rFore: size * 0.08,
            rAft: size * 0.08,
            length: size * 1.2,
            sides: 6,
          },
          offset: [0, 0, size * 0.5],
          edgeAngle: 15,
        },
        {
          shape: {
            kind: "cone",
            radius: size * 0.5,
            height: size * 0.3,
            sides: 12,
          },
          offset: [0, 0, size * 1.1],
          edgeAngle: 0,
        },
        // Bâti et alimentation : une parabole en équilibre sur un fil ne tient pas debout.
        {
          shape: { kind: "box", size: [size * 0.5, size * 0.5, size * 0.14] },
          offset: [0, 0, -size * 0.06],
          edgeAngle: 15,
        },
        {
          shape: {
            kind: "prism",
            rFore: size * 0.14,
            rAft: size * 0.14,
            length: size * 0.24,
            sides: 6,
          },
          offset: [0, 0, size * 1.22],
          edgeAngle: 15,
        },
      ];
      for (const side of [1, -1]) {
        pieces.push({
          shape: { kind: "box", size: [size * 0.06, size * 0.06, size * 0.9] },
          offset: [side * size * 0.22, 0, size * 0.5],
          edgeAngle: 15,
        });
      }
      return pieces;
    }
    case "support": {
      // Grappe d'antennes de longueurs inégales, sur un socle : lisible même très petite.
      const pieces: ModulePiece[] = [
        {
          shape: { kind: "box", size: [size * 0.9, size * 0.5, size * 0.16] },
          offset: [0, 0, 0],
          edgeAngle: 15,
        },
      ];
      for (const [i, h] of [0.7, 1.1, 0.9, 0.5].entries()) {
        pieces.push({
          shape: { kind: "box", size: [size * 0.1, size * 0.1, size * h] },
          offset: [(i - 1.5) * size * 0.26, 0, size * h * 0.5 + size * 0.08],
          edgeAngle: 15,
        });
        pieces.push({
          shape: { kind: "box", size: [size * 0.2, size * 0.05, size * 0.05] },
          offset: [(i - 1.5) * size * 0.26, 0, size * h * 0.9],
          edgeAngle: 15,
        });
      }
      return pieces;
    }
  }
}

/** Portée normalisée d'un module d'arme, de 0 (courte) à 1 (longue). */
function weaponReach(moduleId: string): number {
  const def = MODULES[moduleId as keyof typeof MODULES];
  const w = def?.effects?.weapons;
  if (!w) return 0.3;
  const long = w.long ?? 0;
  const short = w.short ?? 0;
  const total = long + (w.medium ?? 0) + short;
  return total > 0 ? long / total : 0.3;
}

/**
 * Budget de pièces DÉCORATIVES par vaisseau, hors structure et hors modules.
 *
 * C'est le paramètre qui fixe la densité (ADR 0014). Il est réparti sur les troncs de coque
 * au prorata de leur surface : un châssis à deux sections courtes et un à trois sections
 * longues reçoivent le même total, ce qui évite qu'un profil de coque décide en douce de la
 * richesse du rendu.
 */
const HULL_DETAIL_BUDGET = 190;

/**
 * Compose un vaisseau. Toujours totale : un châssis inconnu du moteur retombe sur le profil
 * générique, un module inconnu est ignoré plutôt que de faire échouer le rendu (repli
 * obligatoire, ADR 0007).
 */
export function shipLayout(chassisId: string, modules: string[]): ShipLayout {
  const chassis = CHASSIS[chassisId as keyof typeof CHASSIS];
  const profile = chassis
    ? (HULLS[chassis.kind] ?? HULLS.generic)
    : HULLS.generic;
  const scale = chassis ? hullScale(chassis) : 1;
  const heavy = isHeavyTier(chassisId);
  const structure = structureColor();
  const parts: ShipPart[] = [];
  // Le détail décoratif est tenu à part : contrairement à la structure et aux modules, il
  // épouse la surface de la coque et ne doit donc PAS subir l'aplatissement vertical, qui
  // le décollerait du volume qu'il habille.
  const decor: DetailPart[] = [];

  // ── Coque, en sections ─────────────────────────────────────────────────────
  profile.sections.forEach(([fore, aft, rFore, rAft], i) => {
    parts.push({
      id: `hull-${i}`,
      shape: {
        kind: "prism",
        rFore,
        rAft,
        length: fore - aft,
        sides: profile.sides,
      },
      position: [(fore + aft) / 2, 0, 0],
      rotation: [0, 0, -Math.PI / 2],
      color: structure,
      edgeAngle: 18,
    });
  });

  const nose = profile.sections[0]!;
  parts.push({
    id: "nose",
    shape: {
      kind: "cone",
      radius: nose[2],
      height: 0.55,
      sides: profile.sides,
    },
    position: [nose[0] + 0.27, 0, 0],
    rotation: [0, 0, -Math.PI / 2],
    color: structure,
    edgeAngle: 18,
  });

  if (profile.spine) {
    // La poutre comble l'écart laissé entre les deux sections du profil : c'est cet espace
    // vide qui fait lire « remorqueur + conteneur » plutôt qu'un fuselage continu.
    const gapFore = profile.sections[0]![1];
    const gapAft = profile.sections[1]![0];
    parts.push({
      id: "spine",
      shape: {
        kind: "prism",
        rFore: 0.1,
        rAft: 0.1,
        length: gapFore - gapAft,
        sides: 6,
      },
      position: [(gapFore + gapAft) / 2, 0, 0],
      rotation: [0, 0, -Math.PI / 2],
      color: structure,
      edgeAngle: 15,
    });
  }

  const stern = profile.sections[profile.sections.length - 1]!;
  const sternX = stern[1];
  const sternR = stern[3];

  // Tuyères : la SEULE lueur du vaisseau (`ui-brief`, budget de lueur).
  const nozzles = profile.nozzles + (heavy ? 1 : 0);
  for (let i = 0; i < nozzles; i++) {
    const spread = nozzles === 1 ? 0 : (i - (nozzles - 1) / 2) * sternR * 1.1;
    parts.push({
      id: `nozzle-${i}`,
      shape: {
        kind: "prism",
        rFore: sternR * 0.34,
        rAft: sternR * 0.55,
        length: 0.34,
        sides: 8,
      },
      position: [sternX - 0.17, spread, 0],
      rotation: [0, 0, -Math.PI / 2],
      color: slotColor("propulsion"),
      emissive: true,
      edgeAngle: 15,
    });
    // Jupe froide autour de la tuyère : elle borde la seule pièce lumineuse du vaisseau,
    // qui sans cela flotte détachée de la poupe.
    parts.push({
      id: `nozzle-shroud-${i}`,
      shape: {
        kind: "prism",
        rFore: sternR * 0.42,
        rAft: sternR * 0.66,
        length: 0.22,
        sides: 8,
      },
      position: [sternX - 0.08, spread, 0],
      rotation: [0, 0, -Math.PI / 2],
      color: structure,
      edgeAngle: 15,
    });
  }

  const fins = profile.fins + (heavy ? 2 : 0);
  for (let i = 0; i < fins; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const up = i >= 2 ? 1 : 0;
    parts.push({
      id: `fin-${i}`,
      shape: { kind: "box", size: [0.7, 0.06, 0.42] },
      position: [
        sternX + 0.45,
        up ? 0 : side * sternR * 1.1,
        up ? side * sternR * 1.2 : 0,
      ],
      rotation: [0, 0, 0],
      color: structure,
      edgeAngle: 15,
    });
  }

  // ── Superstructure ─────────────────────────────────────────────────────────
  // Trois troncs de cône empilés font une pastille, pas un vaisseau. Ce sont ces masses-là
  // — pont dorsal, quille, sponsons, bloc de poupe — qui donnent une silhouette
  // « construite » ; le détail de surface ne fait ensuite que l'habiller. C'est le
  // constat du premier jet du chantier 34 : deux cents pièces de décor posées sur un
  // fuselage lisse rendent un fuselage lisse et flou, pas du hard-surface.
  const widest = profile.sections.reduce((best, s) =>
    Math.max(s[2], s[3]) > Math.max(best[2], best[3]) ? s : best,
  );
  const midX = (widest[0] + widest[1]) / 2;
  const midR = Math.max(widest[2], widest[3]);
  const bodyLen = widest[0] - widest[1];

  parts.push({
    id: "deck",
    shape: {
      kind: "box",
      size: [bodyLen * 0.72, midR * 1.15, midR * 0.34],
    },
    position: [midX + bodyLen * 0.06, 0, midR * 0.72],
    rotation: [0, 0, 0],
    color: structure,
    edgeAngle: 15,
  });
  parts.push({
    id: "deck-house",
    shape: {
      kind: "box",
      size: [bodyLen * 0.3, midR * 0.72, midR * 0.42],
    },
    position: [midX - bodyLen * 0.12, 0, midR * 1.05],
    rotation: [0, 0, 0],
    color: structure,
    edgeAngle: 15,
  });
  parts.push({
    id: "keel",
    shape: {
      kind: "box",
      size: [bodyLen * 0.86, midR * 0.42, midR * 0.3],
    },
    position: [midX, 0, -midR * 0.85],
    rotation: [0, 0, 0],
    color: structure,
    edgeAngle: 15,
  });
  for (const side of [1, -1]) {
    parts.push({
      id: `sponson-${side > 0 ? "p" : "s"}`,
      shape: {
        kind: "box",
        size: [bodyLen * 0.44, midR * 0.36, midR * 0.62],
      },
      position: [midX - bodyLen * 0.05, side * midR * 0.98, 0],
      rotation: [0, 0, 0],
      color: structure,
      edgeAngle: 15,
    });
    // Épaulement qui raccorde le sponson à la coque : sans lui il a l'air posé dessus.
    parts.push({
      id: `sponson-fair-${side > 0 ? "p" : "s"}`,
      shape: {
        kind: "prism",
        rFore: midR * 0.1,
        rAft: midR * 0.3,
        length: bodyLen * 0.5,
        sides: 5,
      },
      position: [midX + bodyLen * 0.24, side * midR * 0.86, 0],
      rotation: [0, 0, -Math.PI / 2],
      color: structure,
      edgeAngle: 18,
    });
  }
  // Bloc de poupe à redans : la poupe était un simple tronc qui se terminait dans le vide.
  for (let i = 0; i < 2; i++) {
    parts.push({
      id: `stern-block-${i}`,
      shape: {
        kind: "box",
        size: [0.26, sternR * (1.5 - i * 0.4), sternR * (1.3 - i * 0.35)],
      },
      position: [sternX + 0.3 + i * 0.24, 0, 0],
      rotation: [0, 0, 0],
      color: structure,
      edgeAngle: 15,
    });
  }

  // ── Signature de classe ────────────────────────────────────────────────────
  if (profile.signature === "drill") {
    parts.push({
      id: "drill",
      shape: { kind: "cone", radius: 0.34, height: 0.9, sides: 8 },
      position: [nose[0] + 0.75, 0, 0],
      rotation: [0, 0, -Math.PI / 2],
      color: slotColor("utility"),
      edgeAngle: 15,
    });
  }
  if (profile.signature === "ring") {
    parts.push({
      id: "habitat-ring",
      shape: { kind: "torus", radius: 0.95, tube: 0.11, segments: 10 },
      position: [-0.1, 0, 0],
      rotation: [0, Math.PI / 2, 0],
      color: structure,
      edgeAngle: 0,
    });
    // Rayons de l'anneau : un tore lisse n'a aucune arête, donc aucune lecture en holo.
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      parts.push({
        id: `ring-spoke-${i}`,
        shape: { kind: "box", size: [0.06, 0.06, 0.95] },
        position: [-0.1, Math.cos(angle) * 0.48, Math.sin(angle) * 0.48],
        rotation: [angle, 0, 0],
        color: structure,
        edgeAngle: 15,
      });
    }
  }
  if (profile.signature === "mast") {
    parts.push({
      id: "mast",
      shape: {
        kind: "prism",
        rFore: 0.045,
        rAft: 0.045,
        length: 1.1,
        sides: 6,
      },
      position: [nose[0] + 0.85, 0, 0],
      rotation: [0, 0, -Math.PI / 2],
      color: structure,
      edgeAngle: 15,
    });
  }
  // Verrière : elle donne un avant et un dessus au vaisseau. Facettée, jamais bombée — une
  // surface lisse ne rend aucune arête, et c'est l'arête qui porte la lecture en holo.
  const canopyR = hullRadiusAt(profile, nose[0] - 0.15);
  parts.push({
    id: "canopy",
    shape: { kind: "cone", radius: canopyR * 0.5, height: 0.34, sides: 5 },
    position: [nose[0] - 0.1, 0, canopyR * 0.78],
    rotation: [0, 0, -Math.PI / 2.6],
    color: slotColor("utility"),
    edgeAngle: 12,
  });

  // ── Détail décoratif de coque ──────────────────────────────────────────────
  // Graine tirée du CHÂSSIS seul, pas du plan complet : monter un module ne doit pas
  // rebattre toute la peau du vaisseau sous les yeux du joueur en train d'éditer. Ce sont
  // les garnitures qui portent la part « modules » de l'empreinte (ADR 0014).
  const sections: Section[] = profile.sections.map(
    ([fore, aft, rFore, rAft]) => ({
      axis: "x" as const,
      from: aft,
      to: fore,
      rFrom: rAft,
      rTo: rFore,
      sides: profile.sides,
      offset: [0, 0] as [number, number],
    }),
  );
  // Le cône de proue était la seule surface nue du vaisseau : la rupture de densité le
  // faisait lire comme une pointe greffée sur une coque détaillée. Deux anneaux suffisent
  // à le rattacher.
  sections.push({
    axis: "x",
    from: nose[0],
    to: nose[0] + 0.5,
    rFrom: nose[2],
    rTo: nose[2] * 0.35,
    sides: profile.sides,
    offset: [0, 0],
  });

  const areas = sections.map(
    (s) => Math.abs(s.to - s.from) * ((s.rFrom + s.rTo) / 2),
  );
  const totalArea = areas.reduce((sum, a) => sum + a, 0) || 1;
  sections.forEach((section, i) => {
    const budget = Math.round(
      HULL_DETAIL_BUDGET * ((areas[i] ?? 0) / totalArea),
    );
    decor.push(
      ...decorateSection(
        section,
        budget,
        structure,
        `${chassisId}:hull:${i}`,
        `hull-${i}`,
      ),
    );
  });

  // Radiateurs le long du flanc arrière : beaucoup d'arête pour très peu de volume.
  const radiatorR = hullRadiusAt(profile, sternX + 0.6);
  for (const side of [1, -1]) {
    decor.push(
      ...radiatorFins(
        "x",
        // Posées SUR le rayon de coque et non au-delà : détachées, les lames se lisaient
        // comme des débris flottant à côté du vaisseau.
        [sternX + 0.6, side * radiatorR * 0.92, 0],
        6,
        0.5,
        0.18,
        structure,
        `radiator-${side > 0 ? "p" : "s"}`,
      ),
    );
  }

  // Grappe d'antennes sur le dos, devant les tuyères.
  decor.push(
    ...antennaCluster(
      [sternX + 0.9, 0, hullRadiusAt(profile, sternX + 0.9) * 0.95],
      5,
      0.3,
      structure,
      `${chassisId}:antenna`,
      "dorsal",
    ),
  );

  // ── Modules ────────────────────────────────────────────────────────────────
  const bySlot = new Map<SlotType, string[]>();
  for (const id of modules) {
    const def = MODULES[id as keyof typeof MODULES];
    if (!def) continue;
    const list = bySlot.get(def.slot) ?? [];
    list.push(id);
    bySlot.set(def.slot, list);
  }

  for (const [slot, ids] of bySlot) {
    const mount = MOUNT[slot];
    ids.forEach((moduleId, i) => {
      const def = MODULES[moduleId as keyof typeof MODULES]!;
      const side = i % 2 === 0 ? 1 : -1;
      const rank = Math.floor(i / 2);
      const x = mount.x - rank * 0.34;
      const hullR = hullRadiusAt(profile, x);
      // La graine porte le châssis ET le module : sans quoi un laser et un railgun au même
      // emplacement recevaient rigoureusement le même désordre.
      const seed = `${chassisId}:${moduleId}:${i}`;
      const jitter = seedOf(seed) * 0.06;
      const size = moduleSize(moduleId);

      let base: [number, number, number];
      const rotation: [number, number, number] = [0, 0, 0];
      switch (mount.place) {
        case "dorsal":
          base = [x, side * hullR * 0.45, hullR * (0.9 + jitter)];
          break;
        case "flank":
          base = [x, side * (hullR + size * 0.5 + jitter), 0];
          break;
        case "flush":
          base = [x, side * (hullR * 0.92 + jitter), 0];
          break;
        case "outboard":
          base = [x, side * (hullR + size * 1.2 + jitter), 0];
          break;
      }

      const reach = def.role === "weapon" ? weaponReach(moduleId) : 0;
      for (const [k, piece] of moduleShapes(def.role, size, reach).entries()) {
        parts.push({
          id: `mod-${slot}-${i}-${k}`,
          shape: piece.shape,
          position: [
            base[0] + piece.offset[0],
            base[1] + piece.offset[1],
            base[2] + piece.offset[2],
          ],
          rotation,
          color: slotColor(slot),
          edgeAngle: piece.edgeAngle,
        });
      }

      // Garniture du module : c'est elle qui porte la part « modules » de l'empreinte du
      // plan. Petite, teintée comme l'emplacement, et rattachée au montage.
      const random = rng(`${seed}:fit`);
      for (let k = 0; k < 6; k++) {
        const box = radialBox(
          "x",
          base[0] + (random() - 0.5) * size * 1.6,
          random() * Math.PI * 2,
          size * 0.55,
          {
            length: size * (0.15 + random() * 0.3),
            width: size * (0.12 + random() * 0.25),
            thickness: size * (0.08 + random() * 0.12),
          },
          [base[1], base[2]],
        );
        parts.push({
          id: `mod-${slot}-${i}-fit-${k}`,
          ...box,
          color: slotColor(slot),
          edgeAngle: 15,
        });
      }
    });
  }

  // Aplatissement et échelle s'appliquent à la structure et aux modules : ils décrivent la
  // coque, pas chaque pièce.
  for (const part of parts) {
    part.position = [
      part.position[0] * scale,
      part.position[1] * scale,
      part.position[2] * profile.flatten * scale,
    ];
  }
  // Le détail, lui, ne prend QUE l'échelle : il est déjà posé sur la surface du profil, et
  // l'aplatir une seconde fois le décollerait de la coque qu'il habille.
  for (const part of decor) {
    part.position = [
      part.position[0] * scale,
      part.position[1] * scale,
      part.position[2] * scale,
    ];
  }

  // Le décor passe en arêtes seules : c'est le partage qui rend la superstructure visible
  // au lieu de la noyer sous deux cents remplissages additifs empilés.
  const all: ShipPart[] = [
    ...parts,
    ...decor.map((part) => ({ ...part, wire: true })),
  ];
  const radius = all.reduce(
    (max, p) => Math.max(max, Math.hypot(...p.position) + 0.4 * scale),
    0.8 * scale,
  );
  return { parts: all, radius };
}
