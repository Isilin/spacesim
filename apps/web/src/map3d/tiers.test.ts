import { describe, expect, it } from "vitest";
import {
  ascend,
  childTierOf,
  clipPlanesFor,
  descend,
  distanceForProgress,
  dollyEase,
  labelOpacity,
  nearestToCursor,
  nestingScale,
  orbitAround,
  recenterStep,
  smoothFactor,
  streakFactor,
  tierAt,
  tierBlend,
  tierProgress,
  worldPerPixel,
  zoomAbout,
  zoomStep,
  type CameraPose,
  type Vec3,
} from "./tiers.js";

/**
 * Arithmétique du zoom continu (chantier 35.1).
 *
 * C'est le seul endroit de la traversée qui se vérifie sans WebGL, et c'est celui qui
 * porte le risque : une caméra 3D ne laisse aucune trace dans le DOM. Une bande mal calée,
 * deux fondus qui se croisent trop bas, un franchissement qui saute — rien de tout cela ne
 * casse un test de rendu, et tout se voit à la première molette.
 */

describe("nestingScale", () => {
  it("rend le rapport entre l'emprise dans le parent et l'étendue propre", () => {
    // Le nœud d'un système fait 11 unités dans la galaxie, pour un système qui s'étend
    // sur ~450 dans son propre repère.
    expect(nestingScale(11, 450)).toBeCloseTo(11 / 450, 10);
  });

  it("retombe sur une valeur sûre quand le contenu est dégénéré", () => {
    // Une galaxie à un seul système, un corps sans lune : l'étendue propre est nulle et
    // le rapport partirait à l'infini. La caméra en reviendrait à `NaN`, pas à une image
    // dégradée — d'où un repli plutôt qu'une division.
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(Number.isFinite(nestingScale(11, bad))).toBe(true);
      expect(nestingScale(11, bad)).toBeGreaterThan(0);
    }
  });

  it("borne le facteur des deux côtés", () => {
    // Un groupe three.js à l'échelle 0 aplatit son contenu sans rien signaler, et une
    // échelle supérieure à 1 rendrait un enfant plus grand que le repère qui le porte.
    expect(nestingScale(100, 1)).toBe(1);
    expect(nestingScale(1, 1e12)).toBeGreaterThan(0);
  });

  it("laisse passer l'échelle 1, qui est celle du palier corps", () => {
    // Un corps vit dans les coordonnées de son système sans changement d'échelle : ce qui
    // le distingue du palier au-dessus n'est pas sa taille mais le détail qu'on y ajoute.
    expect(nestingScale(45, 45)).toBe(1);
  });
});

describe("tierProgress / distanceForProgress", () => {
  // Deux distances de cadrage, pas une distance et une échelle : un système ne se cadre
  // pas comme la galaxie qui le contient, et déduire l'une de l'autre décalerait la
  // frontière de la bande.
  const parentFrame = 900;
  const childFrame = 151;

  it("vaut 0 quand le palier courant remplit exactement le cadre", () => {
    expect(tierProgress(parentFrame, parentFrame, childFrame)).toBeCloseTo(
      0,
      12,
    );
  });

  it("vaut 1 quand l'enfant remplit le cadre à son tour", () => {
    // C'est la définition de la bande : à cette distance l'enfant occupe l'image comme le
    // parent l'occupait, donc l'échange des deux ne se voit pas.
    expect(tierProgress(childFrame, parentFrame, childFrame)).toBeCloseTo(
      1,
      12,
    );
  });

  it("croît quand la caméra se rapproche", () => {
    const samples = [parentFrame, 600, 300, childFrame].map((d) =>
      tierProgress(d, parentFrame, childFrame),
    );
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!).toBeGreaterThan(samples[i - 1]!);
    }
  });

  it("déborde de [0, 1] au lieu d'être bornée", () => {
    // C'est ce débordement qui signale le franchissement. Le borner ici rendrait le
    // changement de palier indétectable par l'appelant.
    expect(
      tierProgress(childFrame * 0.5, parentFrame, childFrame),
    ).toBeGreaterThan(1);
    expect(tierProgress(parentFrame * 2, parentFrame, childFrame)).toBeLessThan(
      0,
    );
  });

  it("est réciproque de distanceForProgress", () => {
    for (const p of [-0.4, 0, 0.3, 0.75, 1, 1.6]) {
      const distance = distanceForProgress(parentFrame, childFrame, p);
      expect(tierProgress(distance, parentFrame, childFrame)).toBeCloseTo(
        p,
        10,
      );
    }
  });

  it("refuse une bande dégénérée au lieu de diviser par zéro", () => {
    // Un enfant qui se cadre aussi loin que son parent — une galaxie à un seul système,
    // par exemple. Il n'y a alors pas de descente possible, et surtout pas une
    // progression infinie qui traverserait tous les paliers en un cran de molette.
    expect(tierProgress(400, 900, 900)).toBe(0);
    expect(tierProgress(400, 900, 1200)).toBe(0);
    expect(distanceForProgress(900, 900, 0.5)).toBe(900);
  });
});

