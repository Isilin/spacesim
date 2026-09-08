import { describe, expect, it } from "vitest";
import {
  GALAXY_SPACING,
  INITIAL_GALAXIES,
  MAX_CENTRAL_BODIES,
} from "./constants.js";
import {
  GALAXY_TYPE_IDS,
  GALAXY_TYPES,
  type GalaxyTypeId,
} from "./content/astro/galaxy-types.js";
import { blackHoleType } from "./content/astro/black-hole-types.js";
import { whiteHoleType } from "./content/astro/white-hole-types.js";
import { isDrifter, starsOf } from "./model/universe.js";
import {
  allPlanets,
  allSystems,
  findGalaxyOfSystem,
  galaxyDefAt,
  generateGalaxyAt,
  generateUniverse,
  STAR_COUNT_WEIGHTS,
} from "./universe.js";

describe("generateUniverse", () => {
  it("est déterministe pour une même seed", () => {
    const a = generateUniverse("alpha");
    const b = generateUniverse("alpha");
    expect(a).toEqual(b);
  });

  it("diffère selon la seed", () => {
    const a = generateUniverse("alpha");
    const b = generateUniverse("beta");
    expect(a).not.toEqual(b);
  });

  it("produit INITIAL_GALAXIES galaxies par défaut, avec des systèmes uniques", () => {
    const u = generateUniverse("gamma");
    expect(u.galaxies).toHaveLength(INITIAL_GALAXIES);
    const ids = allSystems(u).map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    // La galaxie d'origine est la plus vaste : c'est le berceau des empires.
    expect(u.galaxies[0]!.systems.length).toBeGreaterThan(
      u.galaxies[1]!.systems.length,
    );
  });

  it("génère planètes en orbite, lunes rattachées et ceintures", () => {
    const u = generateUniverse("gamma");
    const planets = allPlanets(u);
    const moons = planets.filter((p) => p.kind === "moon");
    expect(moons.length).toBeGreaterThan(0);
    for (const moon of moons) {
      const parent = planets.find((p) => p.id === moon.parentPlanetId);
      expect(parent).toBeDefined();
      expect(parent!.kind).toBe("planet");
      expect(moon.systemId).toBe(parent!.systemId);
      expect(moon.habitability).toBeLessThanOrEqual(40);
    }
    for (const p of planets) {
      expect(p.habitability).toBeGreaterThanOrEqual(0);
      expect(p.habitability).toBeLessThanOrEqual(100);
      expect(p.orbitRadius).toBeGreaterThan(0);
    }
    expect(allSystems(u).some((s) => s.belts.length > 0)).toBe(true);
  });

  it("chaque galaxie a un graphe connexe", () => {
    const u = generateUniverse("delta");
    for (const galaxy of u.galaxies) {
      const adjacency = new Map<string, string[]>();
      for (const [a, b] of galaxy.links) {
        adjacency.set(a, [...(adjacency.get(a) ?? []), b]);
        adjacency.set(b, [...(adjacency.get(b) ?? []), a]);
      }
      const visited = new Set<string>();
      const queue = [galaxy.systems[0]!.id];
      while (queue.length > 0) {
        const id = queue.pop()!;
        if (visited.has(id)) continue;
        visited.add(id);
        queue.push(...(adjacency.get(id) ?? []));
      }
      expect(visited.size).toBe(galaxy.systems.length);
    }
  });

  it("findGalaxyOfSystem retrouve la bonne galaxie", () => {
    const u = generateUniverse("delta");
    const sys = u.galaxies[1]!.systems[0]!;
    expect(findGalaxyOfSystem(u, sys.id)?.id).toBe(u.galaxies[1]!.id);
    expect(findGalaxyOfSystem(u, "nope")).toBeUndefined();
  });
});

