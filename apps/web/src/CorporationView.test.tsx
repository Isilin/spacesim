import type {
  Colony,
  Corporation,
  CorporationMember,
  LeaderboardEntry,
} from "@spacesim/shared";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CorporationView } from "./CorporationView.js";
// La vue ne tire aucun module de traduction par transitivité (elle n'utilise pas
// `labels.js`), donc l'instance i18next n'existerait pas sous test et `t()` renverrait
// ses clés. `main.tsx` fait la même chose au démarrage.
import "./i18n.js";
import { useGameStore } from "./state/game-store.js";

const corp: Corporation = {
  id: "corp-1",
  name: "Consortium Vega",
  tag: "VEGA",
  founderEmpireId: "me",
  treasury: 500,
  createdAt: 0,
};

function member(empireId: string, role: CorporationMember["role"]) {
  return { corporationId: "corp-1", empireId, role, joinedAt: 0 };
}

function entry(over: Partial<LeaderboardEntry>): LeaderboardEntry {
  return {
    id: "x",
    name: "Empire X",
    color: "#fff",
    colonies: 1,
    population: 1,
    claimed: 0,
    influence: 0,
    score: 0,
    relation: "neutral",
    kind: "human",
    ...over,
  };
}

function view() {
  return render(
    <MemoryRouter>
      <CorporationView />
    </MemoryRouter>,
  );
}

describe("CorporationView — corporations (chantier 32.11)", () => {
  const send = vi.fn();

  beforeEach(() => {
    send.mockClear();
    useGameStore.getState().reset();
    useGameStore.setState({
      playerId: "me",
      colonies: [{ id: "c1", name: "Havre" } as unknown as Colony],
      send,
    });
  });

  afterEach(cleanup);

  it("sans corporation, propose d'en fonder une", async () => {
    const user = userEvent.setup();
    view();

    await user.type(screen.getByLabelText(/Nom|Name/), "Consortium Vega");
    await user.type(screen.getByLabelText(/Sigle|Ticker/), "VEGA");
    await user.click(screen.getByRole("button", { name: /Fonder|Found/ }));

    expect(send).toHaveBeenCalledWith({
      type: "foundCorporation",
      name: "Consortium Vega",
      tag: "VEGA",
    });
  });

  it("un membre simple ne voit ni exclusion ni retrait ni invitation", () => {
    // Les boutons suivent `corpCan`, la même table de permissions que le serveur
    // applique — l'affichage n'autorise rien, il évite de proposer un refus.
    useGameStore.setState({
      corporation: corp,
      corporationMembers: [member("me", "member"), member("autre", "officer")],
      leaderboard: [entry({ id: "autre", name: "Autre" })],
    });
    view();

    expect(screen.queryByRole("button", { name: /Exclure|Remove/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Retirer|Withdraw/ }),
    ).toBeNull();
    expect(screen.queryByText(/Inviter un empire|Invite an empire/)).toBeNull();
    // Verser reste ouvert à tous : donner au coffre ne demande aucun droit.
    expect(
      screen.getByRole("button", { name: /Verser|Deposit/ }),
    ).toBeDefined();
  });

  it("le fondateur peut exclure, retirer et dissoudre", () => {
    useGameStore.setState({
      corporation: corp,
      corporationMembers: [member("me", "founder"), member("autre", "member")],
      leaderboard: [entry({ id: "autre", name: "Autre" })],
    });
    view();

    expect(
      screen.getByRole("button", { name: /Exclure|Remove/ }),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: /Retirer|Withdraw/ }),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: /Dissoudre|Dissolve/ }),
    ).toBeDefined();
    // Le fondateur ne peut pas « quitter » : le serveur le refuse (ADR 0009).
    expect(
      screen.queryByRole("button", { name: /^Quitter$|^Leave$/ }),
    ).toBeNull();
  });

  it("n'offre pas d'inviter un PNJ ni un empire déjà engagé", () => {
    useGameStore.setState({
      corporation: corp,
      corporationMembers: [member("me", "founder")],
      leaderboard: [
        entry({ id: "me", name: "Moi" }),
        entry({ id: "pnj", name: "Faction PNJ", kind: "npc" }),
        entry({ id: "pris", name: "Déjà pris", corporationTag: "AUTR" }),
        entry({ id: "libre", name: "Disponible" }),
      ],
    });
    view();

    expect(screen.getByText("Disponible")).toBeDefined();
    expect(screen.queryByText("Faction PNJ")).toBeNull();
    expect(screen.queryByText("Déjà pris")).toBeNull();
  });

  it("le coffre affiche son solde et verse depuis la colonie active", async () => {
    const user = userEvent.setup();
    useGameStore.setState({
      corporation: corp,
      corporationMembers: [member("me", "founder")],
      leaderboard: [],
    });
    view();

    expect(screen.getByText(/500/)).toBeDefined();
    await user.click(screen.getByRole("button", { name: /Verser|Deposit/ }));

    expect(send).toHaveBeenCalledWith({
      type: "depositToTreasury",
      colonyId: "c1",
      amount: 100,
    });
  });
});