describe("tierBlend", () => {
  it("monte l'enfant avant de le faire apparaître", () => {
    // Monter une scène coûte une image ; la faire apparaître au même instant rendrait ce
    // coût visible sous forme d'à-coup.
    const atMount = tierBlend(0.3);
    expect(atMount.childMounted).toBe(true);
    expect(atMount.childOpacity).toBe(0);
    expect(tierBlend(0.29).childMounted).toBe(false);
  });

  it("laisse le parent entier tant que l'enfant n'est pas lisible", () => {
    expect(tierBlend(0.5).parentOpacity).toBe(1);
  });

  it("efface complètement le parent à la frontière", () => {
    // L'invariant qui rend le franchissement invisible : à `progress = 1`, on démonte une
    // couche déjà entièrement transparente.
    expect(tierBlend(1).parentOpacity).toBeCloseTo(0, 12);
    expect(tierBlend(1.4).parentOpacity).toBe(0);
    expect(tierBlend(1).childOpacity).toBe(1);
  });

  it("ne laisse jamais la scène se vider au milieu de la bande", () => {
    // Le défaut qu'on ne verrait qu'à l'usage : deux fondus mal calés se croisent trop
    // bas et la carte clignote à chaque franchissement.
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const { childOpacity, parentOpacity } = tierBlend(p);
      expect(childOpacity + parentOpacity).toBeGreaterThanOrEqual(0.999);
    }
  });
});

describe("descend / ascend", () => {
  const pose: CameraPose = {
    position: [140, -260, 310],
    target: [12, 4, -7],
  };
  const anchor: Vec3 = [-430, 87, 22];
  const scale = 0.024;

  it("fait un aller-retour exact", () => {
    // Ces conversions désignent un même point à travers les paliers — viser une lune
    // depuis la galaxie, restaurer une ancre depuis l'URL, animer un vol. Une perte ici
    // fait rater la cible d'autant, et l'erreur se multiplie par l'échelle à chaque
    // palier traversé.
    const back = ascend(descend(pose, anchor, scale), anchor, scale);
    for (const axis of [0, 1, 2] as const) {
      expect(back.position[axis]).toBeCloseTo(pose.position[axis]!, 9);
      expect(back.target[axis]).toBeCloseTo(pose.target[axis]!, 9);
    }
  });

  it("préserve la distance caméra-cible, au facteur d'échelle près", () => {
    // Ce que voit la caméra ne dépend que de cette distance et de la direction : les
    // conserver toutes deux, c'est conserver l'image.
    const span = (p: CameraPose) =>
      Math.hypot(
        p.position[0] - p.target[0],
        p.position[1] - p.target[1],
        p.position[2] - p.target[2],
      );
    const child = descend(pose, anchor, scale);
    expect(span(child)).toBeCloseTo(span(pose) / scale, 6);
  });

  it("pose l'ancre à l'origine du repère enfant", () => {
    // Propriété de base de la conversion : ce qui sert d'ancre est l'origine du repère
    // enfant, ce qui rend ses coordonnées petites et centrées.
    const at = descend({ position: anchor, target: anchor }, anchor, scale);
    expect(at.position).toEqual([0, 0, 0]);
  });
});