describe("univers extensible (chantier 9)", () => {
  it("une galaxie se génère seule, identique à sa version dans l'univers complet", () => {
    const u = generateUniverse("epsilon", 5);
    for (let i = 0; i < 5; i++) {
      expect(generateGalaxyAt("epsilon", i)).toEqual(u.galaxies[i]);
    }
  });

  it("agrandir l'univers laisse les galaxies existantes strictement inchangées", () => {
    const small = generateUniverse("zeta", 3);
    const large = generateUniverse("zeta", 12);
    expect(large.galaxies).toHaveLength(12);
    expect(large.galaxies.slice(0, 3)).toEqual(small.galaxies);
  });

  it("s'étend loin sans collision : ids et noms de galaxie restent uniques", () => {
    const u = generateUniverse("eta", 40);
    const ids = u.galaxies.map((g) => g.id);
    const names = u.galaxies.map((g) => g.name);
    expect(new Set(ids).size).toBe(40);
    expect(new Set(names).size).toBe(40);
    // Systèmes : ids uniques dans tout l'univers, noms uniques dans chaque galaxie.
    const systemIds = allSystems(u).map((s) => s.id);
    expect(new Set(systemIds).size).toBe(systemIds.length);
    for (const galaxy of u.galaxies) {
      const systemNames = galaxy.systems.map((s) => s.name);
      expect(new Set(systemNames).size).toBe(systemNames.length);
    }
  });

  it("les galaxies s'espacent sur la spirale sans se chevaucher", () => {
    const defs = Array.from({ length: 60 }, (_, i) => galaxyDefAt("theta", i));
    let closest = Infinity;
    for (let i = 0; i < defs.length; i++) {
      for (let j = i + 1; j < defs.length; j++) {
        closest = Math.min(
          closest,
          Math.hypot(defs[i]!.x - defs[j]!.x, defs[i]!.y - defs[j]!.y),
        );
      }
    }
    // Densité constante : les voisines restent à peu près à un espacement l'une de l'autre.
    expect(closest).toBeGreaterThan(GALAXY_SPACING * 0.7);
  });

  it("les gisements s'enrichissent avec l'éloignement, jusqu'à un plafond", () => {
    const home = galaxyDefAt("iota", 0);
    const near = galaxyDefAt("iota", 4);
    const far = galaxyDefAt("iota", 30);
    expect(home.depositBonus).toBe(1);
    expect(near.depositBonus).toBeGreaterThan(home.depositBonus);
    expect(far.depositBonus).toBeGreaterThan(near.depositBonus);
    expect(far.depositBonus).toBeLessThanOrEqual(3);
  });

  it("galaxyDefAt est déterministe et dépend de la seed", () => {
    expect(galaxyDefAt("kappa", 7)).toEqual(galaxyDefAt("kappa", 7));
    // Même géométrie (l'index fixe la position), mais nom et taille dépendent de la seed.
    expect(galaxyDefAt("kappa", 7).name).not.toBe(
      galaxyDefAt("lambda", 7).name,
    );
  });
});

