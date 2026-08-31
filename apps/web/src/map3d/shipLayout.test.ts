import { CHASSIS, MODULE_IDS, MODULES } from "@spacesim/shared";
import { describe, expect, it } from "vitest";
import { shipLayout } from "./shipLayout.js";

/**
 * Toute la décision de forme vit dans une fonction pure, précisément pour être vérifiée
 * ici : le dépôt n'a aucun harnais WebGL, et la leçon du chantier 31.24 est qu'un e2e vert
 * ne prouve pas qu'une scène est juste. Voir ADR 0013.
 */

/** Signature d'une silhouette : ce qui doit différer d'un châssis à l'autre. */
function signature(chassisId: string): string {
  const { parts } = shipLayout(chassisId, []);
  return parts
    .map((p) => `${p.shape.kind}:${p.position.map((n) => n.toFixed(2))}`)
    .join("|");
}

describe("shipLayout — totalité", () => {
  it("un châssis inconnu retombe sur le profil générique sans lever", () => {
    // Repli obligatoire (ADR 0007) : une entrée créée depuis l'admin ne doit jamais
    // produire un trou ni une exception.
    const layout = shipLayout("chassis_inexistant", []);
    expect(layout.parts.length).toBeGreaterThan(0);
    expect(layout.radius).toBeGreaterThan(0);
  });

  it("un module inconnu est ignoré, pas fatal", () => {
    expect(() =>
      shipLayout("standard_hull", ["module_inexistant"]),
    ).not.toThrow();
  });

  it("chaque châssis du catalogue produit une silhouette", () => {
    for (const id of Object.keys(CHASSIS)) {
      expect(shipLayout(id, []).parts.length).toBeGreaterThan(0);
    }
  });
});

describe("shipLayout — déterminisme", () => {
  it("deux appels identiques donnent exactement le même vaisseau", () => {
    // La graine est le contrat : aucun `Math.random` ne doit s'introduire ici.
    const a = shipLayout("warframe", ["laser_pulse", "armor_plating"]);
    const b = shipLayout("warframe", ["laser_pulse", "armor_plating"]);
    expect(a).toEqual(b);
  });

  it("deux modules différents au même emplacement ne se posent pas pareil", () => {
    // La graine portait autrefois `slot:index` seulement : un laser et un railgun au
    // même emplacement recevaient rigoureusement le même désordre.
    const laser = shipLayout("warframe", ["laser_pulse"]);
    const rail = shipLayout("warframe", ["railgun"]);
    expect(laser.parts).not.toEqual(rail.parts);
  });
});

describe("shipLayout — identité des châssis", () => {
  it("les six classes de coque sont visiblement distinctes", () => {
    // C'est le risque que l'ADR 0007 s'était désigné à elle-même : « les objets
    // manufacturés risquent de se ressembler si les paramètres de forme sont trop
    // pauvres ». Ce test est la garde contre son retour.
    const kinds = new Map<string, string>();
    for (const [id, def] of Object.entries(CHASSIS)) {
      if (!kinds.has(def.kind)) kinds.set(def.kind, signature(id));
    }
    expect(kinds.size).toBe(6);
    expect(new Set(kinds.values()).size).toBe(6);
  });

  it("un châssis lourd porte plus de coque que son cadet de la même famille", () => {
    // Le compte TOTAL a cessé d'être un témoin valable au chantier 34 : le budget de décor
    // est constant d'un châssis à l'autre, précisément pour qu'un profil de coque ne
    // décide pas en douce de la richesse du rendu. Ce que le palier lourd ajoute vraiment,
    // ce sont des tuyères et des ailerons — c'est donc eux qu'on compte.
    const propulsion = (id: string) =>
      shipLayout(id, []).parts.filter(
        (p) => p.id.startsWith("nozzle-") || p.id.startsWith("fin-"),
      ).length;
    expect(propulsion("battlecruiser")).toBeGreaterThan(propulsion("warframe"));
  });
});

describe("shipLayout — modules", () => {
  it("chaque rôle de module produit une silhouette qui lui est propre", () => {
    // Le modèle porte huit rôles et seulement quatre types d'emplacement ; c'est cette
    // richesse-là que la 3D exploite désormais.
    const byRole = new Map<string, string>();
    for (const id of MODULE_IDS) {
      const role = MODULES[id].role;
      if (byRole.has(role)) continue;
      const parts = shipLayout("standard_hull", [id]).parts.filter((p) =>
        p.id.startsWith("mod-"),
      );
      byRole.set(role, parts.map((p) => p.shape.kind).join("+"));
    }
    expect(byRole.size).toBeGreaterThanOrEqual(6);
    // Au moins cinq familles de forme distinctes parmi les rôles présents dans le contenu.
    expect(new Set(byRole.values()).size).toBeGreaterThanOrEqual(5);
  });

  it("une arme à longue portée a un fût plus long qu'une arme rapprochée", () => {
    const barrelOf = (moduleId: string) => {
      const part = shipLayout("warframe", [moduleId]).parts.find(
        (p) => p.id === "mod-weapon-0-0",
      );
      return part && part.shape.kind === "prism" ? part.shape.length : 0;
    };
    // La forme vient d'une donnée réelle — le profil de portée du module — et pas d'une
    // table écrite à la main.
    expect(barrelOf("railgun")).toBeGreaterThan(barrelOf("autocannon"));
  });

  it("tout module monté et connu est représenté", () => {
    // L'invariant « ce que je vois est ce que j'ai conçu ». Le rendu d'avant groupait les
    // modules par COMPTE d'emplacement et jetait leur identité : deux plans différents
    // rendaient exactement la même image.
    const modules = [
      "laser_pulse",
      "armor_plating",
      "ion_thruster",
      "cargo_pod",
    ];
    const parts = shipLayout("standard_hull", modules).parts;
    for (let i = 0; i < modules.length; i++) {
      const slot = MODULES[modules[i] as keyof typeof MODULES].slot;
      expect(parts.some((p) => p.id.startsWith(`mod-${slot}-`))).toBe(true);
    }
  });
});

