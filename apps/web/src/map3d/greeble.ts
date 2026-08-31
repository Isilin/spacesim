import { seedOf } from "./appearance.js";
import type { PartShape } from "./shipLayout.js";

/**
 * Bibliothèque de détail décoratif (chantier 34.3) — **fonction pure**, aucune dépendance à
 * three.js ni au DOM, comme `shipLayout` et `stationLayout`.
 *
 * Voir [ADR 0014](../../../../docs/adr/0014-densite-decorative-des-objets-manufactures.md).
 * Rien de ce qui sort d'ici ne veut dire quoi que ce soit : compter les trappes d'une coque
 * n'apprend rien sur le vaisseau. Mais **tout en sort de façon déterministe**, tiré d'une
 * graine textuelle qui porte l'identité du plan — deux plans différents ne se décorent pas
 * pareil, un même plan se décore toujours pareil, et rien n'est persisté.
 *
 * En registre holographique, c'est **l'arête qui porte la lecture**. Chaque émetteur est
 * donc pensé en nombre d'arêtes ajoutées, pas en volume : une plaque affleurante lit mieux
 * qu'une excroissance, et une couture lit mieux qu'un bossage.
 */

/** Pièce décorative — se conforme structurellement à `ShipPart` et à `StationPart`. */
export interface DetailPart {
  id: string;
  shape: PartShape;
  position: [number, number, number];
  rotation: [number, number, number];
  color: string;
  edgeAngle: number;
}

/**
 * Axe d'extrusion d'un tronc.
 *
 * Les vaisseaux pointent vers `+x` (fuselage), les tours de station montent selon `+z`. Un
 * seul jeu d'émetteurs sert les deux : c'est tout l'intérêt d'avoir une bibliothèque
 * partagée plutôt que deux paquets de détail jumeaux qui divergent.
 */
export type Axis = "x" | "z";

/** Tronc de cône à faces plates sur lequel on pose du détail. */
export interface Section {
  axis: Axis;
  /** Coordonnées le long de l'axe : `from` est l'extrémité de départ. */
  from: number;
  to: number;
  rFrom: number;
  rTo: number;
  sides: number;
  /** Décalage du tronc dans le plan perpendiculaire à l'axe. */
  offset: [number, number];
}

/**
 * Suite déterministe tirée d'une graine textuelle.
 *
 * `seedOf` ne rend qu'un nombre ; la décoration en demande des dizaines par pièce. Un
 * xorshift32 amorcé par `seedOf` suffit largement — on décore, on ne chiffre pas — et il
 * rend exactement la même suite à chaque appel, ce qui est la seule propriété qui compte
 * ici (ADR 0014).
 */
export function rng(key: string): () => number {
  let state = (Math.floor(seedOf(key) * 0xffffffff) ^ 0x9e3779b9) >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  return () => {
    state ^= (state << 13) >>> 0;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= (state << 5) >>> 0;
    state >>>= 0;
    return state / 0x100000000;
  };
}

/** Rayon du tronc à une coordonnée donnée le long de son axe. */
export function radiusAt(section: Section, along: number): number {
  const span = section.to - section.from;
  if (Math.abs(span) < 1e-6) return section.rFrom;
  const t = Math.min(1, Math.max(0, (along - section.from) / span));
  return section.rFrom + (section.rTo - section.rFrom) * t;
}

/** Compose un point à partir d'une coordonnée axiale et de deux coordonnées transverses. */
function place(
  axis: Axis,
  along: number,
  u: number,
  v: number,
): [number, number, number] {
  return axis === "x" ? [along, u, v] : [u, v, along];
}

/** Rotation à donner à un prisme pour que son axe suive celui du tronc. */
export function prismRotation(axis: Axis): [number, number, number] {
  // Un `CylinderGeometry` est dressé selon `y` : il faut le coucher.
  return axis === "x" ? [0, 0, -Math.PI / 2] : [Math.PI / 2, 0, 0];
}

/**
 * Boîte plaquée sur la surface d'un tronc, à un angle donné.
 *
 * `thickness` porte le long du rayon, `width` suit la tangente, `length` suit l'axe. Le
 * centre est posé à `radius`, de sorte qu'une épaisseur faible donne une plaque affleurante
 * et une épaisseur nulle en profondeur donne un renfoncement.
 */
