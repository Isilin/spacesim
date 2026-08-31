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

  const groups = useMemo(() => {
    return buildBatches(stationLayout(station).parts);
    // `station` est délibérément hors des dépendances : son identité change à CHAQUE tick
    // serveur alors que la silhouette ne bouge pas, et reconstruire les géométries toutes
    // les cinq secondes réallouerait des tampons GPU pour rien. La signature primitive
    // ci-dessus capture tout ce dont la forme dépend.
  }, [signature]);

  return <HoloBatch groups={groups} />;
}
