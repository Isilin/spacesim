import type { ModuleId } from "@spacesim/shared";
import { useMemo } from "react";
import { HoloClock, HoloPart } from "./HoloPart.js";
import { buildGeometry } from "./partGeometry.js";
import { shipLayout } from "./shipLayout.js";

/**
 * Vaisseau en géométrie paramétrique (chantiers 31.20, 33.4), rendu dans le registre
 * holographique (chantier 33.3).
 *
 * Ce composant ne décide plus **rien** : toute la forme vient de `shipLayout`, une
 * fonction pure et testée sans navigateur. Il ne fait que construire les géométries et les
 * poser (ADR 0013).
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
  const pieces = useMemo(() => {
    const layout = shipLayout(chassisId, moduleKey ? moduleKey.split(",") : []);
    return layout.parts.map((part) => ({
      part,
      geometry: buildGeometry(part.shape),
    }));
  }, [chassisId, moduleKey]);

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
          emissive={part.emissive}
        />
      ))}
    </group>
  );
}
