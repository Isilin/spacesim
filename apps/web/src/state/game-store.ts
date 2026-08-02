import type { ClientMessage, EmpireSnapshot, ServerMessage } from "@spacesim/protocol";
import type {
  Blueprint,
  Contract,
  FactionState,
  Gateway,
  Colony,
  Fleet,
  ForeignColony,
  ForeignFleet,
  GameState,
  LeaderboardEntry,
  MiningOutpost,
  Mission,
  Objective,
  PirateLair,
  Relation,
  RelationProposal,
  Route,
  StoredBattle,
  Territory,
  TradingPostMarket,
  Transfer,
  Universe,
  WorldEvent,
} from "@spacesim/shared";
import { create } from "zustand";

export interface GameStoreState {
  playerId: string | null;
  universe: Universe | null;
  game: GameState | null;
  colonies: Colony[];
  transfers: Transfer[];
  missions: Mission[];
  exploredSystemIds: string[];
  markets: TradingPostMarket[];
  routes: Route[];
  outposts: MiningOutpost[];
  gateways: Gateway[];
  contracts: Contract[];
  factionStates: FactionState[];
  relations: Relation[];
  proposals: RelationProposal[];
  fleets: Fleet[];
  blueprints: Blueprint[];
  pirateLairs: PirateLair[];
  battles: StoredBattle[];
  foreignFleets: ForeignFleet[];
  foreignColonies: ForeignColony[];
  leaderboard: LeaderboardEntry[];
  territories: Territory[];
  objectives: Objective[];
  worldEvents: WorldEvent[];
  /** Liaison WS établie (état de connexion, pas de session). */
  connected: boolean;
  /** Dernière erreur d'action renvoyée par le serveur (éphémère). */
  actionError: string | null;
  /** Branché par `useGameConnection` ; no-op tant qu'aucune connexion n'est ouverte. */
  send: (msg: ClientMessage) => void;

  applyHello: (msg: Extract<ServerMessage, { type: "hello" }>) => void;
  applyTick: (msg: Extract<ServerMessage, { type: "tick" }>) => void;
  setConnected: (connected: boolean) => void;
  setActionError: (message: string | null) => void;
  setSend: (send: (msg: ClientMessage) => void) => void;
  /** Efface tout l'état de jeu — appelé à chaque (re)montage de connexion, pas aux reconnexions. */
  reset: () => void;
}

type SnapshotFields = Omit<
  GameStoreState,
  | "playerId"
  | "universe"
  | "connected"
  | "actionError"
  | "send"
  | "applyHello"
  | "applyTick"
  | "setConnected"
  | "setActionError"
  | "setSend"
  | "reset"
>;

function snapshotFields(msg: EmpireSnapshot): SnapshotFields {
  return {
    game: msg.game,
    colonies: msg.colonies,
    transfers: msg.transfers,
    missions: msg.missions,
    exploredSystemIds: msg.exploredSystemIds,
    markets: msg.markets,
    routes: msg.routes,
    outposts: msg.outposts,
    gateways: msg.gateways,
    contracts: msg.contracts,
    factionStates: msg.factionStates,
    relations: msg.relations,
    proposals: msg.proposals,
    fleets: msg.fleets,
    blueprints: msg.blueprints,
    pirateLairs: msg.pirateLairs,
    battles: msg.battles,
    foreignFleets: msg.foreignFleets,
    foreignColonies: msg.foreignColonies,
    leaderboard: msg.leaderboard,
    territories: msg.territories,
    objectives: msg.objectives,
    worldEvents: msg.worldEvents,
  };
}

const initialState: SnapshotFields & {
  playerId: null;
  universe: null;
  connected: false;
  actionError: null;
} = {
  playerId: null,
  universe: null,
  game: null,
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
  connected: false,
  actionError: null,
};

export const useGameStore = create<GameStoreState>((set) => ({
  ...initialState,
  send: () => {},

  applyHello: (msg) =>
    set({
      playerId: msg.playerId,
      universe: msg.universe,
      ...snapshotFields(msg),
    }),

  applyTick: (msg) =>
    set((state) => ({
      ...snapshotFields(msg),
      // Présent seulement quand l'exploration a changé depuis le dernier message.
      universe: msg.universe ?? state.universe,
    })),

  setConnected: (connected) => set({ connected }),
  setActionError: (message) => set({ actionError: message }),
  setSend: (send) => set({ send }),
  reset: () => set({ ...initialState, send: () => {} }),
}));
