import type { Station } from "@spacesim/shared";
import { useMemo } from "react";
import { HoloClock, HoloPart } from "./HoloPart.js";
import { buildGeometry } from "./partGeometry.js";
import { stationLayout } from "./stationLayout.js";

/**
 * Station en géométrie paramétrique (chantiers 31.21, 33.5), rendue dans le registre
 * holographique (chantier 33.3).
 *
 * Ce composant ne décide plus rien : toute la forme vient de `stationLayout`, une fonction
 * pure et testée sans navigateur. La silhouette est exactement celle que le joueur a
 * bâtie, cellule par cellule (ADR 0007).
 */
export function StationModel({ station }: { station: Station }) {
  // Mémoïsé sur une signature PRIMITIVE : `station` est un objet neuf à chaque tick
  // serveur, et les géométries seraient réallouées sur le GPU toutes les cinq secondes
  // alors que la silhouette n'a pas bougé.
  const signature = [
    station.zones.map((z) => `${z.zoneTypeId}@${z.q},${z.r}`).join("|"),
    station.zoneQueue.map((z) => `${z.zoneTypeId}@${z.q},${z.r}`).join("|"),
    Object.entries(station.installations)
      .map(([id, n]) => `${id}=${n}`)
      .sort()
      .join("|"),
  ].join("#");

  const pieces = useMemo(() => {
    const layout = stationLayout(station);
    return layout.parts.map((part) => ({
      part,
      geometry: buildGeometry(part.shape),
    }));
    // `station` est délibérément hors des dépendances : son identité change à CHAQUE tick
    // serveur alors que la silhouette ne bouge pas, et reconstruire les géométries toutes
    // les cinq secondes réallouerait des tampons GPU pour rien. La signature primitive
    // ci-dessus capture tout ce dont la forme dépend.
  }, [signature]);

  return (
    <group>
      <HoloClock />
      {pieces.map(({ part, geometry }) => (
        <HoloPart
          key={part.id}
          geometry={geometry}
          color={part.color}
          position={part.position}
          rotation={part.rotation}
          edgeAngle={part.edgeAngle}
          ghost={part.ghost}
        />
      ))}
    </group>
  );
}
