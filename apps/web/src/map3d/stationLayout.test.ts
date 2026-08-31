import { INSTALLATIONS, type Station } from "@spacesim/shared";
import { describe, expect, it } from "vitest";
import { stationLayout } from "./stationLayout.js";

function station(over: Partial<Station> = {}): Station {
  return {
    id: "st",
    ownerId: "e",
    bodyId: "b",
    systemId: "s",
    name: "Test",
    resources: {},
    zones: [],
    zoneQueue: [],
    installations: {},
    installQueue: [],
    marketAccess: "closed",
    marketTaxRate: 0,
    ...over,
  } as unknown as Station;
}

const corridors = (s: Station) =>
  stationLayout(s).parts.filter((p) => p.id.startsWith("corridor-"));

describe("stationLayout — totalité", () => {
  it("une station sans zone rend son seul moyeu", () => {
    const parts = stationLayout(station()).parts;
    expect(parts.length).toBeGreaterThan(0);
    expect(parts.every((p) => p.id.startsWith("hub-"))).toBe(true);
  });

  it("un type de zone inconnu rend une forme neutre, jamais un trou", () => {
    // Ces ids sont libres côté base : un admin peut en créer (chantier 23, ADR 0007).
    const parts = stationLayout(
      station({ zones: [{ zoneTypeId: "zone_inventée", q: 1, r: 0 }] }),
    ).parts;
    expect(parts.some((p) => p.id === "zone-1,0")).toBe(true);
  });

  it("est déterministe", () => {
    const s = station({
      zones: [
        { zoneTypeId: "industrial_zone", q: 1, r: 0 },
        { zoneTypeId: "science_zone", q: 0, r: 1 },
      ],
    });
    expect(stationLayout(s)).toEqual(stationLayout(s));
  });
});

describe("stationLayout — silhouettes de zone", () => {
  it("les quatre types de zone se distinguent par leur forme, pas juste leur hauteur", () => {
    const shapeOf = (zoneTypeId: string) =>
      stationLayout(station({ zones: [{ zoneTypeId, q: 1, r: 0 }] }))
        .parts.filter(
          (p) => !p.id.startsWith("hub-") && !p.id.startsWith("corridor-"),
        )
        .map((p) => p.id.replace(/-?\d+,-?\d+/g, ""))
        .join("+");
    const signatures = [
      "industrial_zone",
      "science_zone",
      "military_zone",
      "commercial_zone",
    ].map(shapeOf);
    expect(new Set(signatures).size).toBe(4);
  });
});

describe("stationLayout — coursives", () => {
  it("une coursive relie chaque paire de cellules voisines, une seule fois", () => {
    // Le moyeu compte comme une cellule : c'est lui qui rattache la première couronne.
    const parts = corridors(
      station({ zones: [{ zoneTypeId: "industrial_zone", q: 1, r: 0 }] }),
    );
    expect(parts).toHaveLength(1);
  });

  it("deux zones voisines entre elles ET du moyeu donnent trois coursives", () => {
    const parts = corridors(
      station({
        zones: [
          { zoneTypeId: "industrial_zone", q: 1, r: 0 },
          { zoneTypeId: "science_zone", q: 0, r: 1 },
        ],
      }),
    );
    // (0,0)-(1,0), (0,0)-(0,1) et (1,0)-(0,1), qui sont bien voisines.
    expect(parts).toHaveLength(3);
  });

  it("aucune coursive entre cellules éloignées", () => {
    // Sans quoi la station afficherait des passerelles qui traversent le vide.
    const parts = corridors(
      station({ zones: [{ zoneTypeId: "industrial_zone", q: 3, r: 0 }] }),
    );
    expect(parts).toHaveLength(0);
  });

  it("une zone en file ne reçoit pas de coursive", () => {
    // Elle n'est pas encore bâtie : la relier donnerait à une intention l'apparence
    // d'une structure.
    const parts = corridors(
      station({
        zoneQueue: [
          {
            zoneTypeId: "industrial_zone",
            q: 1,
            r: 0,
            startedAt: 0,
            finishesAt: 1,
          },
        ],
      }),
    );
    expect(parts).toHaveLength(0);
  });
});