describe("clipPlanesFor", () => {
  const frame = 900;
  const childFrame = 151;

  it("garde la cible entre les deux plans à toute profondeur", () => {
    // Le défaut que ça corrige : `MapCanvas` ne fixe que `far`, donc `near` reste au
    // défaut de three.js (0,1). Au palier corps la caméra regarde à ~0,02 unité — tout
    // passerait devant le plan proche et la carte rendrait du vide.
    for (const p of [0, 0.5, 1, 1.5]) {
      const distance = distanceForProgress(frame, childFrame, p);
      const { near, far } = clipPlanesFor(distance, frame);
      expect(near).toBeGreaterThan(0);
      expect(near).toBeLessThan(distance);
      expect(far).toBeGreaterThan(distance);
    }
  });

  it("tient le palier courant en entier dans le champ", () => {
    // Sans cette marge, le fond disparaîtrait dès qu'on avance vers la cible.
    const { far } = clipPlanesFor(frame, frame);
    expect(far).toBeGreaterThanOrEqual(frame * 2);
  });

  it("garde le rapport far/near dans ce que tient un tampon 24 bits", () => {
    // Au-delà de ~10⁵ le z-fighting devient visible ; c'est la contrainte qui fixe
    // `NEAR_RATIO`.
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const distance = distanceForProgress(frame, childFrame, p);
      const { near, far } = clipPlanesFor(distance, frame);
      expect(far / near).toBeLessThan(1e5);
    }
  });

  it("ne rend jamais de plan dégénéré sur une entrée absurde", () => {
    for (const bad of [0, -5, Number.NaN]) {
      const { near, far } = clipPlanesFor(bad, bad);
      expect(near).toBeGreaterThan(0);
      expect(far).toBeGreaterThan(near);
    }
  });
});

describe("échelle de paliers", () => {
  it("ne change de palier qu'une fois la bande franchie", () => {
    expect(tierAt(0)).toBe("universe");
    expect(tierAt(0.99)).toBe("universe");
    expect(tierAt(1)).toBe("galaxy");
    expect(tierAt(2.5)).toBe("system");
  });

  it("borne la profondeur aux deux extrémités de l'échelle", () => {
    expect(tierAt(-3)).toBe("universe");
    expect(tierAt(99)).toBe("body");
    expect(childTierOf("body")).toBeNull();
    expect(childTierOf("universe")).toBe("galaxy");
  });
});

describe("zoomStep", () => {
  // Une bande mesurée sur l'univers de dev : la galaxie se cadre à 3700, le système
  // imbriqué à 275, soit ~2,6 octaves.
  const PARENT = 3700;
  const CHILD = 275;

  it("traverse une bande en un nombre de crans constant, quelle que soit l'échelle", () => {
    // C'est TOUT le réglage du zoom : ni la distance ni le palier n'entrent en jeu, seul
    // le nombre de crans que le joueur doit donner. Un pas absolu serait imperceptible au
    // palier univers et brutal au palier corps.
    const wide = zoomStep(PARENT, CHILD, 0);
    const narrow = zoomStep(3.7, 0.275, 0);
    expect(wide).toBeCloseTo(narrow, 10);

    let distance = PARENT;
    let notches = 0;
    // Marge relative : au douzième cran la distance vaut `CHILD` à 10⁻¹³ près, et une
    // comparaison stricte compterait un cran de plus pour un résidu d'arrondi.
    while (distance > CHILD * (1 + 1e-9) && notches < 100) {
      distance *= Math.exp(-zoomStep(PARENT, CHILD, 0));
      notches++;
    }
    expect(notches).toBe(12);
  });

  it("garde un pas fini et utile quand aucune bande n'est en vue", () => {
    // Dernier palier, ou rien à viser : sans repli le zoom se figerait là où il n'y a
    // précisément rien pour le calibrer.
    for (const [parent, child] of [
      [3700, 0],
      [3700, 3700],
      [3700, 9000],
      [Number.NaN, 1],
    ]) {
      const step = zoomStep(parent!, child!, 0);
      expect(Number.isFinite(step)).toBe(true);
      expect(step).toBeGreaterThan(0);
    }
  });

  it("accélère sur un défilement soutenu, sans s'emballer", () => {
    const single = zoomStep(PARENT, CHILD, 0);
    expect(zoomStep(PARENT, CHILD, 5)).toBeGreaterThan(single);
    // Le plafond est ce qui distingue une accélération d'une fuite : sans lui, dix
    // secondes de molette traverseraient la carte entière en une image.
    expect(zoomStep(PARENT, CHILD, 1000) / single).toBeCloseTo(2.5, 10);
    expect(streakFactor(0)).toBe(1);
    expect(streakFactor(-4)).toBe(1);
  });
});

