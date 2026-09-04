import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZoomableSvg, type ViewBox } from "./ZoomableSvg.js";

afterEach(cleanup);

const home: ViewBox = { x: 0, y: 0, width: 100, height: 100 };

/** Le cadrage courant, tel que le SVG le publie — seul témoin observable de la vue. */
const viewBox = () =>
  screen
    .getByRole("application")
    .getAttribute("viewBox")
    ?.split(" ")
    .map(Number);

/**
 * `ZoomableSvg` est le seul composant du design system piloté au clavier (chantier 27.21),
 * et le seul portant `role="application"` — une promesse forte : elle dit au lecteur
 * d'écran de céder ses propres raccourcis au widget. Elle n'était vérifiée nulle part.
 *
 * Les gestes souris demandent une géométrie que jsdom ne fournit pas
 * (`getBoundingClientRect` rend des zéros, et `worldAt` refuse alors de deviner). Ce qui
 * est couvert ici est donc exactement ce qui est couvrable hors navigateur : le chemin
 * clavier, les boutons de contrôle et le recalage sur `home`/`focus`.
 */
describe("ZoomableSvg — pilotage clavier (chantier 27.21)", () => {
  it("s'annonce comme widget clavier nommé et focusable", () => {
    render(
      <ZoomableSvg home={home} ariaLabel="Carte de l'univers">
        <circle r={1} />
      </ZoomableSvg>,
    );
    const svg = screen.getByRole("application", { name: "Carte de l'univers" });
    // `tabIndex` est l'affordance qui rend la promesse tenable : sans lui, aucun clavier
    // n'atteint jamais le widget. C'est ce que justifie son `biome-ignore`.
    expect(svg.getAttribute("tabindex")).toBe("0");
    expect(viewBox()).toEqual([0, 0, 100, 100]);
  });

  it("les flèches déplacent la vue sans changer son échelle", async () => {
    const onViewChange = vi.fn();
    render(
      <ZoomableSvg home={home} ariaLabel="Carte" onViewChange={onViewChange}>
        <circle r={1} />
      </ZoomableSvg>,
    );
    screen.getByRole("application").focus();

    await userEvent.keyboard("{ArrowRight}");
    const [x, y, w, h] = viewBox()!;
    // Pas de 8 % de la largeur, vers la droite.
    expect(x).toBeCloseTo(8, 5);
    expect(y).toBe(0);
    // L'échelle est intacte : un panoramique n'est pas un zoom.
    expect([w, h]).toEqual([100, 100]);

    await userEvent.keyboard("{ArrowDown}");
    expect(viewBox()![1]).toBeCloseTo(8, 5);
    // Chaque pas est remonté à l'appelant, qui en dérive son niveau de détail.
    expect(onViewChange).toHaveBeenCalledTimes(2);
  });

  it("« + » rapproche, « - » éloigne, et « 0 » revient au cadrage d'accueil", async () => {
    render(
      <ZoomableSvg home={home} ariaLabel="Carte">
        <circle r={1} />
      </ZoomableSvg>,
    );
    screen.getByRole("application").focus();

    await userEvent.keyboard("+");
    const zoomedIn = viewBox()![2]!;
    expect(zoomedIn).toBeLessThan(100);

    await userEvent.keyboard("-");
    expect(viewBox()![2]).toBeCloseTo(100, 5);

    // Déplacer puis revenir : « 0 » rend le cadrage entier, position comprise.
    await userEvent.keyboard("{ArrowRight}+");
    await userEvent.keyboard("0");
    expect(viewBox()).toEqual([0, 0, 100, 100]);
  });

  it("le zoom clavier reste borné", async () => {
    render(
      <ZoomableSvg home={home} ariaLabel="Carte">
        <circle r={1} />
      </ZoomableSvg>,
    );
    screen.getByRole("application").focus();

    // Bien au-delà de ce que les bornes autorisent, dans les deux sens.
    await userEvent.keyboard("++++++++++++++++++++");
    const tightest = viewBox()![2]!;
    await userEvent.keyboard("--------------------------------------");
    const widest = viewBox()![2]!;

    expect(tightest).toBeGreaterThan(0);
    expect(Number.isFinite(widest)).toBe(true);
    // L'échelle est un rapport au cadrage d'accueil : bornée des deux côtés, jamais nulle
    // ni infinie — c'est ce qui empêche une vue dont on ne revient pas.
    expect(widest).toBeGreaterThan(tightest);
  });

  it("les boutons de contrôle portent les libellés fournis par l'appelant", () => {
    render(
      <ZoomableSvg
        home={home}
        ariaLabel="Carte"
        zoomInLabel="Rapprocher"
        zoomOutLabel="Éloigner"
        recenterLabel="Recentrer"
      >
        <circle r={1} />
      </ZoomableSvg>,
    );
    // `packages/ui` reste agnostique de la traduction : ces noms viennent du dehors.
    expect(screen.getByRole("button", { name: "Rapprocher" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Éloigner" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Recentrer" })).toBeTruthy();
  });

  it("un cadrage imposé de l'extérieur reprend la main sur la vue", async () => {
    const { rerender } = render(
      <ZoomableSvg home={home} ariaLabel="Carte" focus={null}>
        <circle r={1} />
      </ZoomableSvg>,
    );
    screen.getByRole("application").focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(viewBox()![0]).toBeCloseTo(8, 5);

    // « Aller à cette galaxie » : la navigation écrase ce que l'utilisateur avait cadré.
    rerender(
      <ZoomableSvg
        home={home}
        ariaLabel="Carte"
        focus={{ x: 40, y: 40, width: 20, height: 20 }}
      >
        <circle r={1} />
      </ZoomableSvg>,
    );
    expect(viewBox()).toEqual([40, 40, 20, 20]);
  });
});
