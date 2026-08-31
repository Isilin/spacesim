import type { ModuleId } from "@spacesim/shared";
import { useMemo } from "react";
import { buildBatches, HoloBatch } from "./HoloBatch.js";
import { shipLayout } from "./shipLayout.js";

/**
 * Vaisseau en géométrie paramétrique (chantiers 31.20, 33.4, 34.4), rendu dans le registre
 * holographique fusionné par teinte (chantier 34.2).
 *
 * Ce composant ne décide **rien** : toute la forme vient de `shipLayout`, une fonction pure
 * et testée sans navigateur (ADR 0013). Il ne fait que la fusionner et la poser.
 */
export function ShipModel({
  chassisId,
  modules,
}: {
  chassisId: string;
  modules: ModuleId[];
}) {
  // Mémoïsé sur des PRIMITIVES et non sur le tableau de modules : son identité change à
  // chaque rendu du concepteur, et les géométries seraient réallouées sur le GPU à chaque
  // frappe dans un champ voisin.
  const moduleKey = modules.join(",");
  const groups = useMemo(
    () =>
      buildBatches(
        shipLayout(chassisId, moduleKey ? moduleKey.split(",") : []).parts,
      ),
    [chassisId, moduleKey],
  );

  return <HoloBatch groups={groups} />;
}