describe("shipLayout — échelle et cadrage", () => {
  it("un gros tonnage donne un vaisseau plus grand", () => {
    expect(shipLayout("battlecruiser", []).radius).toBeGreaterThan(
      shipLayout("scout_frame", []).radius,
    );
  });

  it("le rayon englobe toutes les pièces", () => {
    // C'est ce rayon qui doit cadrer la caméra : s'il ment, l'objet sort du cadre.
    const layout = shipLayout("battlecruiser", [
      "railgun",
      "aegis_shield",
      "warp_drive",
      "cargo_hold_xl",
    ]);
    for (const part of layout.parts) {
      expect(Math.hypot(...part.position)).toBeLessThanOrEqual(layout.radius);
    }
  });
});

describe("shipLayout — budget de lueur", () => {
  it("les seules pièces lumineuses sont les tuyères", () => {
    // Le `ui-brief` impose « une seule intensité de lueur, réservée aux accents ».
    // Vérifié mécaniquement, sinon la règle s'érode en silence au fil des ajouts.
    const layout = shipLayout("battlecruiser", ["railgun", "warp_drive"]);
    const glowing = layout.parts.filter((p) => p.emissive);
    expect(glowing.length).toBeGreaterThan(0);
    for (const part of glowing)
      expect(part.id.startsWith("nozzle-")).toBe(true);
  });
});

describe("shipLayout — densité (chantier 34.4)", () => {
  it("chaque châssis nu tient la fourchette de densité visée", () => {
    // C'est l'assertion qui empêche la densité de repartir vers le bas sans qu'on le voie.
    // Elle est large à dessein : le budget est réparti au prorata de la surface des troncs,
    // donc un profil court reste plus léger qu'un profil long — ce qui est voulu.
    for (const id of Object.keys(CHASSIS)) {
      const count = shipLayout(id, []).parts.length;
      expect(count, `${id} rend ${count} pièces`).toBeGreaterThanOrEqual(180);
      expect(count, `${id} rend ${count} pièces`).toBeLessThanOrEqual(400);
    }
  });

  it("le décor est en arêtes seules, la structure porte le volume", () => {
    // Le mélange additif s'accumule : rendre aussi les faces du décor noierait la coque et
    // jusqu'aux masses de la superstructure sous un nuage lumineux (ADR 0014).
    const parts = shipLayout("standard_hull", []).parts;
    const wire = parts.filter((p) => p.wire);
    const solid = parts.filter((p) => !p.wire);
    expect(wire.length).toBeGreaterThan(solid.length);
    expect(solid.length).toBeGreaterThan(10);
  });

  it("un vaisseau garni est plus dense qu'un vaisseau nu", () => {
    const chassis = CHASSIS.battlecruiser ?? Object.values(CHASSIS)[0]!;
    const modules = MODULE_IDS.filter(
      (id) => MODULES[id].slot === "weapon",
    ).slice(0, 3);
    const bare = shipLayout(chassis.id, []).parts.length;
    const fitted = shipLayout(chassis.id, modules).parts.length;
    expect(fitted).toBeGreaterThan(bare);
  });
});

describe("shipLayout — la décoration est une empreinte du plan (ADR 0014)", () => {
  it("deux châssis différents ne se décorent pas pareil", () => {
    const decorOf = (id: string) =>
      shipLayout(id, [])
        .parts.filter((p) => p.id.includes("greeble"))
        .map((p) => p.position.map((n) => n.toFixed(3)).join(","))
        .join("|");
    const ids = Object.keys(CHASSIS);
    const signatures = new Set(ids.map(decorOf));
    // Le repli générique fait converger plusieurs châssis d'une même classe : on exige que
    // les CLASSES se distinguent, pas chacun des identifiants.
    expect(signatures.size).toBeGreaterThanOrEqual(5);
  });

  it("deux modules différents au même emplacement reçoivent des garnitures différentes", () => {
    const fitOf = (moduleId: string) =>
      shipLayout("standard_hull", [moduleId])
        .parts.filter((p) => p.id.includes("-fit-"))
        .map((p) => p.position.map((n) => n.toFixed(3)).join(","))
        .join("|");
    const weapons = MODULE_IDS.filter((id) => MODULES[id].slot === "weapon");
    expect(fitOf(weapons[0]!)).not.toBe(fitOf(weapons[1]!));
  });

  it("monter un module ne rebat pas la décoration de la coque", () => {
    // Sans cela, la peau du vaisseau bouillonnerait sous les yeux du joueur à chaque clic
    // dans le concepteur. L'empreinte du plan est portée par les garnitures, pas par elle.
    const hullDecor = (modules: string[]) =>
      shipLayout("standard_hull", modules)
        .parts.filter((p) => p.id.startsWith("hull-"))
        .map((p) => p.id)
        .join("|");
    const weapon = MODULE_IDS.find((id) => MODULES[id].slot === "weapon")!;
    expect(hullDecor([])).toBe(hullDecor([weapon]));
  });
});
