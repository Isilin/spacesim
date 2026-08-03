import type { Galaxy, Planet, StarSystem, Universe } from "@spacesim/shared";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { useMapLevel } from "./useMapLevel.js";

function planet(id: string): Planet {
  return { id } as unknown as Planet;
}
function system(id: string, planets: Planet[] = []): StarSystem {
  return { id, planets } as unknown as StarSystem;
}
function galaxy(id: string, systems: StarSystem[] = []): Galaxy {
  return { id, systems } as unknown as Galaxy;
}

const universe = {
  galaxies: [galaxy("gal-0", [system("sys-0", [planet("p-0")])])],
} as unknown as Universe;

/** Rend le hook comme s'il vivait sous la route imbriquée qui le consomme réellement. */
function wrapperFor(path: string, pattern: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={pattern} element={children} />
        </Routes>
      </MemoryRouter>
    );
  };
}

describe("useMapLevel", () => {
  it("niveau univers sans paramètre de route", () => {
    const { result } = renderHook(() => useMapLevel(universe), {
      wrapper: wrapperFor("/map", "/map"),
    });
    expect(result.current).toEqual({
      level: "universe",
      galaxy: null,
      system: null,
      body: null,
    });
  });

  it("niveau galaxie résout la galaxie depuis :galaxyId", () => {
    const { result } = renderHook(() => useMapLevel(universe), {
      wrapper: wrapperFor("/map/galaxy/gal-0", "/map/galaxy/:galaxyId"),
    });
    expect(result.current.level).toBe("galaxy");
    expect(result.current.galaxy?.id).toBe("gal-0");
    expect(result.current.system).toBeNull();
  });

  it("niveau corps résout galaxie/système/corps depuis les trois paramètres", () => {
    const { result } = renderHook(() => useMapLevel(universe), {
      wrapper: wrapperFor(
        "/map/galaxy/gal-0/system/sys-0/body/p-0",
        "/map/galaxy/:galaxyId/system/:systemId/body/:bodyId",
      ),
    });
    expect(result.current).toMatchObject({
      level: "body",
      galaxy: { id: "gal-0" },
      system: { id: "sys-0" },
      body: { id: "p-0" },
    });
  });

  it("id de galaxie inconnu : retombe au niveau univers", () => {
    const { result } = renderHook(() => useMapLevel(universe), {
      wrapper: wrapperFor("/map/galaxy/gal-absente", "/map/galaxy/:galaxyId"),
    });
    expect(result.current).toEqual({
      level: "universe",
      galaxy: null,
      system: null,
      body: null,
    });
  });
});
