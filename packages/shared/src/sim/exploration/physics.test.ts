import { describe, expect, it } from "vitest";
import type { CentralBody } from "../../model/universe.js";
import {
  atmosphereRetention,
  equilibriumTempK,
  escapeVelocity,
  greenhouseK,
  habitabilityOf,
  habitableZone,
  iceLine,
  irradianceAt,
  luminosityOf,
  radiationAt,
  surfaceGravity,
  surfaceTempC,
  systemLuminosity,
} from "./physics.js";

/**
 * La chaîne physique (chantier 45.2).
 *
 * Ces cas ne vérifient pas des nombres choisis : ils vérifient que la chaîne **rend le
 * système solaire réel**. C'est le seul étalon disponible, et il est exigeant — la Terre à
 * 255 K d'équilibre et 288 K en surface, Vénus plus chaude que Mercure malgré un albédo trois
 * fois supérieur, Mars sèche et gelée, Europe qui retient une trace là où Mercure ne retient
 * rien.
 *
 * Une chaîne qui reproduit ces cinq corps ne peut pas être arbitraire. Une qui les manque
 * n'aurait aucune raison d'être crue sur les mondes inventés.
 */

const star = (typeId: string, mass: number): CentralBody => ({
  id: "s",
  systemId: "sys",
  name: "S",
  kind: "star",
  typeId,
  rank: 0,
  mass,
  orbitRadius: 0,
  orbitAngle: 0,
  inclination: 0,
  ascendingNode: 0,
});

/** Le Soleil : type G au milieu de sa fourchette de masse, donc luminosité 1 par calage. */
const SUN = star("yellow_dwarf", 0.92);

describe("étage stellaire", () => {
  it("le Soleil vaut une luminosité solaire", () => {
    expect(luminosityOf(SUN)).toBeCloseTo(1, 1);
  });

  it("la masse module la luminosité, fortement sur la séquence principale", () => {
    // `L ∝ M^3,5` : doubler la masse multiplie la luminosité par onze.
    const light = luminosityOf(star("yellow_dwarf", 0.8));
    const heavy = luminosityOf(star("yellow_dwarf", 1.04));
    expect(heavy / light).toBeGreaterThan(2);
  });

  it("une naine blanche s'assombrit en grossissant", () => {
    // Exposant négatif : un corps dégénéré RÉTRÉCIT quand sa masse augmente.
    expect(luminosityOf(star("white_dwarf", 1.3))).toBeLessThan(
      luminosityOf(star("white_dwarf", 0.6)),
    );
  });

  it("une singularité n'éclaire pas", () => {
    const hole: CentralBody = { ...SUN, kind: "blackHole", typeId: "stellar" };
    expect(luminosityOf(hole)).toBe(0);
    expect(habitableZone([hole])).toEqual([0, 0]);
  });

  it("les corps centraux éclairent ensemble", () => {
    expect(systemLuminosity([SUN, SUN])).toBeCloseTo(2 * luminosityOf(SUN), 5);
  });
});

describe("zone habitable et ligne des glaces", () => {
  it("la Terre est dans la zone habitable du Soleil, Mars au bord", () => {
    const [inner, outer] = habitableZone([SUN]);
    expect(inner).toBeLessThan(1);
    expect(outer).toBeGreaterThan(1);
    // Mars, à 1,52 UA, tient dans la borne externe conservatrice.
    expect(outer).toBeGreaterThan(1.5);
    // Vénus, à 0,72 UA, en est exclue — c'est ce qui la rend invivable.
    expect(inner).toBeGreaterThan(0.72);
  });

  it("la ligne des glaces du Soleil tombe dans la ceinture d'astéroïdes", () => {
    // ~2,7 UA : les astéroïdes internes sont rocheux, les externes glacés, et c'est là que
    // Jupiter s'est formé.
    expect(iceLine([SUN])).toBeGreaterThan(2);
    expect(iceLine([SUN])).toBeLessThan(3.5);
  });

  it("elle suit la racine de la luminosité, pas la luminosité", () => {
    // Recevoir autant de flux deux fois plus loin demande quatre fois plus de luminosité.
    const dim = habitableZone([star("red_dwarf", 0.26)]);
    const bright = habitableZone([star("blue_giant", 30)]);
    expect(bright[0] / dim[0]).toBeGreaterThan(20);
  });

  it("la zone habitable d'une naine rouge est hors de portée d'une échelle absolue", () => {
    // Le constat qui a imposé de poser les orbites RELATIVEMENT à la zone habitable : à
    // 0,12–0,20 UA, aucune orbite d'une échelle fixe ne peut y tomber, et les naines rouges
    // sont la classe la plus commune.
    const [inner, outer] = habitableZone([star("red_dwarf", 0.26)]);
    expect(outer).toBeLessThan(0.3);
    expect(inner).toBeGreaterThan(0);
  });
});

