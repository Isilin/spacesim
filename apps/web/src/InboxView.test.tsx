import type { Colony, EmpireEvent, ClientUniverse } from "@spacesim/shared";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InboxView } from "./InboxView.js";
import { useGameStore } from "./state/game-store.js";

const universe = { galaxies: [] } as unknown as ClientUniverse;

function event(over: Partial<EmpireEvent>): EmpireEvent {
  return {
    id: "e1",
    empireId: "emp",
    kind: "research_completed",
    createdAt: 1000,
    readAt: null,
    ...over,
  };
}

describe("InboxView — journal d'empire (chantier 32.5)", () => {
  const send = vi.fn();

  beforeEach(() => {
    send.mockClear();
    useGameStore.getState().reset();
    useGameStore.setState({
      universe,
      colonies: [{ id: "c1", name: "Havre" } as unknown as Colony],
      send,
    });
  });

  // Sans cela, les rendus s'accumulent et les requêtes suivantes voient plusieurs
  // journaux à la fois.
  afterEach(cleanup);

  it("annonce le nombre de non-lus, pas la taille de la page reçue", () => {
    useGameStore.setState({
      events: [event({})],
      unreadEventCount: 42,
    });
    render(<InboxView now={2000} />);

    // Le compteur porte sur le total : le serveur ne transmet qu'une page.
    expect(screen.getByText(/42/)).toBeDefined();
  });

  it("marquer une entrée lue envoie la commande pour cette entrée seule", async () => {
    const user = userEvent.setup();
    useGameStore.setState({
      events: [event({ id: "cible" }), event({ id: "autre", readAt: 1500 })],
      unreadEventCount: 1,
    });
    render(<InboxView now={2000} />);

    // Une seule entrée est non lue, donc un seul bouton de marquage.
    await user.click(
      screen.getByRole("button", { name: /marquer lu|mark read/i }),
    );

    expect(send).toHaveBeenCalledWith({
      type: "markEventRead",
      eventId: "cible",
    });
  });

  it("rédige chaque nature d'événement avec ses propres substitutions", () => {
    useGameStore.setState({
      events: [
        event({
          id: "raid",
          kind: "colony_attacked",
          otherName: "Pillards",
          colonyId: "c1",
          amount: 120,
        }),
      ],
      unreadEventCount: 1,
    });
    render(<InboxView now={2000} />);

    // Le serveur n'a envoyé que des identifiants et un nombre : le texte est construit
    // ici, ce qui est tout l'intérêt (ADR 0008).
    const row = screen.getByText(/Pillards/);
    expect(row.textContent).toContain("Havre");
    expect(row.textContent).toContain("120");
  });

  it("sans événement, aucune action de marquage n'est proposée", () => {
    useGameStore.setState({ events: [], unreadEventCount: 0 });
    render(<InboxView now={2000} />);

    expect(screen.queryByRole("button")).toBeNull();
  });
});
