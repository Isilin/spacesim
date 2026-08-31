import {
  CHASSIS,
  MODULES,
  type ChassisKind,
  type ModuleId,
  type ModuleRole,
  type SlotType,
} from "@spacesim/shared";
import { hullScale, isHeavyTier } from "../shipScale.js";
import { seedOf } from "./appearance.js";
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
  signature: "drill" | "ring" | "mast" | "outboard" | "none";
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

/**
 * Silhouette d'un module, dérivée de son **rôle** — huit formes, contre quatre
 * aujourd'hui.
 *
 * Le modèle porte déjà huit `ModuleRole` et seulement quatre `SlotType` ; le rendu
 * n'exploitait que les quatre. La couleur reste celle de l'emplacement — c'est la légende
 * que le diagramme 2D a déjà apprise au joueur — et la **forme** devient l'information que
 * la 3D ajoute.
 */
function moduleShapes(
  role: ModuleRole,
  size: number,
  reach: number,
): { shape: PartShape; offset: [number, number, number]; edgeAngle: number }[] {
  switch (role) {
    case "weapon":
      // Fût + culasse. La longueur du fût vient de la PORTÉE du module : un railgun
      // longue portée est visiblement plus long qu'un autocanon.
      return [
        {
          shape: {
            kind: "prism",
            rFore: size * 0.28,
            rAft: size * 0.34,
            length: size * (1 + reach * 1.6),
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
      ];
    case "defense":
      // Plaque courbe plaquée sur la coque : une ceinture de blindage, pas une excroissance.
      return [
        {
          shape: { kind: "box", size: [size * 1.6, size * 0.25, size * 1.1] },
          offset: [0, 0, 0],
          edgeAngle: 15,
        },
      ];
    case "propulsion":
      return [
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
      ];
    case "cargo":
      // La chose la plus anguleuse du vaisseau, délibérément : un conteneur se reconnaît
      // à ses arêtes.
      return [
        {
          shape: { kind: "box", size: [size * 1.5, size * 0.9, size * 0.9] },
          offset: [0, 0, 0],
          edgeAngle: 15,
        },
      ];
    case "mining":
      return [
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
      ];
    case "habitat":
      return [
        {
          shape: { kind: "sphere", radius: size * 0.6 },
          offset: [0, 0, 0],
          edgeAngle: 0,
        },
      ];
    case "sensor":
      return [
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
      ];
    case "support":
      // Grappe d'antennes de longueurs inégales : lisible même très petite.
      return [0.7, 1.1, 0.9].map((h, i) => ({
        shape: {
          kind: "box",
          size: [size * 0.12, size * 0.12, size * h],
        } as PartShape,
        offset: [(i - 1) * size * 0.3, 0, size * h * 0.5] as [
          number,
          number,
          number,
        ],
        edgeAngle: 15,
      }));
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
 * Compose un vaisseau. Toujours totale : un châssis inconnu du moteur retombe sur le
 * profil générique, un module inconnu est ignoré plutôt que de faire échouer le rendu
 * (repli obligatoire, ADR 0007).
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
    // La poutre comble l'écart laissé entre les deux sections du profil : c'est cet
    // espace vide qui fait lire « remorqueur + conteneur » plutôt qu'un fuselage continu.
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
  if (profile.signature === "outboard") {
    for (const side of [1, -1]) {
      parts.push({
        id: `pylon-${side}`,
        shape: { kind: "box", size: [0.5, 0.5, 0.06] },
        position: [-0.4, side * 0.55, 0],
        rotation: [0, 0, 0],
        color: structure,
        edgeAngle: 15,
      });
    }
  }

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
      // La graine porte le châssis ET le module : sans quoi un laser et un railgun au
      // même emplacement recevaient rigoureusement le même désordre.
      const jitter = seedOf(`${chassisId}:${moduleId}:${i}`) * 0.06;
      const size = 0.3;

      let base: [number, number, number];
      let rotation: [number, number, number] = [0, 0, 0];
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
          rotation = [0, 0, 0];
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
    });
  }

  // Aplatissement et échelle s'appliquent à l'ensemble : ils décrivent la coque, pas
  // chaque pièce.
  for (const part of parts) {
    part.position = [
      part.position[0] * scale,
      part.position[1] * scale,
      part.position[2] * profile.flatten * scale,
    ];
  }

  const radius = parts.reduce(
    (max, p) => Math.max(max, Math.hypot(...p.position) + 0.4 * scale),
    0.8 * scale,
  );
  return { parts, radius };
}
