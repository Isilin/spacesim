import type {
  ClientMessage,
  Contract,
  Gateway,
  Colony,
  Fleet,
  ForeignColony,
  ForeignFleet,
  GameState,
  LeaderboardEntry,
  MiningOutpost,
  Mission,
  PirateLair,
  Route,
  ServerMessage,
  StationMarket,
  StoredBattle,
  Territory,
  Transfer,
  Universe,
} from "@spacesim/shared";
import { useCallback, useEffect, useRef, useState } from "react";

/** Code de fermeture WS émis par le serveur quand la session n'est plus valide (chantier 8). */
const WS_UNAUTHORIZED = 4001;

export interface GameConnection {
  /** Identité de l'empire piloté (renvoyée par le serveur au `hello`). */
  playerId: string | null;
  universe: Universe | null;
  game: GameState | null;
  colonies: Colony[];
  transfers: Transfer[];
  missions: Mission[];
  exploredSystemIds: string[];
  markets: StationMarket[];
  routes: Route[];
  outposts: MiningOutpost[];
  gateways: Gateway[];
  contracts: Contract[];
  fleets: Fleet[];
  pirateLairs: PirateLair[];
  battles: StoredBattle[];
  foreignFleets: ForeignFleet[];
  foreignColonies: ForeignColony[];
  leaderboard: LeaderboardEntry[];
  territories: Territory[];
  connected: boolean;
  /** Dernière erreur d'action renvoyée par le serveur (éphémère). */
  actionError: string | null;
  send: (msg: ClientMessage) => void;
}

/**
 * Connexion WS au serveur de jeu, avec reconnexion automatique.
 * `sessionToken` = jeton d'authentification (chantier 8) ; `onUnauthorized` est appelé
 * quand le serveur le rejette, pour renvoyer à l'écran de connexion.
 */
export function useGameSocket(sessionToken: string, onUnauthorized: () => void): GameConnection {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [universe, setUniverse] = useState<Universe | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [colonies, setColonies] = useState<Colony[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [exploredSystemIds, setExploredSystemIds] = useState<string[]>([]);
  const [markets, setMarkets] = useState<StationMarket[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [outposts, setOutposts] = useState<MiningOutpost[]>([]);
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [pirateLairs, setPirateLairs] = useState<PirateLair[]>([]);
  const [battles, setBattles] = useState<StoredBattle[]>([]);
  const [foreignFleets, setForeignFleets] = useState<ForeignFleet[]>([]);
  const [foreignColonies, setForeignColonies] = useState<ForeignColony[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [connected, setConnected] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const retryRef = useRef(0);
  const socketRef = useRef<WebSocket | null>(null);
  const errorTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    let disposed = false;
    let retryTimer: number | undefined;

    const connect = () => {
      const protocol = location.protocol === "https:" ? "wss" : "ws";
      const query = `?session=${encodeURIComponent(sessionToken)}`;
      const socket = new WebSocket(`${protocol}://${location.host}/ws${query}`);
      socketRef.current = socket;
      socket.onopen = () => {
        retryRef.current = 0;
        setConnected(true);
      };
      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data) as ServerMessage;
        if (msg.type === "hello") {
          setPlayerId(msg.playerId);
          setUniverse(msg.universe);
          setGame(msg.game);
          setColonies(msg.colonies);
          setTransfers(msg.transfers);
          setMissions(msg.missions);
          setExploredSystemIds(msg.exploredSystemIds);
          setMarkets(msg.markets);
          setRoutes(msg.routes);
          setOutposts(msg.outposts);
          setGateways(msg.gateways);
          setContracts(msg.contracts);
          setFleets(msg.fleets);
          setPirateLairs(msg.pirateLairs);
          setBattles(msg.battles);
          setForeignFleets(msg.foreignFleets);
          setForeignColonies(msg.foreignColonies);
          setLeaderboard(msg.leaderboard);
          setTerritories(msg.territories);
        } else if (msg.type === "tick") {
          setGame(msg.game);
          setColonies(msg.colonies);
          setTransfers(msg.transfers);
          setMissions(msg.missions);
          setExploredSystemIds(msg.exploredSystemIds);
          setMarkets(msg.markets);
          setRoutes(msg.routes);
          setOutposts(msg.outposts);
          setGateways(msg.gateways);
          setContracts(msg.contracts);
          setFleets(msg.fleets);
          setPirateLairs(msg.pirateLairs);
          setBattles(msg.battles);
          setForeignFleets(msg.foreignFleets);
          setForeignColonies(msg.foreignColonies);
          setLeaderboard(msg.leaderboard);
          setTerritories(msg.territories);
          if (msg.universe) setUniverse(msg.universe);
        } else if (msg.type === "actionError") {
          setActionError(msg.message);
          window.clearTimeout(errorTimerRef.current);
          errorTimerRef.current = window.setTimeout(() => setActionError(null), 4000);
        }
      };
      socket.onclose = (event) => {
        setConnected(false);
        if (disposed) return;
        // Session rejetée : inutile de retenter, on repasse par l'écran de connexion.
        if (event.code === WS_UNAUTHORIZED) {
          onUnauthorized();
          return;
        }
        const delay = Math.min(1000 * 2 ** retryRef.current, 15000);
        retryRef.current++;
        retryTimer = window.setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      disposed = true;
      window.clearTimeout(retryTimer);
      window.clearTimeout(errorTimerRef.current);
      socketRef.current?.close();
    };
  }, [sessionToken, onUnauthorized]);

  const send = useCallback((msg: ClientMessage) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
  }, []);

  return {
    playerId,
    universe,
    game,
    colonies,
    transfers,
    missions,
    exploredSystemIds,
    markets,
    routes,
    outposts,
    gateways,
    contracts,
    fleets,
    pirateLairs,
    battles,
    foreignFleets,
    foreignColonies,
    leaderboard,
    territories,
    connected,
    actionError,
    send,
  };
}
