import { CHASSIS, type ChassisDef } from "@spacesim/shared";

/**
 * Règles d'échelle et de palier partagées par les deux représentations d'un vaisseau
 * (chantier 33.4).
 *
 * Extraites de `ShipHullDiagram.tsx`, où elles étaient privées, parce que le modèle 3D en
 * a besoin des mêmes : les deux vues du même vaisseau sont côte à côte dans le concepteur
 * et doivent grandir ensemble. Deux copies de la formule auraient fini par diverger.
 */

/**
 * Plus gros tonnage du catalogue — **calculé**, pas écrit en dur. La constante valait 240
 * (le `battlecruiser`) ; un châssis plus lourd ajouté depuis l'admin (chantier 23) aurait
 * dépassé l'échelle sans que personne ne s'en aperçoive.
 */
export const MAX_TONNAGE = Math.max(
  ...Object.values(CHASSIS).map((c) => c.tonnage),
);

/**
 * Échelle d'affichage d'une coque, de 0,75 à 1,25. Bornée : une entrée de contenu à dix
 * mille tonnes ne doit pas produire un vaisseau qui sort du cadre.
 */
export function hullScale(chassis: Pick<ChassisDef, "tonnage">): number {
  return 0.75 + 0.5 * Math.min(1, chassis.tonnage / MAX_TONNAGE);
}

/**
 * Châssis au tonnage le plus élevé de sa famille — dérivé de `CHASSIS`, pas une liste
 * figée. C'est lui qui reçoit les éléments de coque supplémentaires : sans quoi
 * `scout_frame` et `standard_hull` seraient le même objet à deux tailles.
 */
export function isHeavyTier(chassisId: string): boolean {
  const chassis = CHASSIS[chassisId as keyof typeof CHASSIS];
  if (!chassis) return false;
  const siblings = Object.values(CHASSIS).filter(
    (c) => c.kind === chassis.kind,
  );
  if (siblings.length < 2) return false;
  return chassis.tonnage === Math.max(...siblings.map((c) => c.tonnage));
}