export function radialBox(
  axis: Axis,
  along: number,
  angle: number,
  radius: number,
  size: { length: number; width: number; thickness: number },
  offset: [number, number],
): {
  shape: PartShape;
  position: [number, number, number];
  rotation: [number, number, number];
} {
  const u = offset[0] + Math.cos(angle) * radius;
  const v = offset[1] + Math.sin(angle) * radius;
  return axis === "x"
    ? {
        // Rotation autour de `x` : l'axe local `y` part vers le rayon, `z` suit la tangente.
        shape: {
          kind: "box",
          size: [size.length, size.thickness, size.width],
        },
        position: place("x", along, u, v),
        rotation: [angle, 0, 0],
      }
    : {
        // Rotation autour de `z` : l'axe local `x` part vers le rayon, `y` suit la tangente.
        shape: {
          kind: "box",
          size: [size.thickness, size.width, size.length],
        },
        position: place("z", along, u, v),
        rotation: [0, 0, angle],
      };
}

/**
 * Coutures de panneau : anneaux fins en légère surépaisseur, répartis le long du tronc.
 *
 * C'est l'émetteur qui rapporte le plus de lecture par pièce : un prisme mince de même
 * nombre de côtés que la coque ajoute deux anneaux d'arêtes pour un seul volume.
 *
 * Le seuil d'angle est calculé, pas constant. Un anneau à douze faces mis à 18° garde aussi
 * ses douze arêtes LATÉRALES : huit anneaux par tronc tressaient alors un panier de fil de
 * fer par-dessus la coque, et c'était le principal responsable du rendu « cocon » du
 * premier jet. Au-dessus de l'angle entre deux faces voisines (360/n) il ne reste que les
 * deux anneaux — les seuls qui disent quelque chose.
 */
export function panelSeams(
  section: Section,
  count: number,
  color: string,
  idPrefix: string,
): DetailPart[] {
  const parts: DetailPart[] = [];
  const span = section.to - section.from;
  const rotation = prismRotation(section.axis);
  const ringOnly = 360 / section.sides + 6;
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1);
    const along = section.from + span * t;
    const radius = radiusAt(section, along) * 1.015;
    parts.push({
      id: `${idPrefix}-seam-${i}`,
      shape: {
        kind: "prism",
        rFore: radius,
        rAft: radius,
        length: 0.035,
        sides: section.sides,
      },
      position: place(
        section.axis,
        along,
        section.offset[0],
        section.offset[1],
      ),
      rotation,
      color,
      edgeAngle: ringOnly,
    });
  }
  return parts;
}

/**
 * Bande de plaques : une couronne de plaques affleurantes autour du tronc, avec des jeux
 * entre elles.
 *
 * Une plaque par face de la coque, décalée d'un demi-pas pour que ses arêtes ne se
 * superposent pas à celles du prisme dessous — deux arêtes confondues ne se lisent que
 * comme une, et le détail serait payé sans être vu.
 */
export function platingBand(
  section: Section,
  along: number,
  color: string,
  seed: string,
  idPrefix: string,
): DetailPart[] {
  const random = rng(seed);
  const parts: DetailPart[] = [];
  const radius = radiusAt(section, along);
  const step = (Math.PI * 2) / section.sides;
  const width = radius * step * 0.78;
  for (let i = 0; i < section.sides; i++) {
    const angle = (i + 0.5) * step;
    const length = 0.16 + random() * 0.22;
    const box = radialBox(
      section.axis,
      along,
      angle,
      radius * 1.01,
      { length, width, thickness: 0.022 + random() * 0.02 },
      section.offset,
    );
    parts.push({
      id: `${idPrefix}-plate-${i}`,
      ...box,
      color,
      edgeAngle: 15,
    });
  }
  return parts;
}

/**
 * Semis de greebles : petites boîtes de tailles inégales posées sur le tronc, certaines
 * saillantes, d'autres en renfoncement.
 *
 * C'est le gros du volume de pièces — et donc l'émetteur le plus dangereux. Les tailles
 * restent petites devant le rayon : au-delà, on ne fabrique plus du détail de surface mais
 * une silhouette bosselée, et le châssis cesse d'être reconnaissable.
 *
 * **Les pièces se groupent en amas**, elles ne se répartissent pas uniformément. C'est la
 * correction qui a le plus compté sur le rendu : un semis régulier sur toute la coque lit
 * comme du bruit — une texture — alors que trois ou quatre grappes séparées par de la
 * surface nue lisent comme de la machinerie. Un concept art tient autant à ses zones vides
 * qu'à ses zones chargées.
 */
