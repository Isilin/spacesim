import { IcosahedronGeometry, type BufferGeometry } from "three";
import { seedOf } from "./appearance.js";

/**
 * Silhouettes de rochers (chantier 35.10).
 *
 * Une ceinture était quatre-vingt-dix fois le même icosaèdre, à des tailles différentes :
 * de près, la répétition sautait aux yeux. Les sommets sont ici déplacés le long de leur
 * normale par un bruit tiré d'une graine, ce qui donne des cailloux réellement distincts
 * sans coûter une géométrie par rocher — trois variantes suffisent à casser le motif, et
 * l'instanciation reste possible.
 *
 * Fonction pure sur une `BufferGeometry`, donc testable sans contexte WebGL : même doctrine
 * que `shipLayout` et `HoloBatch` (ADR 0013).
 */

/** Variantes distinctes tirées par ceinture. Au-delà, l'œil ne fait plus la différence. */
export const ASTEROID_SHAPES = 3;

/**
 * Amplitude du déplacement, en part du rayon. Assez pour qu'un caillou soit anguleux,
 * pas au point qu'il cesse d'être convexe et se replie sur lui-même.
 */
const RELIEF = 0.34;

export function asteroidGeometry(seed: string, radius: number): BufferGeometry {
  // Aucune subdivision : douze sommets, vingt faces. Un niveau de plus quadruplait le
  // compte de triangles d'une ceinture — mesuré au chantier 35.10, le palier système
  // tombait de 55 à 42 images par seconde — pour une silhouette qu'on veut justement
  // taillée à la serpe. Un astéroïde n'a pas à être lisse.
  const geometry = new IcosahedronGeometry(radius, 0);
  const position = geometry.getAttribute("position");

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const length = Math.hypot(x, y, z) || 1;
    // Graine dérivée de la POSITION arrondie et non de l'index : deux sommets partagés par
    // plusieurs faces doivent se déplacer ensemble, sinon la maille se déchire.
    const key = `${seed}:${Math.round(x * 97)}:${Math.round(y * 97)}:${Math.round(z * 97)}`;
    const scale = 1 + (seedOf(key) - 0.5) * 2 * RELIEF;
    position.setXYZ(
      i,
      (x / length) * radius * scale,
      (y / length) * radius * scale,
      (z / length) * radius * scale,
    );
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}
