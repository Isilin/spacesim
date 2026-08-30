import { describe, expect, it } from "vitest";
import { GATEWAY_JUMP_WEIGHT, JUMP_REFERENCE_LENGTH } from "../../constants.js";
import type { Galaxy, Universe } from "../../model/universe.js";
import {
  galaxyGraph,
  hostileSystemIds,
  planTravel,
  priceOf,
  routeCandidates,
  shortestPath,
  universeGraph,
} from "./route.js";

type Spec = { id: string; x: number; y?: number; z?: number };

function makeGalaxy(
  id: string,
  specs: Spec[],
  links: [string, string][],
): Galaxy {
  return {
    id,
    name: id,
    x: 0,
    y: 0,
    z: 0,
    systems: specs.map((s) => ({
      id: s.id,
      name: s.id,
      x: s.x,
      y: s.y ?? 0,
      z: s.z ?? 0,
      planets: [],
      belts: [],
    })),
    links,
    anchorSystemId: specs[0]!.id,
    depositBonus: 1,
  };
}

const R = JUMP_REFERENCE_LENGTH;

/** a—b—c—d en ligne, arêtes unitaires, plus une dérivation coûteuse a—haut—d. */
const galaxy = makeGalaxy(
  "g1",
  [
    { id: "a", x: 0 },
    { id: "b", x: R },
    { id: "c", x: 2 * R },
    { id: "d", x: 3 * R },
    // Contournement plus cher que la ligne directe (5,6 contre 3) mais moins que
    // celle-ci pénalisée de deux systèmes hostiles (9) : l'arbitrage doit basculer.
    { id: "haut", x: 0, z: 2 * R },
  ],
  [
    ["a", "b"],
    ["b", "c"],
    ["c", "d"],
    ["a", "haut"],
    ["haut", "d"],
  ],
);

