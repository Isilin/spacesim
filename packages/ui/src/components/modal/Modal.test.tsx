import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal.js";

afterEach(cleanup);

/**
 * Ce que ces tests protègent (chantier 43.7) : le travail d'accessibilité du 27.21, qui
 * n'avait aucune couverture. `Modal` porte deux suppressions `biome-ignore` justifiant de
 * ne PAS utiliser `<dialog>` natif — le prix de ce choix est que le piège à focus, Échap
 * et la restauration du focus sont écrits à la main. Écrits à la main et jamais vérifiés,
 * jusqu'ici.
 */
describe("Modal — dialogue accessible (chantier 27.21)", () => {
  it("s'annonce comme dialogue modal et se laisse nommer par son en-tête", () => {
    render(
      <Modal>
        <Modal.Header title="Confirmer" />
        <Modal.Body>Corps</Modal.Body>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    // Le nom vient du contexte : `Modal.Header` pose l'id que `aria-labelledby` cite.
    expect(screen.getByRole("dialog", { name: "Confirmer" })).toBe(dialog);
  });

  it("donne le focus au premier élément interactif à l'ouverture", () => {
    render(
      <Modal>
        <Modal.Body>
          <button type="button">Premier</button>
          <button type="button">Second</button>
        </Modal.Body>
      </Modal>,
    );
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Premier" }),
    );
  });

  it("Échap ferme le dialogue", async () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose}>
        <Modal.Body>
          <button type="button">Premier</button>
        </Modal.Body>
      </Modal>,
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Tab boucle dans le dialogue au lieu d'en sortir", async () => {
    render(
      <Modal>
        <Modal.Body>
          <button type="button">Premier</button>
          <button type="button">Dernier</button>
        </Modal.Body>
      </Modal>,
    );
    const first = screen.getByRole("button", { name: "Premier" });
    const last = screen.getByRole("button", { name: "Dernier" });

    expect(document.activeElement).toBe(first);
    await userEvent.tab();
    expect(document.activeElement).toBe(last);
    // Depuis le dernier, Tab revient au premier — c'est le piège.
    await userEvent.tab();
    expect(document.activeElement).toBe(first);
    // Et Shift+Tab referme la boucle dans l'autre sens.
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(last);
  });

  it("rend le focus au déclencheur à la fermeture", async () => {
    /**
     * Le déclencheur doit avoir le focus AVANT que le dialogue ne monte : `Modal` lit
     * `document.activeElement` dans son effet de montage, une fois. Un test qui ouvre puis
     * focalise vérifierait la restauration vers `body` et passerait pour de mauvaises
     * raisons.
     */
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Ouvrir
          </button>
          {open && (
            <Modal onClose={() => setOpen(false)}>
              <Modal.Body>
                <button type="button" onClick={() => setOpen(false)}>
                  Fermer
                </button>
              </Modal.Body>
            </Modal>
          )}
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Ouvrir" });
    await userEvent.click(trigger);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Fermer" }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("fermé, ne rend rien du tout", () => {
    render(
      <Modal open={false}>
        <Modal.Body>Invisible</Modal.Body>
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
