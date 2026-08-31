import {
  CHASSIS,
  MODULES,
  SLOT_TYPES,
  type ChassisKind,
  type ModuleId,
  type SlotType,
} from "@spacesim/shared";
import { useMemo } from "react";
import {
  type BufferGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
} from "three";
import { seedOf } from "./appearance.js";
import { HoloClock, HoloPart } from "./HoloPart.js";
import { slotColor, structureColor } from "./theme.js";

/**
 * Vaisseau en géométrie paramétrique (chantier 31.20), rendu dans le registre
 * holographique (chantier 33.3). Rien n'est autoré : la coque vient du `ChassisKind`, les
 * excroissances des modules réellement montés. Le vaisseau ressemble donc au plan que le
 * joueur a conçu, ce qu'un pack de modèles aurait fait perdre (ADR 0007).
 */

/** Proportions de coque par classe de châssis : longueur, largeur, hauteur. */
const HULLS: Record<ChassisKind, [number, number, number]> = {
  generic: [3, 1, 0.8],
  military: [3.4, 0.9, 0.7],
  freighter: [3, 1.7, 1.5],
  miner: [2.4, 1.5, 1.3],
  colonizer: [3.2, 1.4, 1.4],
  explorer: [2.8, 0.8, 0.6],
};

const GENERIC_HULL = HULLS.generic;

/**
 * Longueur d'excroissance par type d'emplacement. La COULEUR ne vit plus ici : elle vient
 * des jetons de thème (chantier 33.2), les mêmes que ceux du diagramme 2D. Les deux vues
 * du même vaisseau sont côte à côte à l'écran et se contredisaient — la propulsion était
 * ambre ici et verte là, l'utilitaire violet ici et ambre là.
 */
const SLOT_LENGTH: Record<SlotType, number> = {
  weapon: 1.1,
  defense: 0.5,
  propulsion: 0.9,
  utility: 0.6,
};

/** Une pièce prête à rendre : géométrie construite, teinte résolue, pose figée. */
interface Piece {
  key: string;
  geometry: BufferGeometry;
  color: string;
  position: [number, number, number];
  rotation: [number, number, number];
  edgeAngle: number;
}

export function ShipModel({
  chassisId,
  modules,
}: {
  chassisId: string;
  modules: ModuleId[];
}) {
  // Mémoïsé sur des PRIMITIVES et non sur le tableau de modules : son identité change à
  // chaque rendu du concepteur, et les géométries seraient reconstruites — donc
  // réallouées sur le GPU — à chaque frappe dans un champ voisin.
  const moduleKey = modules.join(",");
  const pieces = useMemo<Piece[]>(() => {
    const chassis = CHASSIS[chassisId as keyof typeof CHASSIS];
    const [length, width, height] = chassis
      ? (HULLS[chassis.kind] ?? GENERIC_HULL)
      : GENERIC_HULL;
    const mounted = moduleKey ? (moduleKey.split(",") as ModuleId[]) : [];

    // Modules groupés par emplacement : chaque groupe se pose sur une face de la coque.
    const bySlot = new Map<SlotType, number>();
    for (const id of mounted) {
      const def = MODULES[id as keyof typeof MODULES];
      if (!def) continue;
      bySlot.set(def.slot, (bySlot.get(def.slot) ?? 0) + 1);
    }

    const out: Piece[] = [
      {
        key: "hull",
        // Fuselage effilé vers l'avant, proportionné par la classe.
        geometry: new CylinderGeometry(width * 0.35, width * 0.55, length, 12),
        color: structureColor(),
        position: [0, 0, 0],
        rotation: [0, 0, -Math.PI / 2],
        edgeAngle: 18,
      },
      {
        key: "prow",
        geometry: new ConeGeometry(width * 0.35, length * 0.35, 12),
        color: structureColor(),
        position: [length * 0.62, 0, 0],
        rotation: [0, 0, -Math.PI / 2],
        edgeAngle: 18,
      },
    ];

    SLOT_TYPES.forEach((slot, slotIndex) => {
      const count = bySlot.get(slot) ?? 0;
      const growth = SLOT_LENGTH[slot];
      for (let i = 0; i < count; i++) {
        // Répartition déterministe : deux plans identiques donnent le même vaisseau.
        const side = i % 2 === 0 ? 1 : -1;
        const along =
          length * (0.3 - 0.16 * Math.floor(i / 2)) - slotIndex * length * 0.12;
        const jitter = seedOf(`${chassisId}:${slot}:${i}`) * 0.1;
        out.push({
          key: `${slot}-${i}`,
          geometry: new CapsuleGeometry(width * 0.14, growth, 4, 8),
          color: slotColor(slot),
          position: [
            along,
            side * (width * 0.55 + jitter),
            height * 0.1 * side,
          ],
          rotation: [0, 0, -Math.PI / 2],
          // Une capsule est lissée : la passe d'arêtes y dégénérerait en fil de fer.
          edgeAngle: 0,
        });
      }
    });
    return out;
  }, [chassisId, moduleKey]);

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
          edgeAngle={piece.edgeAngle}
        />
      ))}
    </group>
  );
}
