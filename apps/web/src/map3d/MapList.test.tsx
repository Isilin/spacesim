import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MapList } from "./MapList.js";

afterEach(cleanup);

const entries = [
  { id: "a", label: "Alpha", detail: "colonisé", selected: true },
  { id: "b", label: "Beta" },
];

function setup() {
  const onSelect = vi.fn();
  const onOpen = vi.fn();
  render(
    <MapList
      label="Carte"
      entries={entries}
      onSelect={onSelect}
      onOpen={onOpen}
    />,
  );
  return { onSelect, onOpen };
}

/**
 * Ces tests portent sur le SEUL chemin accessible vers les objets de la scène : un
 * canvas WebGL ne publie ni structure ni texte, donc si cette liste régresse, la carte
 * devient inutilisable au clavier et au lecteur d'écran sans que rien ne le signale.
 */
describe("MapList — chemin accessible de la carte 3D (chantier 31.16)", () => {
  it("expose une région de navigation nommée", () => {
    setup();
    expect(screen.getByRole("navigation", { name: "Carte" })).toBeTruthy();
  });

  it("publie chaque objet de la scène comme un bouton atteignable", () => {
    setup();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Alphacolonisé",
      "Beta",
    ]);
  });

  it("signale l'objet sélectionné aux technologies d'assistance", () => {
    setup();
    expect(screen.getByRole("button", { name: /Alpha/ })).toHaveProperty(
      "ariaCurrent",
      "true",
    );
  });

  it("se parcourt à la tabulation et sélectionne à l'activation", async () => {
    const user = userEvent.setup();
    const { onSelect } = setup();
    await user.tab();
    await user.tab();
    // Le second bouton a le focus : l'espace l'active comme n'importe quel bouton.
    await user.keyboard(" ");
    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("Entrée ouvre l'objet, comme le double-clic dans la scène", async () => {
    const user = userEvent.setup();
    const { onOpen } = setup();
    await user.tab();
    await user.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledWith("a");
  });

  it("le double-clic ouvre aussi", async () => {
    const user = userEvent.setup();
    const { onOpen } = setup();
    await user.dblClick(screen.getByRole("button", { name: /Beta/ }));
    expect(onOpen).toHaveBeenCalledWith("b");
  });
});
