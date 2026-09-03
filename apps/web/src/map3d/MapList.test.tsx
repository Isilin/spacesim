import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MapList, readPanelOpen, writePanelOpen } from "./MapList.js";
// Le composant ne tire aucun module de traduction par transitivité : sans cet import,
// l'instance i18next n'existerait pas sous test et `t()` rendrait ses clés. `main.tsx`
// fait la même chose au démarrage.
import "../i18n.js";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const entries = [
  { id: "a", label: "Alpha", detail: "colonisé", selected: true },
  { id: "b", label: "Beta" },
];

function renderList() {
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

/** Rend le panneau déjà déplié : c'est l'état dans lequel la liste se vérifie. */
function setup() {
  writePanelOpen(true);
  return renderList();
}

/** La liste elle-même, à l'exclusion du bouton de bascule qui la surmonte. */
function list() {
  return within(screen.getByRole("navigation", { name: "Carte" }));
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
    expect(
      list()
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Alphacolonisé", "Beta"]);
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
    // Bouton de bascule, puis champ de filtre (chantier 37), puis les entrées dans
    // l'ordre. Le filtre est en tête à dessein : à quatre cents objets, viser un nom passe
    // avant les parcourir un à un — et il reste sur le chemin de tabulation, donc
    // atteignable sans souris.
    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    // Le second objet a le focus : l'espace l'active comme n'importe quel bouton.
    await user.keyboard(" ");
    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("Entrée vole jusqu'à l'objet, comme le double-clic dans la scène", async () => {
    const user = userEvent.setup();
    const { onOpen, onSelect } = setup();
    await user.tab();
    await user.tab();
    await user.tab();
    await user.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledWith("a");
    // Et une seule fois : sans `preventDefault`, la touche déclencherait aussi le clic du
    // bouton, donc une sélection en plus du vol.
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("le filtre restreint la liste sans quitter le clavier", async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByRole("searchbox"), "bet");
    expect(
      list()
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Beta"]);
  });

  it("le double-clic ouvre aussi", async () => {
    const user = userEvent.setup();
    const { onOpen } = setup();
    await user.dblClick(screen.getByRole("button", { name: /Beta/ }));
    expect(onOpen).toHaveBeenCalledWith("b");
  });
});

/**
 * Panneau dépliable (chantier 36.4).
 *
 * Depuis que les noms se posent sur les objets, la liste ne se justifie plus en permanence
 * sur 210 px de carte. Elle se replie — mais elle reste le seul chemin clavier vers les
 * objets, et ces tests tiennent la promesse qu'elle est toujours atteignable.
 */
describe("MapList — panneau dépliable", () => {
  // Replié, la bascule est le seul bouton rendu : l'interroger par rôle plutôt que par
  // son libellé rend le test indépendant de la locale active (chantier 27.17).
  it("s'ouvre replié au premier chargement", () => {
    renderList();
    expect(screen.queryByRole("navigation", { name: "Carte" })).toBeNull();
    expect(screen.getByRole("button")).toHaveProperty("ariaExpanded", "false");
  });

  it("se déplie au clic et annonce son état", async () => {
    const user = userEvent.setup();
    renderList();
    const toggle = screen.getByRole("button");
    await user.click(toggle);
    expect(toggle).toHaveProperty("ariaExpanded", "true");
    expect(screen.getByRole("navigation", { name: "Carte" })).toBeTruthy();
  });

  it("retient son état d'une session à l'autre", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button"));
    expect(readPanelOpen()).toBe(true);

    cleanup();
    renderList();
    expect(screen.getByRole("navigation", { name: "Carte" })).toBeTruthy();
  });

  it("reste replié quand le stockage est refusé", () => {
    // Navigation privée, ou stockage de site désactivé : `localStorage` LÈVE à l'accès au
    // lieu de rendre `null`. Une carte qui ne s'ouvre pas du tout serait une régression
    // bien pire qu'un panneau qui ne se souvient pas.
    const original = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage",
    );
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("refusé");
      },
    });
    try {
      expect(readPanelOpen()).toBe(false);
      expect(() => writePanelOpen(true)).not.toThrow();
    } finally {
      if (original) Object.defineProperty(globalThis, "localStorage", original);
    }
  });
});
