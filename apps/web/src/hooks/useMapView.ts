import type { Universe } from "@spacesim/shared";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { AnchorPath } from "../map3d/MapScene.js";
import { buildUniverseIndex } from "../state/selectors.js";

export interface MapView {
  /** Ce que la caméra vise, résolu en chemin complet. */
  anchor: AnchorPath;
  /** Profondeur de zoom, continue. `null` quand l'URL n'en porte pas. */
  depth: number | null;
  /** Élément dont la fiche est ouverte, s'il y en a un. */
  open: string | null;
}

const NOWHERE: AnchorPath = { galaxyId: null, systemId: null, bodyId: null };

/**
 * État de la carte porté par l'URL (chantier 35.3), `/map?at=<id>&z=<profondeur>&open=<id>`.
 *
 * Remplace `useMapLevel`, qui dérivait un niveau — `universe | galaxy | system | body` —
 * d'une hiérarchie de segments de chemin. Il n'y a plus de niveaux : la vue est un point
 * visé et une profondeur réelle, et c'est cela que l'URL doit décrire pour qu'un lien
 * profond rende la même image. Une hiérarchie de chemin ne sait pas dire « à mi-chemin
 * entre la galaxie et le système ».
 *
 * `at` désigne n'importe quel objet — galaxie, système, corps — et l'index en déduit le
 * chemin complet ; le joueur n'a donc pas à composer une URL à trois segments pour viser
 * une lune.
 */
export function useMapView(universe: Universe): MapView {
  const [params] = useSearchParams();
  const at = params.get("at");
  const z = params.get("z");
  const open = params.get("open");

  const index = useMemo(() => buildUniverseIndex(universe), [universe]);

  const anchor = at ? (index.get(at) ?? NOWHERE) : NOWHERE;
  const parsed = z === null ? Number.NaN : Number.parseFloat(z);
  const depth = Number.isFinite(parsed) ? parsed : null;

  return { anchor, depth, open };
}
