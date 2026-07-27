import {
  computeEffects,
  type Colony,
  type GameState,
  type StarSystem,
  type Universe,
} from "@spacesim/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SystemPanel } from "./SystemPanel.js";
import { useGameStore } from "./state/game-store.js";

function colony(id: string, credits: number): Colony {
  return { id, resources: { credits } } as unknown as Colony;
}

const system = {
  id: "sys-0",
  name: "Test",
  planets: [],
  belts: [],
  station: undefined,
} as unknown as StarSystem;
const universe = { galaxies: [] } as unknown as Universe;
const game = {
  claimedSystemIds: [],
  influence: 0,
  researched: [],
  factionRep: {},
} as unknown as GameState;

describe("SystemPanel — système non exploré", () => {
  const send = vi.fn();

  beforeEach(() => {
    send.mockClear();
    useGameStore.getState().reset();
    useGameStore.setState({
      colonies: [colony("c1", 500)],
      exploredSystemIds: [],
      missions: [],
      universe,
      game,
      send,
    });
  });

  it("clic sur Sonder envoie la commande probe pour la colonie active", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SystemPanel system={system} effects={computeEffects([])} portalLinks={[]} now={0} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /Sonder/ }));

    expect(send).toHaveBeenCalledWith({ type: "probe", colonyId: "c1", systemId: "sys-0" });
  });
});
