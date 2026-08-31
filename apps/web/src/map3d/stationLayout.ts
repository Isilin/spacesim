import {
  areAdjacent,
  hexKey,
  INSTALLATIONS,
  type Station,
} from "@spacesim/shared";
import { seedOf } from "./appearance.js";
import {
  antennaCluster,
  decorateSection,
  type DetailPart,
  radiatorFins,
  ribs,
  type Section,
} from "./greeble.js";
import type { PartShape } from "./shipLayout.js";
import { ghostColor, structureColor, zoneColor } from "./theme.js";

/**
 * Composition géométrique d'une station (chantier 33.5) — **fonction pure**, aucune
 * dépendance à three.js ni au DOM, comme `shipLayout` (ADR 0013).
 *
 * Convention d'axes : la grille hexagonale est dans le plan `xy`, l'extrusion suit `z`.
 */

export interface StationPart {
  id: string;
  shape: PartShape;
  position: [number, number, number];
  rotation: [number, number, number];
  color: string;
  /** Pièce provisoire — une zone en file de construction. Arêtes seules, pas de faces. */
  ghost?: boolean;
  /** Décor : arêtes seules, sans remplissage (chantier 34.5). */
  wire?: boolean;
  edgeAngle: number;
}

export interface StationLayout {
  parts: StationPart[];
  radius: number;
}

/** Rayon d'une cellule dans la scène. */
const CELL = 1;

/**
 * Espacement des cellules. Relevé de 1,05 à 1,18 au chantier 33.5 : les coursives entre
 * zones voisines n'avaient aucune place où exister quand les prismes se touchaient.
 */
const SPACING = 1.18;

/**
 * Silhouette par type de zone — pas seulement une hauteur d'extrusion.
 *
 * Seule la FORME est indexée par identifiant ; la couleur passe par le hachage partagé
 * avec le diagramme 2D. Un type de zone créé depuis l'admin (chantier 23) reçoit donc une
 * couleur juste et une forme générique, jamais un trou.
 */
interface ZoneShape {
  height: number;
  sides: number;
  /** Rayon du sommet rapporté à celui de la base : < 1 = tronqué, 1 = droit. */
  taper: number;
  /** Accessoires de silhouette propres au type. */
  extras: "tanks" | "dish" | "turrets" | "arms" | "none";
}

const ZONE_SHAPES: Record<string, ZoneShape> = {
  industrial_zone: { height: 1.4, sides: 6, taper: 1, extras: "tanks" },
  science_zone: { height: 1.9, sides: 8, taper: 0.55, extras: "dish" },
  military_zone: { height: 1, sides: 6, taper: 0.7, extras: "turrets" },
  commercial_zone: { height: 0.8, sides: 6, taper: 1, extras: "arms" },
};

const GENERIC_ZONE: ZoneShape = {
  height: 1,
  sides: 6,
  taper: 1,
  extras: "none",
};

/**
 * Coordonnées axiales → cartésiennes, disposition « pointy-top » : la même que celle du
 * diagramme 2D, sans quoi la station 3D ne ressemblerait pas à ce que le joueur édite.
 */
export function hexToScene(q: number, r: number): [number, number] {
  return [
    CELL * Math.sqrt(3) * (q + r / 2) * SPACING,
    CELL * 1.5 * r * SPACING,
  ];
}

/** Décrochement vertical d'une cellule : une station bâtie n'est pas une plaque plane. */
function cellLift(q: number, r: number): number {
  return (seedOf(`${q},${r}`) - 0.5) * 0.5;
}

/** Accessoires de silhouette accrochés au sommet d'une zone. */
function zoneExtras(
  shape: ZoneShape,
  color: string,
  q: number,
  r: number,
  base: [number, number, number],
): StationPart[] {
  const top = base[2] + shape.height / 2;
  const rTop = CELL * 0.85 * shape.taper;
  switch (shape.extras) {
    case "tanks":
      return [1, -1].map((side) => ({
        id: `tank-${q},${r}-${side}`,
        shape: { kind: "capsule", radius: 0.16, length: 0.5 },
        position: [base[0] + side * 0.55, base[1], top + 0.2],
        rotation: [Math.PI / 2, 0, 0],
        color,
        edgeAngle: 0,
      }));
    case "dish":
      return [
        {
          id: `dish-${q},${r}`,
          shape: { kind: "cone", radius: 0.42, height: 0.24, sides: 10 },
          position: [base[0], base[1], top + 0.24],
          rotation: [0, 0, 0],
          color,
          edgeAngle: 0,
        },
      ];
    case "turrets":
      return [1, -1].map((side) => ({
        id: `turret-${q},${r}-${side}`,
        shape: { kind: "box", size: [0.22, 0.22, 0.4] },
        position: [base[0] + side * rTop * 0.7, base[1], top + 0.2],
        rotation: [0, 0, 0],
        color,
        edgeAngle: 15,
      }));
    case "arms":
      return [0, 1, 2, 3].map((i) => {
        const angle = (i * Math.PI) / 2;
        return {
          id: `arm-${q},${r}-${i}`,
          shape: { kind: "torus", radius: 0.2, tube: 0.05, segments: 6 },
          position: [
            base[0] + Math.cos(angle) * 0.75,
            base[1] + Math.sin(angle) * 0.75,
            top,
          ],
          rotation: [0, 0, 0],
          color,
          edgeAngle: 0,
        };
      });
    case "none":
      return [];
  }
}

