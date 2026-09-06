import type {
  Galaxy,
  Planet,
  StarSystem,
  ClientUniverse,
} from "@spacesim/shared";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { useMapView } from "./useMapView.js";

/**
 * État de carte porté par l'URL (chantier 35.3).
 *
 * Remplace `useMapLevel.test.tsx`. Ce qui est vérifié a changé de nature : il n'y a plus de
 * niveau à déduire d'une hiérarchie de segments, mais un point visé et une profondeur
 * réelle. Le lien profond, lui, doit continuer de survivre au rechargement — c'est la
 * promesse que `map-deep-link.spec.ts` tient de bout en bout et que ce test tient à l'unité.
 */

function planet(id: string): Planet {
  return { id } as unknown as Planet;
}
function system(id: string, planets: Planet[]): StarSystem {
  return { id, planets } as unknown as StarSystem;
}
function galaxy(id: string, systems: StarSystem[]): Galaxy {
  return { id, systems } as unknown as Galaxy;
}

const universe = {
  galaxies: [
    galaxy("gal-0", [
      system("gal-0-sys-0", [planet("gal-0-sys-0-p0")]),
      system("gal-0-sys-1", []),
    ]),
    galaxy("gal-1", []),
  ],
} as unknown as ClientUniverse;

function at(url: string) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/map" element={children} />
      </Routes>
    </MemoryRouter>
  );
  return renderHook(() => useMapView(universe), { wrapper }).result.current;
}

describe("useMapView", () => {
  it("ne vise rien sans paramètre", () => {
    const view = at("/map");
    expect(view.anchor).toEqual({
      galaxyId: null,
      systemId: null,
      bodyId: null,
    });
    expect(view.depth).toBeNull();
    expect(view.open).toBeNull();
  });

  it("déduit le chemin complet du seul identifiant visé", () => {
    // Le joueur n'a pas à composer une URL à trois segments pour viser une lune : c'est
    // l'index de l'univers qui retrouve la galaxie et le système dont elle relève.
    expect(at("/map?at=gal-0-sys-0-p0").anchor).toEqual({
      galaxyId: "gal-0",
      systemId: "gal-0-sys-0",
      bodyId: "gal-0-sys-0-p0",
    });
    expect(at("/map?at=gal-0-sys-1").anchor).toEqual({
      galaxyId: "gal-0",
      systemId: "gal-0-sys-1",
      bodyId: null,
    });
    expect(at("/map?at=gal-1").anchor).toEqual({
      galaxyId: "gal-1",
      systemId: null,
      bodyId: null,
    });
  });

  it("retombe sur l'univers quand l'identifiant est inconnu", () => {
    // Parité avec l'ancien `useMapLevel` : un lien vers une galaxie disparue — ou une URL
    // tapée à la main — rend une carte, jamais un écran vide.
    expect(at("/map?at=gal-inexistante").anchor).toEqual({
      galaxyId: null,
      systemId: null,
      bodyId: null,
    });
  });

  it("lit une profondeur fractionnaire", () => {
    // La fraction est ce qu'un chemin de segments ne savait pas dire : à mi-chemin entre
    // deux paliers. Sans elle, un rechargement ne rendrait pas la vue qu'on avait.
    expect(at("/map?at=gal-0&z=1.62").depth).toBeCloseTo(1.62, 5);
    expect(at("/map?at=gal-0&z=0").depth).toBe(0);
  });

  it("ignore une profondeur illisible plutôt que de rendre NaN", () => {
    // Un `NaN` remonterait jusqu'à la position de la caméra, dont on ne revient pas.
    expect(at("/map?at=gal-0&z=abc").depth).toBeNull();
    expect(at("/map?at=gal-0&z=").depth).toBeNull();
  });

  it("porte la fiche ouverte indépendamment de ce que la caméra vise", () => {
    // Regarder un système et lire la fiche d'un de ses corps sont deux choses : c'est ce
    // que le panneau latéral fait déjà, et ce que la modale du chantier 35.6 fera.
    const view = at("/map?at=gal-0-sys-0&open=gal-0-sys-0-p0");
    expect(view.anchor.systemId).toBe("gal-0-sys-0");
    expect(view.open).toBe("gal-0-sys-0-p0");
  });
});
