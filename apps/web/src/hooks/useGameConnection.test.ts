import type { ServerMessage } from "@spacesim/protocol";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGameStore } from "../state/game-store.js";
import { useGameConnection } from "./useGameConnection.js";

/** Double minimal de `WebSocket` : capture l'instance et laisse le test piloter ses événements. */
class MockWebSocket {
  static OPEN = 1;
  static instances: MockWebSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {}
  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }
  receive(msg: ServerMessage): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  closeWith(code: number): void {
    this.onclose?.({ code });
  }
}

const emptySnapshot = {
  game: { tick: 0, influence: 0, researched: [], claimedSystemIds: [] },
  colonies: [],
  transfers: [],
  missions: [],
  exploredSystemIds: [],
  markets: [],
  routes: [],
  outposts: [],
  gateways: [],
  contracts: [],
  factionStates: [],
  relations: [],
  proposals: [],
  fleets: [],
  blueprints: [],
  pirateLairs: [],
  battles: [],
  foreignFleets: [],
  foreignColonies: [],
  leaderboard: [],
  territories: [],
  objectives: [],
  worldEvents: [],
};

function helloMessage(universe: unknown): ServerMessage {
  return {
    type: "hello",
    playerId: "empire-1",
    universe,
    ...emptySnapshot,
  } as unknown as ServerMessage;
}

function tickMessage(extra: Record<string, unknown> = {}): ServerMessage {
  return {
    type: "tick",
    ...emptySnapshot,
    ...extra,
  } as unknown as ServerMessage;
}

describe("useGameConnection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
    useGameStore.getState().reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("hello peuple le store (playerId, univers, snapshot)", () => {
    renderHook(() => useGameConnection("token-a", vi.fn()));
    const ws = MockWebSocket.instances[0]!;
    ws.open();
    const universe = { galaxies: [] };
    ws.receive(helloMessage(universe));

    expect(useGameStore.getState().playerId).toBe("empire-1");
    expect(useGameStore.getState().universe).toEqual(universe);
    expect(useGameStore.getState().connected).toBe(true);
  });

  it("tick ne réécrit l'univers que s'il est présent", () => {
    renderHook(() => useGameConnection("token-b", vi.fn()));
    const ws = MockWebSocket.instances[0]!;
    ws.open();
    const universe = { galaxies: [] };
    ws.receive(helloMessage(universe));

    ws.receive(tickMessage());
    expect(useGameStore.getState().universe).toEqual(universe);

    const nextUniverse = { galaxies: [{ id: "gal-1" }] };
    ws.receive(tickMessage({ universe: nextUniverse }));
    expect(useGameStore.getState().universe).toEqual(nextUniverse);
  });

  it("reconnecte avec un backoff exponentiel après une fermeture normale", () => {
    renderHook(() => useGameConnection("token-c", vi.fn()));
    expect(MockWebSocket.instances).toHaveLength(1);

    MockWebSocket.instances[0]!.closeWith(1006);
    expect(useGameStore.getState().connected).toBe(false);

    vi.advanceTimersByTime(999);
    expect(MockWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(2);

    MockWebSocket.instances[1]!.closeWith(1006);
    vi.advanceTimersByTime(1999);
    expect(MockWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it("code 4001 : appelle onUnauthorized sans retenter la connexion", () => {
    const onUnauthorized = vi.fn();
    renderHook(() => useGameConnection("token-d", onUnauthorized));
    MockWebSocket.instances[0]!.closeWith(4001);

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30_000);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("actionError s'efface automatiquement après 4s", () => {
    renderHook(() => useGameConnection("token-e", vi.fn()));
    const ws = MockWebSocket.instances[0]!;
    ws.open();
    ws.receive({ type: "actionError", message: "Colonie inconnue" });

    expect(useGameStore.getState().actionError).toBe("Colonie inconnue");
    vi.advanceTimersByTime(3999);
    expect(useGameStore.getState().actionError).toBe("Colonie inconnue");
    vi.advanceTimersByTime(1);
    expect(useGameStore.getState().actionError).toBeNull();
  });

  it("réinitialise le store au montage, sans effacer l'état d'une reconnexion", () => {
    renderHook(() => useGameConnection("token-f", vi.fn()));
    const ws = MockWebSocket.instances[0]!;
    ws.open();
    ws.receive(helloMessage({ galaxies: [] }));
    expect(useGameStore.getState().playerId).toBe("empire-1");

    // Coupure/reconnexion du même compte : l'état affiché reste jusqu'au prochain hello.
    ws.closeWith(1006);
    vi.advanceTimersByTime(1000);
    expect(useGameStore.getState().playerId).toBe("empire-1");
  });

  it("send() n'écrit que si le socket est ouvert", () => {
    renderHook(() => useGameConnection("token-g", vi.fn()));
    const ws = MockWebSocket.instances[0]!;

    useGameStore.getState().send({ type: "clearResearchQueue" });
    expect(ws.sent).toHaveLength(0);

    ws.open();
    useGameStore.getState().send({ type: "clearResearchQueue" });
    expect(ws.sent).toHaveLength(1);
  });
});