/**
 * Répartit les installations bâties sur les zones du type correspondant.
 *
 * **C'est une dérivation de rendu, pas une donnée.** `Station.installations` est un compte
 * par type à l'échelle de la station : aucune donnée ne dit quelle zone héberge quoi, et
 * `installQueue` n'a même pas de position. La répartition est déterministe (zones triées
 * par clé hexagonale, distribution en tourniquet) et **conservative** : rien n'est jamais
 * perdu — une installation sans zone d'accueil se pose sur le moyeu plutôt que de
 * disparaître (ADR 0013).
 */
function fixtures(station: Station): StationPart[] {
  const parts: StationPart[] = [];
  const zonesByType = new Map<string, { q: number; r: number }[]>();
  for (const zone of station.zones) {
    const list = zonesByType.get(zone.zoneTypeId) ?? [];
    list.push({ q: zone.q, r: zone.r });
    zonesByType.set(zone.zoneTypeId, list);
  }
  // Tri par clé hexagonale et non par ordre de construction : les accessoires ne doivent
  // pas se téléporter si le tableau des zones est un jour réordonné.
  for (const list of zonesByType.values()) {
    list.sort((a, b) => hexKey(a.q, a.r).localeCompare(hexKey(b.q, b.r)));
  }

  for (const [installationId, rawCount] of Object.entries(
    station.installations,
  )) {
    const count = Math.floor(rawCount ?? 0);
    if (count <= 0) continue;
    const def = INSTALLATIONS[installationId as keyof typeof INSTALLATIONS];
    const hosts = def ? (zonesByType.get(def.zoneType) ?? []) : [];
    for (let i = 0; i < count; i++) {
      const host = hosts.length > 0 ? hosts[i % hosts.length]! : null;
      const [hx, hy] = host ? hexToScene(host.q, host.r) : [0, 0];
      const lift = host ? cellLift(host.q, host.r) : 0;
      const shapeDef = host
        ? (ZONE_SHAPES[def!.zoneType] ?? GENERIC_ZONE)
        : GENERIC_ZONE;
      // Réparties sur la couronne supérieure de la zone hôte, position dérivée du rang.
      const angle =
        (Math.floor(i / Math.max(1, hosts.length)) * Math.PI) / 3 +
        seedOf(installationId) * 0.6;
      parts.push({
        id: `fixture-${installationId}-${i}`,
        shape: { kind: "box", size: [0.24, 0.24, 0.34] },
        position: [
          hx + Math.cos(angle) * 0.45,
          hy + Math.sin(angle) * 0.45,
          lift + shapeDef.height / 2 + 0.2,
        ],
        rotation: [0, 0, 0],
        color: host ? zoneColor(def!.zoneType) : structureColor(),
        edgeAngle: 15,
      });
    }
  }
  return parts;
}

/** Compose une station. Toujours totale : un type de zone inconnu rend une forme neutre. */
/** Budget de pièces décoratives par zone bâtie, et pour le moyeu (ADR 0014). */
const ZONE_DETAIL_BUDGET = 34;
const HUB_DETAIL_BUDGET = 28;

