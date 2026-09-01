/**
 * Cadrage d'une scène sur son contenu réel (correctif de rendu du chantier 31).
 *
 * Les trois vues cadraient depuis les constantes de génération (`MAP_WIDTH`,
 * `GALAXY_SPACING`) et visaient toujours l'origine. Or le générateur ne remplit pas son
 * pavé : quatre galaxies occupent une fraction de l'amas théorique, quatorze systèmes se
 * groupent dans un coin des 1000×700. La caméra était donc à la fois trop loin et
 * pointée à côté — la moitié des objets tombaient hors champ.
 */

export interface Focus {
  /**
   * Identité de la scène cadrée. Sert de clé de recadrage : deux systèmes de même
   * étendue donneraient sinon un `Focus` numériquement identique, et la caméra
   * garderait l'orientation prise dans le précédent.
   */
  id: string;
  center: [number, number, number];
  /** Rayon de la sphère englobante, marge des objets comprise. */
  radius: number;
  /**
   * Demi-dimensions de la boîte englobante. Le cadrage réel s'appuie dessus et non sur
   * `radius` : le contenu des cartes est un disque très aplati, vu obliquement. Cadrer
   * sa sphère englobante reculait la caméra pour tenir une hauteur que la scène n'a
   * jamais — d'où une moitié d'image vide sous la grille.
   */
  half: [number, number, number];
}

/**
 * Sphère englobante d'un nuage de points. `pad` est le rayon des objets posés à ces
 * points : sans lui, un objet centré au bord serait coupé en deux par le cadrage.
 */
export function focusOf(
  id: string,
  points: readonly [number, number, number][],
  pad: number,
  minRadius: number,
): Focus {
  if (points.length === 0)
    return {
      id,
      center: [0, 0, 0],
      radius: minRadius,
      half: [minRadius, minRadius, minRadius],
    };

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const [x, y, z] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  const center: [number, number, number] = [
    (minX + maxX) / 2,
    (minY + maxY) / 2,
    (minZ + maxZ) / 2,
  ];
  // Rayon depuis le centre de la boîte, pas demi-diagonale : la boîte est très aplatie
  // en z, prendre la diagonale reculerait la caméra pour cadrer du vide.
  let radius = 0;
  for (const [x, y, z] of points) {
    radius = Math.max(
      radius,
      Math.hypot(x - center[0], y - center[1], z - center[2]),
    );
  }
  const half: [number, number, number] = [
    (maxX - minX) / 2 + pad,
    (maxY - minY) / 2 + pad,
    (maxZ - minZ) / 2 + pad,
  ];
  const floor = minRadius / Math.SQRT2;
  return {
    id,
    center,
    radius: Math.max(minRadius, radius + pad),
    // Plancher sur chaque axe : une galaxie à un seul système, ou un amas parfaitement
    // aligné, donnerait une boîte d'épaisseur nulle et une caméra collée au contenu.
    half: [
      Math.max(floor, half[0]),
      Math.max(floor, half[1]),
      Math.max(pad, half[2]),
    ],
  };
}

/**
 * Cadrage d'un palier enfant, exprimé dans les unités de son parent (chantier 35.2).
 *
 * Chaque palier calcule son `Focus` dans SON repère ; la scène, elle, le rend imbriqué
 * dans le parent par un `<group position scale>`. Les deux cadrages ne sont donc pas
 * comparables tels quels, alors que c'est précisément leur comparaison qui définit la
 * bande de transition (`tierProgress`). Cette fonction fait le passage.
 *
 * Le centre subit la translation et l'échelle, les dimensions seulement l'échelle — ce
 * qui suffit, `fitDistance()` ne lisant que `half` et `radius`.
 */
export function nestedFocus(
  child: Focus,
  anchor: readonly [number, number, number],
  scale: number,
): Focus {
  return {
    id: child.id,
    center: [
      anchor[0] + child.center[0] * scale,
      anchor[1] + child.center[1] * scale,
      anchor[2] + child.center[2] * scale,
    ],
    radius: child.radius * scale,
    half: [child.half[0] * scale, child.half[1] * scale, child.half[2] * scale],
  };
}
