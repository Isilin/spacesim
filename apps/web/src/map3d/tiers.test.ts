import { describe, expect, it } from "vitest";
import {
  ascend,
  childTierOf,
  clipPlanesFor,
  descend,
  distanceForProgress,
  dollyEase,
  electAnchor,
  labelOpacity,
  nestingScale,
  streakFactor,
  tierAt,
  tierBlend,
  tierProgress,
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

describe("electAnchor", () => {
  const candidates = [
    { id: "a", position: [0, 0, 0] as Vec3 },
    { id: "b", position: [100, 0, 0] as Vec3 },
  ];

  it("retient le plus proche de la cible", () => {
    expect(electAnchor([90, 0, 0], candidates, 50)?.id).toBe("b");
    expect(electAnchor([10, 0, 0], candidates, 50)?.id).toBe("a");
  });

  it("ne rend rien quand la cible ne vise rien", () => {
    // Décision, pas échec : on ne plonge pas dans le vide. Sans cette règle, rezoomer au
    // milieu de nulle part ferait descendre d'un palier sur un objet arbitraire.
    expect(electAnchor([500, 500, 0], candidates, 50)).toBeNull();
    expect(electAnchor([0, 0, 0], [], 50)).toBeNull();
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