export function stationLayout(station: Station): StationLayout {
  const structure = structureColor();
  // Tenu à part : le décor passe en arêtes seules, sans remplissage. Deux cents volumes
  // translucides empilés en additif ne rendent pas deux cents détails, ils rendent un
  // nuage lumineux qui avale la silhouette (chantier 34.2).
  const decor: DetailPart[] = [];
  const parts: StationPart[] = [
    {
      id: "hub-core",
      // Le moyeu : la cellule (0,0), qui n'est jamais une zone bâtie.
      shape: {
        kind: "prism",
        rFore: CELL * 0.9,
        rAft: CELL * 0.9,
        length: 1.8,
        sides: 6,
      },
      position: [0, 0, 0],
      rotation: [Math.PI / 2, 0, 0],
      color: structure,
      edgeAngle: 18,
    },
    {
      id: "hub-spindle",
      shape: { kind: "prism", rFore: 0.18, rAft: 0.28, length: 2.6, sides: 6 },
      position: [0, 0, 0],
      rotation: [Math.PI / 2, 0, 0],
      color: structure,
      edgeAngle: 18,
    },
  ];

  const built = station.zones.map((z) => ({ ...z, ghost: false }));
  const queued = station.zoneQueue.map((z) => ({
    zoneTypeId: z.zoneTypeId,
    q: z.q,
    r: z.r,
    ghost: true,
  }));

  for (const zone of [...built, ...queued]) {
    const shape = ZONE_SHAPES[zone.zoneTypeId] ?? GENERIC_ZONE;
    const [x, y] = hexToScene(zone.q, zone.r);
    const z = cellLift(zone.q, zone.r);
    const color = zone.ghost ? ghostColor() : zoneColor(zone.zoneTypeId);
    parts.push({
      id: `zone-${zone.q},${zone.r}`,
      shape: {
        kind: "prism",
        rFore: CELL * 0.85 * shape.taper,
        rAft: CELL * 0.85,
        length: shape.height,
        sides: shape.sides,
      },
      position: [x, y, z],
      rotation: [Math.PI / 2, 0, 0],
      color,
      ghost: zone.ghost,
      edgeAngle: 18,
    });
    // Les accessoires de silhouette n'apparaissent qu'une fois la zone BÂTIE : une zone
    // en file est une intention, pas encore une structure.
    if (!zone.ghost) {
      parts.push(...zoneExtras(shape, color, zone.q, zone.r, [x, y, z]));

      // Étage en redan : une tour à un seul niveau lit comme un plot. Le décrochement
      // suffit à en faire un bâtiment (chantier 34.5).
      parts.push({
        id: `zone-tier-${zone.q},${zone.r}`,
        shape: {
          kind: "prism",
          rFore: CELL * 0.52 * shape.taper,
          rAft: CELL * 0.66 * shape.taper,
          length: shape.height * 0.45,
          sides: shape.sides,
        },
        position: [x, y, z + shape.height * 0.72],
        rotation: [Math.PI / 2, 0, 0],
        color,
        edgeAngle: 18,
      });

      const section: Section = {
        axis: "z",
        from: z - shape.height / 2,
        to: z + shape.height / 2,
        rFrom: CELL * 0.85,
        rTo: CELL * 0.85 * shape.taper,
        sides: shape.sides,
        offset: [x, y],
      };
      decor.push(
        ...decorateSection(
          section,
          ZONE_DETAIL_BUDGET,
          color,
          `${zone.zoneTypeId}:${zone.q},${zone.r}`,
          `zone-${zone.q},${zone.r}`,
        ),
      );
      // Radiateurs sur un flanc : la même lame plate qui sert aux vaisseaux.
      decor.push(
        ...radiatorFins(
          "z",
          [x + CELL * 0.8, y, z],
          5,
          shape.height * 0.7,
          0.22,
          color,
          `zone-${zone.q},${zone.r}-rad`,
        ),
      );
    }
  }

  // ── Coursives entre cellules voisines ──────────────────────────────────────
  // Une coursive par PAIRE de cellules occupées qui se touchent, dédupliquée. Le moyeu
  // compte comme une cellule : c'est ce qui rattache la première couronne.
  const cells = [
    { q: 0, r: 0, hub: true },
    ...built.map((z) => ({ ...z, hub: false })),
  ];
  const linked = new Set<string>();
  for (const a of cells) {
    for (const b of cells) {
      if (a === b || !areAdjacent(a, b)) continue;
      const key = [hexKey(a.q, a.r), hexKey(b.q, b.r)].sort().join("~");
      if (linked.has(key)) continue;
      linked.add(key);
      const [ax, ay] = hexToScene(a.q, a.r);
      const [bx, by] = hexToScene(b.q, b.r);
      const az = a.hub ? 0 : cellLift(a.q, a.r);
      const bz = b.hub ? 0 : cellLift(b.q, b.r);
      parts.push({
        id: `corridor-${key}`,
        shape: {
          kind: "prism",
          rFore: 0.13,
          rAft: 0.13,
          length: Math.hypot(bx - ax, by - ay, bz - az),
          sides: 6,
        },
        position: [(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2],
        rotation: [0, Math.PI / 2, Math.atan2(by - ay, bx - ax)],
        color: structure,
        edgeAngle: 18,
      });
      // Un tube nu est la pièce la moins lisible du catalogue : aucune arête transverse,
      // donc aucune longueur visible. Les anneaux la lui rendent.
      decor.push(
        ...ribs(
          [ax, ay, az],
          [bx, by, bz],
          4,
          0.17,
          6,
          structure,
          // Surtout PAS `corridor-…` : le compte des coursives se filtre sur ce préfixe,
          // et les anneaux s'y seraient glissés en gonflant silencieusement le résultat.
          `link-${key}`,
        ),
      );
    }
  }

  // ── Moyeu ──────────────────────────────────────────────────────────────────
  const hubSection: Section = {
    axis: "z",
    from: -0.9,
    to: 0.9,
    rFrom: CELL * 0.9,
    rTo: CELL * 0.9,
    sides: 6,
    offset: [0, 0],
  };
  decor.push(
    ...decorateSection(
      hubSection,
      HUB_DETAIL_BUDGET,
      structure,
      `${station.id}:hub`,
      "hub",
    ),
  );
  decor.push(
    ...antennaCluster(
      [0, 0, 1.3],
      6,
      0.45,
      structure,
      `${station.id}:ant`,
      "hub",
    ),
  );

  parts.push(...fixtures(station));

  const all: StationPart[] = [
    ...parts,
    ...decor.map((part) => ({ ...part, wire: true })),
  ];
  const radius = all.reduce(
    (max, p) => Math.max(max, Math.hypot(...p.position) + 0.9),
    1.6,
  );
  return { parts: all, radius };
}
