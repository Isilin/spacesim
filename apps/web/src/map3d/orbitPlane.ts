/**
 * Rotation qui pose un cercle du plan XY sur le plan d'une orbite (chantier 50.6).
 *
 * `orbitPosition` incline d'abord autour de X, puis pivote autour de Z : `Rz(Ω)·Rx(i)`. Un
 * Euler three.js dans son ordre par défaut, `XYZ`, compose `Rx·Ry·Rz` — l'inverse : il pivote
 * d'abord le cercle sur lui-même, ce qui ne change rien à un cercle, puis l'incline autour de
 * X. Le nœud ascendant disparaissait donc de tous les anneaux d'orbite, toujours inclinés
 * autour du même axe, et un corps s'écartait jusqu'à une quarantaine d'unités de l'anneau qui
 * prétendait tracer sa route.
 *
 * L'ordre `ZYX` compose `Rz·Ry·Rx` : c'est exactement la rotation de `orbitPosition`, et
 * c'est aussi le repère dans lequel un corps tourne sur lui-même.
 */
export function orbitPlaneRotation(el: {
  inclination: number;
  ascendingNode: number;
}): [number, number, number, "ZYX"] {
  return [el.inclination, 0, el.ascendingNode, "ZYX"];
}

/**
 * Rotation qui incline l'axe d'un corps de son obliquité, dans le repère de son orbite
 * (chantier 50.7) : `Rz(nœud de l'axe)·Rx(obliquité)`, la même composition que le plan.
 */
export function obliquityRotation(spin: {
  axialTilt: number;
  axisNode: number;
}): [number, number, number, "ZYX"] {
  return [spin.axialTilt, 0, spin.axisNode, "ZYX"];
}