export function greebleScatter(
  section: Section,
  count: number,
  color: string,
  seed: string,
  idPrefix: string,
): DetailPart[] {
  const random = rng(seed);
  const parts: DetailPart[] = [];
  const span = section.to - section.from;
  const step = (Math.PI * 2) / section.sides;
  const clusterCount = Math.max(1, Math.min(4, Math.round(count / 5)));
  const clusters = Array.from({ length: clusterCount }, () => ({
    along: 0.1 + random() * 0.8,
    face: Math.floor(random() * section.sides),
  }));
  for (let i = 0; i < count; i++) {
    const cluster = clusters[i % clusterCount]!;
    const along =
      section.from + span * (cluster.along + (random() - 0.5) * 0.16);
    const radius = radiusAt(section, along);
    // Angle aligné sur les faces du prisme : un greeble à cheval sur une arête flotterait
    // au-dessus du creux entre deux faces. L'amas déborde d'une face de part et d'autre,
    // pas davantage — au-delà il ceinture la coque et redevient un semis.
    const angle =
      (((cluster.face + Math.floor(random() * 3) - 1 + section.sides) %
        section.sides) +
        0.5) *
      step;
    const sunken = random() < 0.55;
    // Plat et large plutôt que petit et saillant : une boîte cubique lit comme une verrue,
    // une dalle mince lit comme un panneau. C'est la différence entre du bruit de surface
    // et du hard-surface, et elle tient entièrement à ces trois nombres.
    const thickness = 0.018 + random() * 0.028;
    const box = radialBox(
      section.axis,
      along,
      angle,
      // Un greeble enfoncé est posé sous la peau : seules ses arêtes ressortent, ce qui
      // donne une écoutille plutôt qu'une excroissance.
      radius * (sunken ? 0.955 : 1.0) + (sunken ? 0 : thickness * 0.5),
      {
        length: 0.1 + random() * 0.26,
        width: 0.08 + random() * 0.18,
        thickness,
      },
      section.offset,
    );
    parts.push({
      id: `${idPrefix}-greeble-${i}`,
      ...box,
      color,
      edgeAngle: 15,
    });
  }
  return parts;
}

/**
 * Longerons : lattes minces courant le long du tronc, une par face.
 *
 * C'est l'émetteur qui rend le plus de LECTURE, par opposition à la densité. Une ligne
 * longue et droite dit la direction et la longueur de l'objet ; cent petites boîtes ne
 * disent rien. Sur une coque à six faces, où le prisme ne fournit que six arêtes
 * longitudinales, ce sont eux qui empêchent le fuselage de redevenir un tube lisse.
 */
export function stringers(
  section: Section,
  color: string,
  idPrefix: string,
): DetailPart[] {
  const parts: DetailPart[] = [];
  const span = section.to - section.from;
  const along = section.from + span / 2;
  const radius = radiusAt(section, along);
  const step = (Math.PI * 2) / section.sides;
  for (let i = 0; i < section.sides; i++) {
    const box = radialBox(
      section.axis,
      along,
      i * step,
      radius * 1.02,
      { length: Math.abs(span) * 0.86, width: 0.035, thickness: 0.03 },
      section.offset,
    );
    parts.push({
      id: `${idPrefix}-stringer-${i}`,
      ...box,
      color,
      edgeAngle: 15,
    });
  }
  return parts;
}

/**
 * Trappes : plaques larges et plates, en net renfoncement, posées avec parcimonie.
 *
 * Elles donnent l'échelle. Un semis de greebles rend une surface « travaillée » sans dire
 * si l'objet fait dix mètres ou mille ; trois trappes de taille constante le disent.
 */
export function hatches(
  section: Section,
  count: number,
  color: string,
  seed: string,
  idPrefix: string,
): DetailPart[] {
  const random = rng(seed);
  const parts: DetailPart[] = [];
  const span = section.to - section.from;
  for (let i = 0; i < count; i++) {
    const along = section.from + span * (0.15 + random() * 0.7);
    const radius = radiusAt(section, along);
    const angle =
      (Math.floor(random() * section.sides) + 0.5) *
      ((Math.PI * 2) / section.sides);
    const box = radialBox(
      section.axis,
      along,
      angle,
      radius * 0.93,
      { length: 0.2, width: Math.min(0.24, radius * 0.7), thickness: 0.12 },
      section.offset,
    );
    parts.push({
      id: `${idPrefix}-hatch-${i}`,
      ...box,
      color,
      edgeAngle: 15,
    });
  }
  return parts;
}

/**
 * Ailettes de radiateur : lames plates et fines en éventail, perpendiculaires à la coque.
 *
 * Beaucoup d'arête pour très peu de volume — le meilleur rapport du catalogue en registre
 * additif, où le volume coûte de la lisibilité et l'arête en rend.
 */
