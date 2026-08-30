import {
  CHASSIS,
  MODULES,
  SLOT_TYPES,
  type ChassisKind,
  type ModuleId,
  type SlotType,
} from "@spacesim/shared";
import { seedOf } from "./appearance.js";

/**
 * Vaisseau en géométrie paramétrique (chantier 31.20) — portage 3D de la logique de
 * `ShipHullDiagram.tsx`. Rien n'est autoré : la coque vient du `ChassisKind`, les
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

/** Couleur et forme d'excroissance par type d'emplacement. */
const SLOT_LOOK: Record<SlotType, { color: string; length: number }> = {
  weapon: { color: "#f85149", length: 1.1 },
  defense: { color: "#4fc1ff", length: 0.5 },
  propulsion: { color: "#e0b64f", length: 0.9 },
  utility: { color: "#b48fe0", length: 0.6 },
};

export function ShipModel({
  chassisId,
  modules,
}: {
  chassisId: string;
  modules: ModuleId[];
}) {
  const chassis = CHASSIS[chassisId as keyof typeof CHASSIS];
  const [length, width, height] = chassis
    ? (HULLS[chassis.kind] ?? GENERIC_HULL)
    : GENERIC_HULL;

  // Modules groupés par emplacement : chaque groupe se pose sur une face de la coque.
  const bySlot = new Map<SlotType, number>();
  for (const id of modules) {
    const def = MODULES[id as keyof typeof MODULES];
    if (!def) continue;
    bySlot.set(def.slot, (bySlot.get(def.slot) ?? 0) + 1);
  }

  return (
    <group>
      {/* Coque : un fuselage effilé vers l'avant, proportionné par la classe. */}
      <mesh rotation={[0, 0, -Math.PI / 2]}>
        <cylinderGeometry args={[width * 0.35, width * 0.55, length, 12]} />
        <meshStandardMaterial
          color="#8d99a6"
          metalness={0.6}
          roughness={0.45}
        />
      </mesh>
      {/* Proue */}
      <mesh position={[length * 0.62, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[width * 0.35, length * 0.35, 12]} />
        <meshStandardMaterial color="#a7b3c0" metalness={0.6} roughness={0.4} />
      </mesh>

      {SLOT_TYPES.map((slot, slotIndex) => {
        const count = bySlot.get(slot) ?? 0;
        const look = SLOT_LOOK[slot];
        return Array.from({ length: count }, (_, i) => {
          // Répartition déterministe : deux plans identiques donnent le même vaisseau.
          const side = i % 2 === 0 ? 1 : -1;
          const along =
            length * (0.3 - 0.16 * Math.floor(i / 2)) -
            slotIndex * length * 0.12;
          const jitter = seedOf(`${slot}:${i}`) * 0.1;
          return (
            <mesh
              key={`${slot}-${i}`}
              position={[
                along,
                side * (width * 0.55 + jitter),
                height * 0.1 * side,
              ]}
              rotation={[0, 0, -Math.PI / 2]}
            >
              <capsuleGeometry args={[width * 0.14, look.length, 4, 8]} />
              <meshStandardMaterial
                color={look.color}
                metalness={0.4}
                roughness={0.5}
              />
            </mesh>
          );
        });
      })}
    </group>
  );
}