describe("dollyEase", () => {
  it("converge vers la distance visée sans la dépasser", () => {
    let d = 1000;
    for (let i = 0; i < 200; i++) d = dollyEase(d, 100, 1 / 60);
    expect(d).toBeCloseTo(100, 4);

    // Jamais de dépassement : un zoom qui rebondit se lit comme un défaut, pas comme une
    // inertie.
    let up = 100;
    for (let i = 0; i < 200; i++) {
      const next = dollyEase(up, 1000, 1 / 60);
      expect(next).toBeGreaterThanOrEqual(up);
      expect(next).toBeLessThanOrEqual(1000);
      up = next;
    }
  });

  it("avance à la même vitesse quelle que soit la cadence d'images", () => {
    // Sur un écran à 144 Hz, un amortissement par IMAGE serait deux fois et demie plus
    // rapide que sur un écran à 60. C'est le temps écoulé qui compte.
    let slow = 1000;
    slow = dollyEase(slow, 100, 1 / 30);
    let fast = 1000;
    fast = dollyEase(fast, 100, 1 / 60);
    fast = dollyEase(fast, 100, 1 / 60);
    expect(fast).toBeCloseTo(slow, 6);
  });

  it("ne rend jamais de distance absurde", () => {
    expect(dollyEase(Number.NaN, 100, 1 / 60)).toBe(100);
    expect(dollyEase(100, 0, 1 / 60)).toBe(100);
    expect(Number.isFinite(dollyEase(100, 50, Number.NaN))).toBe(true);
    // Un onglet remis au premier plan livre un `dt` de plusieurs secondes : borné, sinon
    // la vue saute d'un bout à l'autre de la carte à la première image.
    expect(dollyEase(1000, 100, 30)).toBeGreaterThan(100);
  });
});

describe("smoothFactor", () => {
  it("rattrape la moitié du chemin en une demi-course", () => {
    // C'est la définition de l'unité, et la seule raison de préférer une demi-course à un
    // « facteur par image » : elle se lit en secondes et se vérifie en une ligne.
    expect(smoothFactor(0.2, 0.2)).toBeCloseTo(0.5, 12);
    expect(smoothFactor(0.05, 0.05)).toBeCloseTo(0.5, 12);
  });

  it("compose : deux demi-pas valent un pas", () => {
    const one = smoothFactor(0.2, 1 / 30);
    const half = smoothFactor(0.2, 1 / 60);
    // Ce qui RESTE se multiplie, ce qui est rattrapé ne s'additionne pas.
    expect((1 - half) * (1 - half)).toBeCloseTo(1 - one, 12);
  });

  it("ne rend jamais de facteur absurde", () => {
    expect(smoothFactor(0, 1 / 60)).toBe(1);
    expect(smoothFactor(Number.NaN, 1 / 60)).toBe(1);
    expect(smoothFactor(0.2, Number.NaN)).toBeGreaterThan(0);
    // Un onglet remis au premier plan : borné, sinon la première image téléporte la vue.
    expect(smoothFactor(0.2, 30)).toBeLessThan(1);
  });
});

describe("recenterStep", () => {
  const at: Vec3 = [0, 0, 0];

  it("rapproche de la visée sans jamais la dépasser", () => {
    let p: Vec3 = [100, 0, 0];
    for (let i = 0; i < 300; i++) {
      const step = recenterStep(p, at, 1 / 60, 1e-4);
      if (!step) break;
      p = [p[0] + step[0], p[1] + step[1], p[2] + step[2]];
      expect(p[0]).toBeGreaterThanOrEqual(0);
    }
    expect(Math.hypot(p[0], p[1], p[2])).toBeLessThanOrEqual(1e-4);
  });

  it("avance à la même vitesse quelle que soit la cadence d'images", () => {
    const slow = recenterStep([100, 0, 0], at, 1 / 30, 0)!;
    const first = recenterStep([100, 0, 0], at, 1 / 60, 0)!;
    const second = recenterStep([100 + first[0], 0, 0], at, 1 / 60, 0)!;
    expect(first[0] + second[0]).toBeCloseTo(slow[0], 9);
  });

  it("se tait au repos", () => {
    // Sans ce seuil la cible frémit indéfiniment, et la carte republie sa profondeur pour
    // un mouvement que personne ne voit.
    expect(recenterStep([0.5, 0, 0], at, 1 / 60, 1)).toBeNull();
    expect(recenterStep(at, at, 1 / 60, 0)).toBeNull();
    expect(recenterStep([Number.NaN, 0, 0], at, 1 / 60, 0)).toBeNull();
  });
});

