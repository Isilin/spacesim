import type { Station } from "@spacesim/shared";
import { useMemo } from "react";
import { buildBatches, HoloBatch } from "./HoloBatch.js";
import { stationLayout } from "./stationLayout.js";

/**
 * Station en géométrie paramétrique (chantiers 31.21, 33.5, 34.5), rendue dans le registre
 * holographique fusionné par teinte (chantier 34.2).
 *
 * Ce composant ne décide **rien** : toute la forme vient de `stationLayout`, une fonction
 * pure et testée sans navigateur. La silhouette est exactement celle que le joueur a bâtie,
 * cellule par cellule (ADR 0007).
 */
export function StationModel({
  station,
  size,
}: {
  station: Station;
  /**
   * Rayon voulu dans le repère de l'appelant (chantier 35.8). `stationLayout` produit une
   * silhouette dont l'étendue dépend de ce que le joueur a bâti ; sur la carte, une station
   * doit se lire à une taille constante quel que soit son âge.
   */
  size?: number;
}) {
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

  const built = useMemo(() => {
    const layout = stationLayout(station);
    return { groups: buildBatches(layout.parts), radius: layout.radius };
    // `station` est délibérément hors des dépendances : son identité change à CHAQUE tick
    // serveur alors que la silhouette ne bouge pas, et reconstruire les géométries toutes
    // les cinq secondes réallouerait des tampons GPU pour rien. La signature primitive
    // ci-dessus capture tout ce dont la forme dépend.
  }, [signature]);

  const scale = size ? size / Math.max(0.001, built.radius) : 1;
  return (
    <group scale={scale}>
      <HoloBatch groups={built.groups} />
    </group>
  );
}
