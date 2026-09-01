import { describe, expect, it } from "vitest";
import {
  ascend,
  childTierOf,
  clipPlanesFor,
  descend,
  distanceForProgress,
  electAnchor,
  nestingScale,
  tierAt,
  tierBlend,
  tierProgress,
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
    // échelle supérieure à 1 renverrait un enfant plus grand que son parent.
    expect(nestingScale(100, 1)).toBeLessThanOrEqual(0.5);
    expect(nestingScale(1, 1e12)).toBeGreaterThan(0);
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