describe("nearestToCursor", () => {
  // Un cadre de 800 × 400 : les coordonnées sont en PIXELS depuis son coin haut-gauche.
  const point = (id: string, x: number, y: number, depth = 0) => ({
    id,
    at: [x, y] as const,
    depth,
  });

  it("retient l'objet le plus proche du curseur", () => {
    const points = [point("a", 100, 200), point("b", 700, 200)];
    expect(nearestToCursor([690, 205], points, 40)?.id).toBe("b");
    expect(nearestToCursor([115, 190], points, 40)?.id).toBe("a");
  });

  it("attrape un objet minuscule sans le toucher", () => {
    // C'est toute la raison d'être de la fonction : un objet de trois pixels à dix-huit
    // pixels du clic reste sélectionnable.
    expect(nearestToCursor([400, 200], [point("x", 412, 208)], 18)?.id).toBe(
      "x",
    );
  });

  it("rend `null` au-delà du rayon — c'est le clic dans le vide", () => {
    expect(nearestToCursor([400, 200], [point("x", 500, 300)], 18)).toBeNull();
    expect(nearestToCursor([400, 200], [], 18)).toBeNull();
    expect(nearestToCursor([400, 200], [point("x", 400, 200)], 0)).toBeNull();
  });

  it("ignore ce qui est derrière la caméra", () => {
    // La projection rend des coordonnées d'écran parfaitement plausibles pour un point
    // situé DERRIÈRE l'observateur. Seule la profondeur les départage.
    const points = [
      point("derriere", 400, 200, 1.2),
      point("devant", 410, 205),
    ];
    expect(nearestToCursor([400, 200], points, 40)?.id).toBe("devant");
  });
});

/** Élévation de la caméra au-dessus du plan galactique, en radians. */
function elevationOf(pose: { position: Vec3; target: Vec3 }): number {
  const dx = pose.position[0] - pose.target[0];
  const dy = pose.position[1] - pose.target[1];
  const dz = pose.position[2] - pose.target[2];
  return Math.asin(dz / Math.hypot(dx, dy, dz));
}

function distanceOf(pose: { position: Vec3; target: Vec3 }): number {
  return Math.hypot(
    pose.position[0] - pose.target[0],
    pose.position[1] - pose.target[1],
    pose.position[2] - pose.target[2],
  );
}

describe("orbitAround", () => {
  // La pose standard de la carte : trois quarts au-dessus du plan galactique.
  const pose = {
    position: [0, -60, 80] as Vec3,
    target: [0, 0, 0] as Vec3,
  };
  const pivot: Vec3 = [0, 0, 0];

  it("un lacet ne change pas l'élévation au-dessus du plan", () => {
    // C'EST la définition de « yaw et non roll », et c'est le défaut que ce chantier corrige :
    // avec un axe haut en Y, un glisser horizontal faisait passer la caméra SOUS le disque au
    // lieu d'en faire le tour.
    const start = elevationOf(pose);
    for (const yaw of [0.1, 0.7, 1.5, 3, -2.2]) {
      expect(elevationOf(orbitAround(pose, pivot, yaw, 0))).toBeCloseTo(
        start,
        12,
      );
    }
  });

  it("laisse le pivot où il est, et conserve la distance de vue", () => {
    // Le pivot immobile est ce qui fait la rotation à pivot décentré : l'image tourne autour
    // de lui au lieu de le ramener au centre.
    const off: Vec3 = [40, 10, -5];
    const turned = orbitAround(pose, off, 0.6, 0.2);
    expect(distanceOf(turned)).toBeCloseTo(distanceOf(pose), 9);
    // Un point posé SUR le pivot n'aurait pas bougé : vérifié par une pose dégénérée.
    const atPivot = orbitAround({ position: off, target: off }, off, 0.6, 0);
    expect(atPivot.position).toEqual(off);
  });

  it("un tour complet revient au point de départ", () => {
    const turned = orbitAround(pose, pivot, Math.PI * 2, 0);
    expect(turned.position[0]).toBeCloseTo(pose.position[0], 9);
    expect(turned.position[1]).toBeCloseTo(pose.position[1], 9);
    expect(turned.position[2]).toBeCloseTo(pose.position[2], 9);
  });

  it("le tangage monte et descend, et s'arrête avant le pôle", () => {
    expect(elevationOf(orbitAround(pose, pivot, 0, 0.2))).toBeGreaterThan(
      elevationOf(pose),
    );
    expect(elevationOf(orbitAround(pose, pivot, 0, -0.2))).toBeLessThan(
      elevationOf(pose),
    );
    // À la verticale exacte l'axe droit n'est plus défini et l'image basculerait d'un
    // demi-tour pour un pixel de glisser. Le bornage est exact, pas approché.
    const limit = (89 * Math.PI) / 180;
    expect(elevationOf(orbitAround(pose, pivot, 0, 10))).toBeCloseTo(limit, 9);
    expect(elevationOf(orbitAround(pose, pivot, 0, -10))).toBeCloseTo(
      -limit,
      9,
    );
  });

  it("ne rend jamais de pose absurde", () => {
    expect(orbitAround(pose, pivot, Number.NaN, Number.NaN)).toEqual(pose);
    // Caméra confondue avec sa cible : pas de direction de vue, donc rien à faire tourner.
    const nowhere = { position: [1, 1, 1] as Vec3, target: [1, 1, 1] as Vec3 };
    expect(orbitAround(nowhere, pivot, 0, 0.3).position).toEqual([1, 1, 1]);
  });
});

