import type { Station } from "@spacesim/shared";
import { seedOf } from "./appearance.js";
import { zoneColor } from "./theme.js";

/**
 * Station en géométrie paramétrique (chantier 31.21) — extrusion de la grille hexagonale
 * de croissance du chantier 26. Rien n'est autoré : la silhouette est exactement celle
 * que le joueur a bâtie, cellule par cellule (ADR 0007).
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

export function StationModel({ station }: { station: Station }) {
  return (
    <group>
      {/* Hub central : la cellule (0,0), qui n'est jamais une zone bâtie. */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[CELL * 0.9, CELL * 0.9, 1.8, 6]} />
        <meshStandardMaterial
          color="#9aa6b3"
          metalness={0.7}
          roughness={0.35}
        />
      </mesh>

      {station.zones.map((zone) => {
        const height = ZONE_HEIGHT[zone.zoneTypeId] ?? GENERIC_HEIGHT;
        const [x, y] = hexToScene(zone.q, zone.r);
        // Léger décrochement vertical dérivé de la position : une station bâtie n'est
        // pas une plaque parfaitement plane.
        const z = (seedOf(`${zone.q},${zone.r}`) - 0.5) * 0.5;
        return (
          <group key={`${zone.q},${zone.r}`} position={[x, y, z]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[CELL * 0.85, CELL * 0.85, height, 6]} />
              <meshStandardMaterial
                color={zoneColor(zone.zoneTypeId)}
                metalness={0.45}
                roughness={0.55}
              />
            </mesh>
            {/* Bras de liaison vers le hub : c'est lui qui donne à la grille son air de
                structure assemblée plutôt que de tuiles posées côte à côte. */}
            <mesh
              position={[-x / 2, -y / 2, 0]}
              rotation={[0, Math.PI / 2, Math.atan2(y, x)]}
            >
              <cylinderGeometry args={[0.12, 0.12, Math.hypot(x, y), 6]} />
              <meshStandardMaterial color="#6d7783" metalness={0.6} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