describe("stationLayout — installations", () => {
  it("le nombre d'accessoires rendus égale le nombre d'installations bâties", () => {
    // Invariant de conservation : la répartition zone ↔ installation est une DÉRIVATION
    // de rendu (la donnée n'a qu'un compte à l'échelle de la station), et elle ne doit
    // rien perdre en chemin.
    const parts = stationLayout(
      station({
        zones: [
          { zoneTypeId: "industrial_zone", q: 1, r: 0 },
          { zoneTypeId: "industrial_zone", q: 0, r: 1 },
        ],
        installations: { orbital_solar_array: 3, orbital_smelter_module: 1 },
      }),
    ).parts.filter((p) => p.id.startsWith("fixture-"));
    expect(parts).toHaveLength(4);
  });

  it("une installation sans zone d'accueil se pose quand même", () => {
    // Jamais de perte silencieuse : elle se rabat sur le moyeu.
    const parts = stationLayout(
      station({ installations: { orbital_solar_array: 2 } }),
    ).parts.filter((p) => p.id.startsWith("fixture-"));
    expect(parts).toHaveLength(2);
  });

  it("une installation inconnue du moteur est rendue plutôt qu'ignorée", () => {
    const parts = stationLayout(
      station({ installations: { installation_inventée: 1 } }),
    ).parts.filter((p) => p.id.startsWith("fixture-"));
    expect(parts).toHaveLength(1);
  });

  it("la répartition ne dépend pas de l'ordre du tableau de zones", () => {
    // Trié par clé hexagonale : un accessoire ne doit pas se téléporter si l'ordre de
    // construction change.
    const zones = [
      { zoneTypeId: "industrial_zone", q: 1, r: 0 },
      { zoneTypeId: "industrial_zone", q: 0, r: 1 },
    ];
    const installations = { orbital_solar_array: 2 };
    const a = stationLayout(station({ zones, installations })).parts.filter(
      (p) => p.id.startsWith("fixture-"),
    );
    const b = stationLayout(
      station({ zones: [...zones].reverse(), installations }),
    ).parts.filter((p) => p.id.startsWith("fixture-"));
    expect(a).toEqual(b);
  });

  it("chaque type d'installation du contenu a une zone d'accueil connue", () => {
    // Garde de contenu : une installation dont le `zoneType` n'existe pas se rabattrait
    // silencieusement sur le moyeu pour toujours.
    for (const def of Object.values(INSTALLATIONS)) {
      const parts = stationLayout(
        station({
          zones: [{ zoneTypeId: def.zoneType, q: 1, r: 0 }],
          installations: { [def.id]: 1 },
        }),
      ).parts.filter((p) => p.id.startsWith("fixture-"));
      expect(parts).toHaveLength(1);
      // Posé sur la zone, pas au centre.
      expect(
        Math.hypot(parts[0]!.position[0], parts[0]!.position[1]),
      ).toBeGreaterThan(0.5);
    }
  });
});

describe("stationLayout — zones en attente", () => {
  it("une zone en file sort en fantôme, une zone bâtie non", () => {
    const parts = stationLayout(
      station({
        zones: [{ zoneTypeId: "industrial_zone", q: 1, r: 0 }],
        zoneQueue: [
          {
            zoneTypeId: "science_zone",
            q: 0,
            r: 1,
            startedAt: 0,
            finishesAt: 1,
          },
        ],
      }),
    ).parts;
    expect(parts.find((p) => p.id === "zone-0,1")?.ghost).toBe(true);
    expect(parts.find((p) => p.id === "zone-1,0")?.ghost).toBeFalsy();
  });
});

describe("stationLayout — cadrage", () => {
  it("le rayon englobe toutes les pièces", () => {
    const layout = stationLayout(
      station({
        zones: [
          { zoneTypeId: "industrial_zone", q: 2, r: 0 },
          { zoneTypeId: "military_zone", q: -2, r: 1 },
        ],
      }),
    );
    for (const part of layout.parts) {
      expect(Math.hypot(...part.position)).toBeLessThanOrEqual(layout.radius);
    }
  });
});

describe("stationLayout — densité (chantier 34.5)", () => {
  const fiveZones = station({
    zones: [
      { zoneTypeId: "industrial_zone", q: 1, r: 0 },
      { zoneTypeId: "science_zone", q: 0, r: 1 },
      { zoneTypeId: "military_zone", q: -1, r: 1 },
      { zoneTypeId: "commercial_zone", q: -1, r: 0 },
      { zoneTypeId: "industrial_zone", q: 0, r: -1 },
    ],
    installations: { orbital_solar_array: 3 },
  });

  it("une station bâtie tient la fourchette de densité visée", () => {
    const count = stationLayout(fiveZones).parts.length;
    expect(count, `${count} pièces`).toBeGreaterThanOrEqual(200);
    expect(count, `${count} pièces`).toBeLessThanOrEqual(400);
  });

  it("chaque zone bâtie ajoute sa part de densité", () => {
    // La station grandit avec ce que le joueur bâtit : c'est la promesse de l'ADR 0007 que
    // le décor de l'ADR 0014 ne remplace pas.
    const one = stationLayout(
      station({ zones: [{ zoneTypeId: "industrial_zone", q: 1, r: 0 }] }),
    ).parts.length;
    expect(stationLayout(fiveZones).parts.length).toBeGreaterThan(one * 2);
  });

  it("le décor est en arêtes seules, la structure porte le volume", () => {
    // Le mélange additif s'accumule : rendre aussi les faces du décor noierait la
    // silhouette sous un nuage lumineux (ADR 0014).
    const parts = stationLayout(fiveZones).parts;
    const wire = parts.filter((p) => p.wire);
    const solid = parts.filter((p) => !p.wire && !p.ghost);
    expect(wire.length).toBeGreaterThan(solid.length);
    expect(solid.length).toBeGreaterThan(0);
  });

  it("une zone en file reste distinguable d'une zone bâtie", () => {
    const parts = stationLayout(
      station({
        zones: [{ zoneTypeId: "industrial_zone", q: 1, r: 0 }],
        zoneQueue: [
          {
            zoneTypeId: "science_zone",
            q: 0,
            r: 1,
            startedAt: 0,
            finishesAt: 1,
          },
        ],
      }),
    ).parts;
    // Bâtie : un étage en redan et du décor. En file : ni l'un ni l'autre.
    expect(parts.some((p) => p.id === "zone-tier-1,0")).toBe(true);
    expect(parts.some((p) => p.id === "zone-tier-0,1")).toBe(false);
    expect(parts.some((p) => p.id.startsWith("zone-0,1-"))).toBe(false);
  });
});