describe("zoomAbout", () => {
  const pose = {
    position: [0, -60, 80] as Vec3,
    target: [0, 0, 0] as Vec3,
  };

  it("laisse le pivot où il est — c'est tout le zoom au curseur", () => {
    const pivot: Vec3 = [20, -10, 5];
    const zoomed = zoomAbout(pose, pivot, 0.5);
    // Le pivot est le seul point invariant d'une homothétie : le point sous la souris reste
    // sous la souris.
    expect(
      zoomAbout({ position: pivot, target: pivot }, pivot, 0.5).position,
    ).toEqual(pivot);
    expect(distanceOf(zoomed)).toBeCloseTo(distanceOf(pose) * 0.5, 9);
  });

  it("multiplie la distance de vue par le rapport, comme le dolly", () => {
    // C'est ce qui permet aux bornes de palier et au calibrage de la molette de s'appliquer
    // à l'identique dans les deux modes.
    expect(distanceOf(zoomAbout(pose, [7, 7, 7], 2))).toBeCloseTo(
      distanceOf(pose) * 2,
      9,
    );
    expect(zoomAbout(pose, [7, 7, 7], 1)).toEqual(pose);
  });

  it("ne rend jamais de pose absurde", () => {
    expect(zoomAbout(pose, [0, 0, 0], 0)).toEqual(pose);
    expect(zoomAbout(pose, [0, 0, 0], -2)).toEqual(pose);
    expect(zoomAbout(pose, [0, 0, 0], Number.NaN)).toEqual(pose);
  });
});

describe("worldPerPixel", () => {
  it("reproduit la formule qu'il remplace", () => {
    // Les trois copies inline valaient `2*tan(fov/2)*distance/hauteur`.
    const expected = (2 * Math.tan((50 / 2) * (Math.PI / 180)) * 400) / 700;
    expect(worldPerPixel(400, 700, 50)).toBeCloseTo(expected, 12);
  });

  it("suit la distance et la hauteur du cadre", () => {
    expect(worldPerPixel(800, 700, 50)).toBeCloseTo(
      worldPerPixel(400, 700, 50) * 2,
      12,
    );
    expect(worldPerPixel(400, 1400, 50)).toBeCloseTo(
      worldPerPixel(400, 700, 50) / 2,
      12,
    );
  });

  it("ne rend jamais de facteur absurde", () => {
    expect(worldPerPixel(0, 700, 50)).toBe(0);
    expect(worldPerPixel(Number.NaN, 700, 50)).toBe(0);
    expect(Number.isFinite(worldPerPixel(400, 0, 50))).toBe(true);
    expect(Number.isFinite(worldPerPixel(400, 700, 0))).toBe(true);
  });
});

describe("labelOpacity", () => {
  it("ne nomme un objet qu'une fois qu'il est assez gros pour être lu", () => {
    // Sans seuil, les deux cents galaxies d'un univers plein écriraient leur nom en même
    // temps sur quelques pixels chacune.
    expect(labelOpacity(0.001)).toBe(0);
    expect(labelOpacity(0.05)).toBe(1);
    expect(labelOpacity(0)).toBe(0);
    expect(labelOpacity(Number.NaN)).toBe(0);
  });

  it("passe de l'un à l'autre par un fondu, jamais d'un coup", () => {
    // Un objet posé sur le seuil clignoterait à chaque image sans cette plage.
    const middle = labelOpacity(0.017);
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(1);
    let previous = 0;
    for (let a = 0.012; a <= 0.024; a += 0.001) {
      const now = labelOpacity(a);
      expect(now).toBeGreaterThanOrEqual(previous);
      previous = now;
    }
  });
});