describe("étage structurel", () => {
  it("la Terre a une gravité de 1 g et une libération de 11,2 km/s", () => {
    expect(surfaceGravity(1, 1)).toBeCloseTo(1, 5);
    expect(escapeVelocity(1, 1)).toBeCloseTo(11.19, 2);
  });

  it("une planète naine ne retient presque rien", () => {
    // Cérès : 0,074 rayon terrestre, densité 0,38. Vitesse réelle ~0,51 km/s.
    const v = escapeVelocity(0.074, 0.38);
    expect(v).toBeLessThan(1);
    expect(v).toBeGreaterThan(0.2);
  });

  it("une super-Terre retient bien mieux qu'une rocheuse ordinaire", () => {
    expect(escapeVelocity(3, 1.1)).toBeGreaterThan(escapeVelocity(1, 1) * 2.5);
  });
});

describe("étage thermique — l'étalon du système solaire", () => {
  it("la Terre est à 255 K d'équilibre", () => {
    // Irradiance 1, albédo 0,3 : la valeur de manuel.
    expect(equilibriumTempK(1, 0.3)).toBeCloseTo(255, 0);
  });

  it("la serre terrestre porte la surface à ~15 °C", () => {
    const eq = equilibriumTempK(1, 0.3);
    // +33 K à 1 bar, la valeur réelle.
    expect(surfaceTempC(eq, greenhouseK(1, 33))).toBeCloseTo(15, 0);
  });

  it("Vénus est plus chaude que Mercure, malgré un albédo bien supérieur", () => {
    // Le cas qui prouve que la serre fait le travail, et non la distance : Vénus renvoie
    // 77 % de ce qu'elle reçoit, Mercure 7 %, et Vénus est pourtant à 460 °C.
    const venus = surfaceTempC(
      equilibriumTempK(irradianceAt([SUN], 0.72), 0.77),
      greenhouseK(92, 52),
    );
    const mercury = surfaceTempC(
      equilibriumTempK(irradianceAt([SUN], 0.39), 0.07),
      0,
    );
    expect(venus).toBeGreaterThan(mercury);
    expect(venus).toBeGreaterThan(300);
  });

  it("Mars est gelée", () => {
    const mars = surfaceTempC(
      equilibriumTempK(irradianceAt([SUN], 1.52), 0.25),
      greenhouseK(0.006, 33),
    );
    expect(mars).toBeLessThan(-30);
  });

  it("un albédo élevé refroidit à irradiance égale", () => {
    expect(equilibriumTempK(1, 0.62)).toBeLessThan(equilibriumTempK(1, 0.12));
  });
});

describe("rétention atmosphérique", () => {
  it("la Terre vaut la référence", () => {
    expect(atmosphereRetention(11.19, 255)).toBeCloseTo(1, 5);
  });

  it("Mercure est nue, une géante accumule tout", () => {
    // Mercure : 4,3 km/s, 440 K d'équilibre. Trop chaud et trop léger pour rien garder.
    expect(atmosphereRetention(4.3, 440)).toBeLessThan(0.15);
    // Jupiter : 59,5 km/s, 110 K. Elle retient jusqu'à l'hydrogène.
    expect(atmosphereRetention(59.5, 110)).toBeGreaterThan(2.5);
  });

  it("le froid compense une faible gravité", () => {
    // Titan retient une atmosphère plus épaisse que celle de la Terre avec une vitesse de
    // libération de 2,6 km/s — parce qu'il fait 94 K. C'est ce couplage que la rétention
    // capture, et qu'une table par type de corps ne pouvait pas exprimer.
    expect(atmosphereRetention(2.6, 94)).toBeGreaterThan(
      atmosphereRetention(2.6, 300),
    );
  });
});