export function radiatorFins(
  axis: Axis,
  anchor: [number, number, number],
  count: number,
  span: number,
  reach: number,
  color: string,
  idPrefix: string,
): DetailPart[] {
  const parts: DetailPart[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const shift = t * span;
    parts.push({
      id: `${idPrefix}-fin-${i}`,
      shape:
        axis === "x"
          ? { kind: "box", size: [reach * 0.7, 0.012, reach] }
          : { kind: "box", size: [0.012, reach * 0.7, reach] },
      position:
        axis === "x"
          ? [anchor[0] + shift, anchor[1], anchor[2]]
          : [anchor[0], anchor[1] + shift, anchor[2]],
      rotation: [0, 0, 0],
      color,
      edgeAngle: 15,
    });
  }
  return parts;
}

/** Grappe de mâts de longueurs inégales — lisible même à très petite taille. */
export function antennaCluster(
  anchor: [number, number, number],
  count: number,
  reach: number,
  color: string,
  seed: string,
  idPrefix: string,
): DetailPart[] {
  const random = rng(seed);
  const parts: DetailPart[] = [];
  for (let i = 0; i < count; i++) {
    const height = reach * (0.4 + random() * 0.9);
    parts.push({
      id: `${idPrefix}-antenna-${i}`,
      shape: {
        kind: "prism",
        rFore: 0.008,
        rAft: 0.018,
        length: height,
        sides: 4,
      },
      position: [
        anchor[0] + (random() - 0.5) * reach * 0.6,
        anchor[1] + (random() - 0.5) * reach * 0.6,
        anchor[2] + height / 2,
      ],
      rotation: [Math.PI / 2, 0, 0],
      color,
      edgeAngle: 15,
    });
  }
  return parts;
}

/**
 * Anneaux le long d'un tube — coursives de station, fuselages fins.
 *
 * Le tube nu est la pièce la moins lisible du catalogue : un cylindre uni sans arête
 * transverse. Les anneaux lui rendent une longueur visible.
 */
export function ribs(
  from: [number, number, number],
  to: [number, number, number],
  count: number,
  radius: number,
  sides: number,
  color: string,
  idPrefix: string,
): DetailPart[] {
  const parts: DetailPart[] = [];
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  // Le prisme est couché le long de l'axe du tube : même construction que les coursives
  // elles-mêmes, sans quoi les anneaux seraient perpendiculaires au mauvais plan.
  const rotation: [number, number, number] = [
    0,
    Math.PI / 2,
    Math.atan2(dy, dx),
  ];
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1);
    parts.push({
      id: `${idPrefix}-rib-${i}`,
      shape: {
        kind: "prism",
        rFore: radius,
        rAft: radius,
        length: 0.03,
        sides,
      },
      position: [from[0] + dx * t, from[1] + dy * t, from[2] + dz * t],
      rotation,
      color,
      // Même raison que pour les coutures : au-dessus de l'angle entre deux faces, il ne
      // reste que les deux anneaux.
      edgeAngle: 360 / sides + 6,
    });
  }
  return parts;
}

/**
 * Décore un tronc pour un budget de pièces donné.
 *
 * La répartition entre familles est **fixe** — coutures, plaques, semis, trappes — parce que
 * c'est leur équilibre qui fait la lecture, pas leur nombre absolu : trop de semis et la
 * surface devient du bruit, trop de coutures et l'objet redevient un fil de fer. Seul le
 * budget varie, ce qui permet à l'appelant de le répartir sur ses troncs au prorata de leur
 * surface sans avoir à réaccorder quoi que ce soit.
 */
export function decorateSection(
  section: Section,
  budget: number,
  color: string,
  seed: string,
  idPrefix: string,
): DetailPart[] {
  if (budget <= 0) return [];
  const parts: DetailPart[] = [];

  const seams = Math.max(1, Math.round(budget * 0.12));
  parts.push(...panelSeams(section, seams, color, idPrefix));

  // Les longerons passent AVANT le semis : ce sont eux qui donnent la direction, et le
  // semis n'est lisible que posé sur une surface qui en a déjà une.
  parts.push(...stringers(section, color, idPrefix));

  // Les plaques vont par couronne complète : le budget donne un nombre de BANDES, pas de
  // plaques, sinon une couronne partielle laisserait un flanc nu.
  const bands = Math.max(1, Math.round((budget * 0.26) / section.sides));
  const span = section.to - section.from;
  for (let b = 0; b < bands; b++) {
    const along = section.from + span * ((b + 0.5) / bands);
    parts.push(
      ...platingBand(
        section,
        along,
        color,
        `${seed}:band${b}`,
        `${idPrefix}-b${b}`,
      ),
    );
  }

  const scatter = Math.max(0, Math.round(budget * 0.32));
  parts.push(
    ...greebleScatter(section, scatter, color, `${seed}:scatter`, idPrefix),
  );

  const hatchCount = Math.max(1, Math.round(budget * 0.07));
  parts.push(...hatches(section, hatchCount, color, `${seed}:hatch`, idPrefix));

  return parts;
}
