import type {
  Colony,
  Galaxy,
  Planet,
  StarSystem,
  ClientUniverse,
} from "@spacesim/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { useGameStore } from "./game-store.js";
import {
  findBodyById,
  findGalaxyById,
  findSystemById,
  selectActiveColony,
  selectExplored,
} from "./selectors.js";

function galaxy(id: string, systems: StarSystem[] = []): Galaxy {
  return { id, systems } as unknown as Galaxy;
}
function system(id: string, planets: Planet[] = []): StarSystem {
  return { id, planets } as unknown as StarSystem;
}
function planet(id: string): Planet {
  return { id } as unknown as Planet;
}
function colony(id: string): Colony {
  return { id } as unknown as Colony;
}

describe("findGalaxyById / findSystemById / findBodyById", () => {
  const universe = {
    galaxies: [
      galaxy("gal-0", [system("sys-0", [planet("p-0")])]),
      galaxy("gal-1"),
    ],
  } as unknown as ClientUniverse;

  it("trouve une galaxie/un système/un corps existant", () => {
    const g = findGalaxyById(universe, "gal-0");
    expect(g?.id).toBe("gal-0");
    const s = findSystemById(g!, "sys-0");
    expect(s?.id).toBe("sys-0");
    expect(findBodyById(s!, "p-0")?.id).toBe("p-0");
  });

  it("renvoie null pour un id absent", () => {
    expect(findGalaxyById(universe, "gal-inconnue")).toBeNull();
  });
});

describe("selectActiveColony", () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it("choisit la colonie dont l'id correspond à ?colony=", () => {
    useGameStore.setState({ colonies: [colony("c1"), colony("c2")] });
    expect(selectActiveColony("c2")(useGameStore.getState())?.id).toBe("c2");
  });

  it("retombe sur la première colonie si l'id ne correspond à rien", () => {
    useGameStore.setState({ colonies: [colony("c1"), colony("c2")] });
    expect(selectActiveColony(null)(useGameStore.getState())?.id).toBe("c1");
    expect(selectActiveColony("c-inconnue")(useGameStore.getState())?.id).toBe(
      "c1",
    );
  });

  it("renvoie null sans aucune colonie", () => {
    useGameStore.setState({ colonies: [] });
    expect(selectActiveColony(null)(useGameStore.getState())).toBeNull();
  });
});

describe("selectExplored", () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it("vrai seulement si le système figure dans exploredSystemIds", () => {
    useGameStore.setState({ exploredSystemIds: ["sys-0"] });
    expect(selectExplored("sys-0")(useGameStore.getState())).toBe(true);
    expect(selectExplored("sys-1")(useGameStore.getState())).toBe(false);
  });
});