describe("rayonnement", () => {
  it("il décroît avec le carré de la distance", () => {
    const near = radiationAt([SUN], 0.3);
    const far = radiationAt([SUN], 3);
    expect(near).toBeGreaterThan(far);
  });

  it("un pulsar stérilise son système entier, malgré une luminosité dérisoire", () => {
    // Son faisceau vient de sa rotation et de son champ, pas de sa fusion : pondérer son
    // rayonnement par son flux optique l'aurait rendu inoffensif.
    expect(radiationAt([star("pulsar", 1.4)], 2)).toBeGreaterThan(1);
  });

  it("une étoile ordinaire n'est pas plus dangereuse parce qu'elle est petite", () => {
    // Le défaut qui écrasait 40 % du ciel : en `sortie / d²`, une naine rouge devenait létale
    // dans sa propre zone habitable, qui est à 0,13 UA. Rapporté au flux, son danger à sa
    // zone habitable est comparable à celui du Soleil à la sienne.
    const dwarf = star("red_dwarf", 0.26);
    const atDwarfHz = radiationAt([dwarf], habitableZone([dwarf])[0]);
    const atSunHz = radiationAt([SUN], habitableZone([SUN])[0]);
    expect(atDwarfHz).toBeLessThan(atSunHz * 3);
  });

  it("il est borné, pour rester une échelle 0–5", () => {
    expect(radiationAt([star("pulsar", 1.4)], 0.001)).toBeLessThanOrEqual(5);
  });
});

describe("habitabilité calculée", () => {
  const earth = {
    surfaceTempC: 15,
    pressureBar: 1,
    gravityG: 1,
    radiation: 0.2,
    breathable: true,
  };

  it("la Terre est excellente", () => {
    expect(habitabilityOf(earth)).toBeGreaterThan(85);
  });

  it("un facteur rédhibitoire appauvrit sans condamner", () => {
    // La falaise à zéro a vidé la galaxie : 76 % des corps sans habitabilité. Dans ce jeu,
    // l'habitabilité mesure à quel point l'environnement AIDE une colonie, pas s'il s'agit
    // de la Terre — on colonise sous dôme, mal. Le zéro est réservé à ce qui n'a pas de sol.
    for (const hostile of [
      { ...earth, pressureBar: 92 },
      { ...earth, gravityG: 3 },
      { ...earth, surfaceTempC: 460 },
      { ...earth, surfaceTempC: -80 },
    ]) {
      const score = habitabilityOf(hostile);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(habitabilityOf(earth) * 0.75);
    }
  });

  it("ne pas respirer coûte, sans condamner", () => {
    const sealed = habitabilityOf({ ...earth, breathable: false });
    expect(sealed).toBeGreaterThan(0);
    expect(sealed).toBeLessThan(habitabilityOf(earth));
  });

  it("le rayonnement retranche au lieu d'annuler", () => {
    // Un monde par ailleurs parfait reste exploitable sous un ciel dur.
    const harsh = habitabilityOf({ ...earth, radiation: 4 });
    expect(harsh).toBeGreaterThan(0);
    expect(harsh).toBeLessThan(habitabilityOf(earth) * 0.75);
  });

  it("reste dans 0–100 sur tout le domaine", () => {
    for (const t of [-100, -20, 0, 20, 40, 200]) {
      for (const p of [0, 0.5, 1, 3, 90]) {
        for (const g of [0.05, 0.5, 1, 2, 5]) {
          const h = habitabilityOf({
            surfaceTempC: t,
            pressureBar: p,
            gravityG: g,
            radiation: 1,
            breathable: false,
          });
          expect(h).toBeGreaterThanOrEqual(0);
          expect(h).toBeLessThanOrEqual(100);
        }
      }
    }
  });
});
