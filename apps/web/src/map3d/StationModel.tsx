import type { Station } from "@spacesim/shared";
import { useMemo } from "react";
import { type BufferGeometry, CylinderGeometry } from "three";
import { seedOf } from "./appearance.js";
import { HoloClock, HoloPart } from "./HoloPart.js";
import { structureColor, zoneColor } from "./theme.js";

/**
 * Station en géométrie paramétrique (chantier 31.21), rendue dans le registre
 * holographique (chantier 33.3) — extrusion de la grille hexagonale de croissance du
 * chantier 26. Rien n'est autoré : la silhouette est exactement celle que le joueur a
 * bâtie, cellule par cellule (ADR 0007).
 */

/** Rayon d'une cellule hexagonale dans la scène. */
const CELL = 1;

/**
 * Hauteur d'extrusion par type de zone. La COULEUR ne vit plus ici : elle vient du même
 * hachage que le diagramme 2D (chantier 33.2, `zonePalette.ts`) — une table par id rendait
 * grise en 3D toute zone créée par un administrateur, alors qu'elle est colorée en 2D.
 * Le repli garde une entrée inconnue visible plutôt que de la faire disparaître.
 */
const ZONE_HEIGHT: Record<string, number> = {
  industrial_zone: 1.4,
  science_zone: 1.1,
  military_zone: 0.9,
  commercial_zone: 1.2,
};

const GENERIC_HEIGHT = 1;

/**
 * Coordonnées axiales → cartésiennes, disposition « pointy-top » : la même que celle du
 * diagramme 2D, sans quoi la station 3D ne ressemblerait pas à ce que le joueur édite.
 */
function hexToScene(q: number, r: number): [number, number] {
  return [CELL * Math.sqrt(3) * (q + r / 2) * 1.05, CELL * 1.5 * r * 1.05];
}

/** Une pièce prête à rendre : géométrie construite, teinte résolue, pose figée. */
interface Piece {
  key: string;
  geometry: BufferGeometry;
  color: string;
  position: [number, number, number];
  rotation: [number, number, number];
}

export function StationModel({ station }: { station: Station }) {
  // Mémoïsé sur une signature PRIMITIVE des zones : `station` est un objet neuf à chaque
  // tick serveur, et les géométries seraient réallouées sur le GPU toutes les cinq
  // secondes alors que la silhouette n'a pas bougé.
  const zoneKey = station.zones
    .map((z) => `${z.zoneTypeId}@${z.q},${z.r}`)
    .join("|");
  const pieces = useMemo<Piece[]>(() => {
    const out: Piece[] = [
      {
        key: "hub",
        // Le moyeu : la cellule (0,0), qui n'est jamais une zone bâtie.
        geometry: new CylinderGeometry(CELL * 0.9, CELL * 0.9, 1.8, 6),
        color: structureColor(),
        position: [0, 0, 0],
        rotation: [Math.PI / 2, 0, 0],
      },
    ];

    for (const entry of zoneKey ? zoneKey.split("|") : []) {
      const [zoneTypeId, cell] = entry.split("@");
      const [q, r] = cell!.split(",").map(Number) as [number, number];
      const height = ZONE_HEIGHT[zoneTypeId!] ?? GENERIC_HEIGHT;
      const [x, y] = hexToScene(q, r);
      // Léger décrochement vertical dérivé de la position : une station bâtie n'est pas
      // une plaque parfaitement plane.
      const z = (seedOf(`${q},${r}`) - 0.5) * 0.5;

      out.push({
        key: `zone-${q},${r}`,
        geometry: new CylinderGeometry(CELL * 0.85, CELL * 0.85, height, 6),
        color: zoneColor(zoneTypeId!),
        position: [x, y, z],
        rotation: [Math.PI / 2, 0, 0],
      });
      out.push({
        // Bras de liaison vers le moyeu : c'est lui qui donne à la grille son air de
        // structure assemblée plutôt que de tuiles posées côte à côte.
        key: `strut-${q},${r}`,
        geometry: new CylinderGeometry(0.12, 0.12, Math.hypot(x, y), 6),
        color: structureColor(),
        position: [x / 2, y / 2, z],
        rotation: [0, Math.PI / 2, Math.atan2(y, x)],
      });
    }
    return out;
  }, [zoneKey]);

  return (
    <group>
      <HoloClock />
      {pieces.map((piece) => (
        <HoloPart
          key={piece.key}
          geometry={piece.geometry}
          color={piece.color}
          position={piece.position}
          rotation={piece.rotation}
        />
      ))}
    </group>
  );
}
