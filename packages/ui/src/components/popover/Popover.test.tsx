import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Popover } from "./Popover.js";

afterEach(cleanup);

/**
 * `Popover` est le jumeau NON modal de `Modal` (chantier 27.21), et c'est toute la
 * difficulté : il porte lui aussi `role="dialog"` sur un `div`, avec une suppression
 * `biome-ignore` qui justifie de ne pas prendre `<dialog>` natif — précisément parce que
 * celui-ci est modal par défaut. Ce qui distingue les deux composants ne se voit donc que
 * dans leur comportement : pas de piège à focus ici, pas de restauration, juste Échap.
 *
 * `autoFocus={false}` mérite sa couverture propre : c'est le correctif du chantier 35.5,
 * où prendre le focus retirait au joueur les raccourcis de caméra de la carte au moment
 * même où il sélectionnait un objet.
 */
describe("Popover — panneau contextuel non modal (chantier 27.21)", () => {
  it("s'annonce comme dialogue nommé, mais jamais modal", () => {
    render(<Popover aria-label="Détail de Vensus">Contenu</Popover>);
    const panel = screen.getByRole("dialog", { name: "Détail de Vensus" });
    // L'absence d'`aria-modal` EST le contrat : le reste de la page reste utilisable.
    expect(panel.hasAttribute("aria-modal")).toBe(false);
  });

  it("prend le focus sur son premier élément interactif par défaut", () => {
    render(
      <Popover aria-label="Panneau">
        <button type="button">Agir</button>
      </Popover>,
    );
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Agir" }),
    );
  });

  it("autoFocus={false} laisse le focus où il est", () => {
    render(
      <>
        <button type="button">Dehors</button>
        <Popover aria-label="Panneau" autoFocus={false}>
          <button type="button">Agir</button>
        </Popover>
      </>,
    );
    const outside = screen.getByRole("button", { name: "Dehors" });
    outside.focus();
    expect(document.activeElement).toBe(outside);
  });

  it("Échap ferme quand l'appelant sait fermer", async () => {
    const onClose = vi.fn();
    render(
      <Popover aria-label="Panneau" onClose={onClose}>
        <button type="button">Agir</button>
      </Popover>,
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sans onClose, Échap ne casse rien", async () => {
    render(
      <Popover aria-label="Panneau">
        <button type="button">Agir</button>
      </Popover>,
    );
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Panneau" })).toBeTruthy();
  });

  it("ne piège pas le focus : Tab en sort", async () => {
    render(
      <>
        <Popover aria-label="Panneau">
          <button type="button">Dedans</button>
        </Popover>
        <button type="button">Après</button>
      </>,
    );
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Dedans" }),
    );
    await userEvent.tab();
    // Non modal : le focus continue sa route dans la page, il ne boucle pas.
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Après" }),
    );
  });
});