describe("type de galaxie (chantier 45.1)", () => {
  /**
   * Le type a cessé d'être dérivé pour devenir persisté (ADR 0021), et il précède
   * désormais la taille au lieu d'en être déduit. Ce que ces cas protègent n'est plus un
   * accord de dérivation — c'est que le générateur ne pose jamais une galaxie dont le type
   * est inconnu du catalogue, ou dont la taille contredit le type qu'elle porte.
   *
   * Sans eux, une faute de frappe dans un identifiant se rattraperait silencieusement par
   * le repli générique : la galaxie existerait, se dessinerait, et ne serait simplement
   * pas celle qu'on croit.
   */
  const universe = generateUniverse("types-45", 12);

  it("chaque galaxie porte un type connu du catalogue", () => {
    for (const galaxy of universe.galaxies) {
      expect(GALAXY_TYPE_IDS, galaxy.id).toContain(galaxy.typeId);
    }
  });

  it("la taille d'une galaxie respecte la fourchette de son type", () => {
    // `galaxy.systems` inclut les errants depuis le chantier 45.1 — ce sont des systèmes,
    // et c'est tout leur intérêt. La fourchette du type porte sur les systèmes ORDINAIRES :
    // c'est d'eux que le générateur tire le nombre, avant d'ajouter le halo.
    for (const galaxy of universe.galaxies) {
      const [min, max] =
        GALAXY_TYPES[galaxy.typeId as GalaxyTypeId].systemRange;
      const ordinary = galaxy.systems.filter((s) => !isDrifter(s)).length;
      expect(
        ordinary,
        `${galaxy.id} (${galaxy.typeId})`,
      ).toBeGreaterThanOrEqual(min);
      expect(ordinary, `${galaxy.id} (${galaxy.typeId})`).toBeLessThanOrEqual(
        max,
      );
    }
  });

  it("la galaxie mère a un type qui admet ses 520 systèmes", () => {
    const home = universe.galaxies[0]!;
    const [min, max] = GALAXY_TYPES[home.typeId as GalaxyTypeId].systemRange;
    const ordinary = home.systems.filter((s) => !isDrifter(s)).length;
    expect(ordinary).toBe(520);
    expect(520).toBeGreaterThanOrEqual(min);
    expect(520).toBeLessThanOrEqual(max);
  });

  it("le type ne dépend que de la seed et de l'index, pas des galaxies voisines", () => {
    // Même garantie que pour le reste du générateur (ADR 0002) : matérialiser une galaxie
    // de frontière ne doit rien devoir à celles déjà tirées.
    const wider = generateUniverse("types-45", 20);
    for (let i = 0; i < universe.galaxies.length; i++) {
      expect(wider.galaxies[i]!.typeId).toBe(universe.galaxies[i]!.typeId);
    }
  });

  it("plusieurs types apparaissent sur une douzaine de galaxies", () => {
    // Huit types pondérés : n'en voir qu'un sur douze tirages signalerait un tirage cassé.
    const seen = new Set(universe.galaxies.map((g) => g.typeId));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("singularités errantes et ponts (chantier 45.1)", () => {
  /**
   * Un errant est un **système** sans étoile ni monde, et non une entité nouvelle : c'est
   * ce qui lui donne gratuitement le graphe de sauts, la carte, la base et le brouillard.
   * Ces cas protègent les conséquences de ce choix — celles qu'un type ne peut pas dire.
   */
  const universe = generateUniverse("errants-45", 6);
  // Le discriminant est la NATURE de l'ancre : depuis que le palier 2 donne des corps
  // centraux à tous les systèmes, « il en a » ne distingue plus rien.
  const drifters = (galaxy: (typeof universe.galaxies)[number]) =>
    galaxy.systems.filter(isDrifter);

  it("chaque galaxie en porte, dans l'ordre de grandeur de sa densité", () => {
    for (const galaxy of universe.galaxies) {
      const expected = Math.round(
        (GALAXY_TYPES[galaxy.typeId as GalaxyTypeId].singularityDensity *
          (galaxy.systems.length - drifters(galaxy).length)) /
          100,
      );
      expect(drifters(galaxy).length, galaxy.id).toBe(expected);
      expect(drifters(galaxy).length, galaxy.id).toBeGreaterThan(0);
    }
  });

  it("un errant n'a qu'un corps central, aucun monde et aucun comptoir", () => {
    // Pas un système appauvri : un objet d'une autre nature, qui se traverse et s'exploite
    // au lieu de se coloniser.
    for (const galaxy of universe.galaxies) {
      for (const d of drifters(galaxy)) {
        expect(d.stars, d.id).toHaveLength(1);
        expect(d.planets, d.id).toHaveLength(0);
        expect(d.belts, d.id).toHaveLength(0);
        expect(d.station, d.id).toBeUndefined();
        expect(["blackHole", "whiteHole"], d.id).toContain(d.stars![0]!.kind);
        expect(d.stars![0]!.rank).toBe(0);
        expect(d.stars![0]!.orbitRadius).toBe(0);
        expect(d.stars![0]!.mass).toBeGreaterThan(0);
      }
    }
  });

  it("un errant est une destination du graphe, pas du décor", () => {
    for (const galaxy of universe.galaxies) {
      const linked = new Set(galaxy.links.flat());
      for (const d of drifters(galaxy)) {
        expect(linked.has(d.id), `${d.id} sans liaison`).toBe(true);
      }
    }
  });

  it("l'ancre de portail n'est jamais un errant", () => {
    // Elle est le point d'arrivée des portails inter-galactiques : un trou noir sans monde
    // ni comptoir en ferait une porte d'entrée absurde. Les errants vivant dans le halo,
    // le plus excentré des systèmes serait presque toujours l'un d'eux.
    for (const galaxy of universe.galaxies) {
      const ids = new Set(drifters(galaxy).map((d) => d.id));
      expect(ids.has(galaxy.anchorSystemId), galaxy.id).toBe(false);
    }
  });

  it("les noms des errants ne doublonnent aucun système", () => {
    for (const galaxy of universe.galaxies) {
      const names = galaxy.systems.map((s) => s.name);
      expect(new Set(names).size, galaxy.id).toBe(names.length);
    }
  });

  it("un pont relie une fontaine blanche à un trou noir, en paire canonique", () => {
    for (const galaxy of universe.galaxies) {
      const byId = new Map(galaxy.systems.map((s) => [s.id, s]));
      const used = new Set<string>();
      for (const [a, b] of galaxy.bridges) {
        expect(a < b, `${a}/${b} non canonique`).toBe(true);
        const kinds = [a, b].map((id) => byId.get(id)?.stars?.[0]?.kind);
        expect(kinds.sort()).toEqual(["blackHole", "whiteHole"]);
        // Aucune bouche n'est appariée deux fois : un passage a deux extrémités.
        for (const id of [a, b]) {
          expect(used.has(id), `${id} apparié deux fois`).toBe(false);
          used.add(id);
        }
      }
    }
  });

  it("un pont saute plus loin que la portée minimale de sa fontaine", () => {
    // Sans quoi il doublerait une liaison existante au lieu de raccourcir quoi que ce soit.
    for (const galaxy of universe.galaxies) {
      const byId = new Map(galaxy.systems.map((s) => [s.id, s]));
      const adjacency = new Map<string, string[]>();
      for (const [a, b] of galaxy.links) {
        adjacency.set(a, [...(adjacency.get(a) ?? []), b]);
        adjacency.set(b, [...(adjacency.get(b) ?? []), a]);
      }
      for (const [a, b] of galaxy.bridges) {
        const mouth = [a, b].find(
          (id) => byId.get(id)!.stars![0]!.kind === "whiteHole",
        )!;
        const other = mouth === a ? b : a;
        const [minHops] = whiteHoleType(
          byId.get(mouth)!.stars![0]!.typeId,
        ).wormholeRange;

        let hops = 0;
        const seen = new Set([mouth]);
        let frontier = [mouth];
        while (frontier.length > 0 && !seen.has(other)) {
          hops++;
          const next: string[] = [];
          for (const id of frontier)
            for (const n of adjacency.get(id) ?? [])
              if (!seen.has(n)) {
                seen.add(n);
                next.push(n);
              }
          frontier = next;
          if (seen.has(other)) break;
        }
        expect(hops, `${a}/${b}`).toBeGreaterThanOrEqual(minHops);
      }
    }
  });
});

describe("les quatre emplacements de singularité (chantier 45.5)", () => {
  /**
   * Le garde-fou qui manquait. Les catalogues déclarent depuis le palier 1 quatre
   * emplacements — cœur de galaxie, corps central, compagnon, errant — et le générateur n'en
   * produisait que deux : `generateStars` ne tirait que dans les tables d'étoiles. Mesuré sur
   * 1427 systèmes avant correction : `primary` 0, `companion` 0.
   *
   * Rien ne le signalait. Les types étaient cohérents, `placements` et `weights` étaient lus
   * par les tests de catalogue, et `microquasar` comme `torrent` n'existaient nulle part.
   * Seul un comptage sur un univers généré pouvait le voir.
   */
  const universe = generateUniverse("emplacements-45-5", 6);
  const systems = allSystems(universe);
  const singular = (system: (typeof systems)[number]) =>
    starsOf(system).filter((b) => b.kind !== "star");

  it("chaque emplacement déclaré par un catalogue est réellement produit", () => {
    const seen = new Set<string>();
    for (const galaxy of universe.galaxies) {
      // Le cœur n'est pas un corps central de système : il se lit sur la galaxie.
      seen.add("core");
      for (const system of galaxy.systems) {
        if (isDrifter(system)) {
          seen.add("drifter");
          continue;
        }
        for (const body of singular(system)) {
          seen.add(body.rank === 0 ? "primary" : "companion");
        }
      }
    }
    expect([...seen].sort()).toEqual([
      "companion",
      "core",
      "drifter",
      "primary",
    ]);
  });

  it("une singularité dans un système reste rare, et le système reste un système", () => {
    // Un trou noir primaire éteint son système : ses mondes gèlent. La part se paie donc
    // directement sur `habitability.calibration.test.ts`, et doit rester marginale.
    const inSystem = systems.filter(
      (s) => !isDrifter(s) && singular(s).length > 0,
    );
    const share = inSystem.length / systems.length;
    expect(share).toBeGreaterThan(0.005);
    expect(share).toBeLessThan(0.06);
    for (const system of inSystem) {
      // Ce n'est pas un errant : il a des mondes, une place sur un bras, et se colonise.
      expect(system.planets.length, system.id).toBeGreaterThan(0);
    }
  });

  it("un type ne se pose que là où son catalogue l'autorise", () => {
    for (const system of systems) {
      for (const body of singular(system)) {
        const def =
          body.kind === "blackHole"
            ? blackHoleType(body.typeId)
            : whiteHoleType(body.typeId);
        const placement = isDrifter(system)
          ? "drifter"
          : body.rank === 0
            ? "primary"
            : "companion";
        expect(def.placements, `${system.id}/${body.typeId}`).toContain(
          placement,
        );
      }
    }
  });
});

describe("corps centraux et rendu (chantier 47)", () => {
  it("le générateur ne produit jamais plus de corps que le rendu n'en monte", () => {
    // `SystemLayer` monte exactement `MAX_CENTRAL_BODIES` sources de lumière, quelles que
    // soient les étoiles présentes : un nombre variable ferait recompiler tous les matériaux
    // de la scène à chaque entrée dans un système.
    //
    // Le lien entre les deux est ce test, et lui seul. Une ligne `[4, 2]` ajoutée à la table
    // de tirage ferait naître des systèmes à quatre corps dont le quatrième serait noir, sans
    // que rien d'autre ne le signale — le client lirait un emplacement qui n'existe pas.
    const most = Math.max(...STAR_COUNT_WEIGHTS.map(([count]) => count));
    expect(most).toBeLessThanOrEqual(MAX_CENTRAL_BODIES);
  });

  it("un système généré ne dépasse jamais cette borne", () => {
    // L'invariant sur les données, et non plus seulement sur la table : `generateStars` tire
    // aussi des singularités, et rien n'oblige a priori le total à respecter le compte.
    for (const system of allSystems(generateUniverse("corps-centraux-46", 3))) {
      expect(starsOf(system).length, system.id).toBeLessThanOrEqual(
        MAX_CENTRAL_BODIES,
      );
    }
  });
});
