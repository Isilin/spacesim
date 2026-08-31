import type {
  ClientMessage,
  EmpireSnapshot,
  ServerMessage,
} from "@spacesim/protocol";
import type {
  Blueprint,
  Contract,
  Corporation,
  CorporationInvite,
  CorporationMember,
  EmpireEvent,
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
  ForeignStation,
  Relation,
  RelationProposal,
  Route,
  Station,
  StoredBattle,
  SystemSite,
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
  scannedSystemIds: string[];
  sites: SystemSite[];
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
  stations: Station[];
  foreignStations: ForeignStation[];
  leaderboard: LeaderboardEntry[];
  territories: Territory[];
  objectives: Objective[];
  worldEvents: WorldEvent[];
  /** Journal d'empire (chantier 32.5), du plus récent au plus ancien, borné par le serveur. */
  events: EmpireEvent[];
  /** Non-lus sur le TOTAL, pas seulement sur la page reçue. */
  unreadEventCount: number;
  /** Corporation de l'empire (chantier 32.11) — `null` s'il n'en a pas. */
  corporation: Corporation | null;
  corporationMembers: CorporationMember[];
  corporationInvites: CorporationInvite[];
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
    scannedSystemIds: msg.scannedSystemIds,
    sites: msg.sites,
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
    stations: msg.stations,
    foreignStations: msg.foreignStations,
    leaderboard: msg.leaderboard,
    territories: msg.territories,
    objectives: msg.objectives,
    worldEvents: msg.worldEvents,
    events: msg.events,
    unreadEventCount: msg.unreadEventCount,
    // `undefined` sur le fil (champ absent) devient `null` dans le store : l'absence de
    // corporation est un état affichable, pas un champ manquant.
    corporation: msg.corporation ?? null,
    corporationMembers: msg.corporationMembers,
    corporationInvites: msg.corporationInvites,
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
  scannedSystemIds: [],
  sites: [],
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
  stations: [],
  foreignStations: [],
  leaderboard: [],
  territories: [],
  objectives: [],
  worldEvents: [],
  events: [],
  unreadEventCount: 0,
  corporation: null,
  corporationMembers: [],
  corporationInvites: [],
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