describe("shortestPath", () => {
  it("rend le chemin complet, origine et destination comprises", () => {
    expect(shortestPath(galaxyGraph(galaxy), "a", "d")).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("un système vers lui-même est un chemin d'un seul élément", () => {
    expect(shortestPath(galaxyGraph(galaxy), "a", "a")).toEqual(["a"]);
  });

  it("null si la destination est inaccessible", () => {
    expect(shortestPath(galaxyGraph(galaxy), "a", "inconnu")).toBeNull();
  });

  it("un critère de recherche différent produit un chemin différent", () => {
    const graph = galaxyGraph(galaxy);
    // En pénalisant fortement le passage par `b`, la dérivation devient préférable.
    const detour = shortestPath(graph, "a", "d", (arc) =>
      arc.to === "b" ? arc.weight + 1000 : arc.weight,
    );
    expect(detour).toEqual(["a", "haut", "d"]);
  });
});

describe("priceOf", () => {
  it("tarifie un chemin au coût réel des arêtes", () => {
    const graph = galaxyGraph(galaxy);
    expect(priceOf(graph, ["a", "b", "c", "d"])).toEqual({ cost: 3, gates: 0 });
  });

  it("un chemin d'un seul système ne coûte rien", () => {
    expect(priceOf(galaxyGraph(galaxy), ["a"])).toEqual({ cost: 0, gates: 0 });
  });

  it("refuse un chemin dont une étape n'est pas une arête réelle", () => {
    // « a → d » n'existe pas : un chemin forgé doit être rejeté, pas retarifé.
    expect(priceOf(galaxyGraph(galaxy), ["a", "d"])).toBeNull();
  });

  it("compte les portails empruntés", () => {
    const universe: Universe = {
      seed: "t",
      galaxies: [galaxy, makeGalaxy("g2", [{ id: "z", x: 500_000 }], [])],
    };
    const graph = universeGraph(universe, [["a", "z"]]);
    expect(priceOf(graph, ["a", "z"])).toEqual({
      cost: GATEWAY_JUMP_WEIGHT,
      gates: 1,
    });
  });
});

describe("routeCandidates", () => {
  it("propose une seule option quand tous les critères convergent", () => {
    // Aucun portail, aucun système hostile : les trois recherches trouvent le même
    // chemin, et proposer trois fois la même chose sous trois noms serait un faux choix.
    const routes = routeCandidates(galaxyGraph(galaxy), "a", "d");
    expect(routes).toHaveLength(1);
    expect(routes[0]!.kind).toBe("cheapest");
    expect(routes[0]!.path).toEqual(["a", "b", "c", "d"]);
  });

  it("propose un contournement quand la route directe traverse un territoire hostile", () => {
    const routes = routeCandidates(
      galaxyGraph(galaxy),
      "a",
      "d",
      new Set(["b", "c"]),
    );
    expect(routes).toHaveLength(2);
    const safest = routes.find((r) => r.kind === "safest")!;
    expect(safest.path).toEqual(["a", "haut", "d"]);
    // Le détour est bien plus cher : c'est un arbitrage, pas un repas gratuit.
    const cheapest = routes.find((r) => r.kind === "cheapest")!;
    expect(safest.cost).toBeGreaterThan(cheapest.cost);
  });

  it("le coût annoncé est le coût réel, jamais celui de la recherche", () => {
    const routes = routeCandidates(
      galaxyGraph(galaxy),
      "a",
      "d",
      new Set(["b", "c"]),
    );
    const safest = routes.find((r) => r.kind === "safest")!;
    // La pénalité de recherche vaut 3 par système hostile ; si elle fuitait dans le
    // prix, le joueur verrait un coût sans rapport avec ce qu'il paie.
    expect(safest.cost).toBeCloseTo(
      priceOf(galaxyGraph(galaxy), safest.path)!.cost,
      9,
    );
  });

  it("propose d'éviter les portails quand il en existe un raccourci", () => {
    // g1 et g2 reliées par un portail a↔z, et z rejoint aussi d par un long saut.
    const g2 = makeGalaxy("g2", [{ id: "z", x: 500_000 }], []);
    const universe: Universe = { seed: "t", galaxies: [galaxy, g2] };
    const graph = universeGraph(universe, [
      ["a", "z"],
      ["z", "d"],
    ]);
    const routes = routeCandidates(graph, "a", "d");
    const cheapest = routes.find((r) => r.kind === "cheapest")!;
    const fewest = routes.find((r) => r.kind === "fewestGates")!;
    // Deux portails à 1 battent trois sauts à 1 en coût, mais pas en nombre de portes.
    expect(cheapest.gates).toBe(2);
    expect(fewest.gates).toBe(0);
    expect(fewest.path).toEqual(["a", "b", "c", "d"]);
  });

  it("rend une liste vide si la destination est inaccessible", () => {
    expect(routeCandidates(galaxyGraph(galaxy), "a", "inconnu")).toEqual([]);
  });
});

describe("planTravel", () => {
  const universe: Universe = { seed: "t", galaxies: [galaxy] };

  it("sans itinéraire imposé, prend le chemin le moins cher", () => {
    const plan = planTravel(universe, "a", "d");
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.path).toEqual(["a", "b", "c", "d"]);
    expect(plan.cost).toBeCloseTo(3, 9);
  });

  it("accepte un itinéraire imposé plus cher et le facture à son vrai prix", () => {
    // Le joueur a le droit de choisir le détour ; il le paie.
    const plan = planTravel(universe, "a", "d", [], ["a", "haut", "d"]);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.path).toEqual(["a", "haut", "d"]);
    expect(plan.cost).toBeGreaterThan(3);
  });

  it("refuse un itinéraire dont une étape n'est pas une arête réelle", () => {
    // « a → d » n'existe pas : un client qui forge ce chemin obtiendrait sinon un
    // trajet gratuit entre deux systèmes non reliés.
    const plan = planTravel(universe, "a", "d", [], ["a", "d"]);
    expect(plan).toEqual({ ok: false, reason: "invalidRoute" });
  });

  it("refuse un itinéraire qui ne part pas de l'origine annoncée", () => {
    const plan = planTravel(universe, "a", "d", [], ["b", "c", "d"]);
    expect(plan).toEqual({ ok: false, reason: "invalidRoute" });
  });

  it("refuse un itinéraire qui n'aboutit pas à la destination annoncée", () => {
    const plan = planTravel(universe, "a", "d", [], ["a", "b", "c"]);
    expect(plan).toEqual({ ok: false, reason: "invalidRoute" });
  });

  it("distingue une destination inaccessible d'un itinéraire invalide", () => {
    expect(planTravel(universe, "a", "inconnu")).toEqual({
      ok: false,
      reason: "unreachable",
    });
  });
});

describe("hostileSystemIds", () => {
  const territories = [
    { systemId: "s1", ownerId: "ennemi" },
    { systemId: "s2", ownerId: "ami" },
    { systemId: "s3", ownerId: "neutre" },
  ];

  it("ne retient que les territoires des empires en guerre", () => {
    const hostile = hostileSystemIds(
      territories,
      [
        { empireA: "moi", empireB: "ennemi", state: "war" },
        { empireA: "moi", empireB: "ami", state: "alliance" },
      ],
      "moi",
    );
    expect([...hostile]).toEqual(["s1"]);
  });

  it("un pacte de non-agression ne rend pas un territoire évitable", () => {
    // Sinon le contournement deviendrait le défaut partout dès la première trêve.
    const hostile = hostileSystemIds(
      territories,
      [{ empireA: "moi", empireB: "neutre", state: "nap" }],
      "moi",
    );
    expect(hostile.size).toBe(0);
  });

  it("ignore les guerres entre tiers", () => {
    const hostile = hostileSystemIds(
      territories,
      [{ empireA: "ami", empireB: "ennemi", state: "war" }],
      "moi",
    );
    expect(hostile.size).toBe(0);
  });
});
