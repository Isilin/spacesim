import type {
  ClientMessage,
  Gateway,
  Colony,
  Fleet,
  GameState,
  MiningOutpost,
  Mission,
  PirateLair,
  Route,
  ServerMessage,
  StationMarket,
  StoredBattle,
  Transfer,
  Universe,
} from "@spacesim/shared";
import { useCallback, useEffect, useRef, useState } from "react";

/** Clé de persistance du jeton de joueur (identité de connexion, chantier 7c). */
const PLAYER_TOKEN_KEY = "spacesim.player";

/** Jeton initial : `?player=` dans l'URL (force une identité) > localStorage > aucun. */
function initialToken(): string | undefined {
  const fromUrl = new URLSearchParams(location.search).get("player");
  if (fromUrl) return fromUrl;
  return localStorage.getItem(PLAYER_TOKEN_KEY) ?? undefined;
}

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
  fleets: Fleet[];
  pirateLairs: PirateLair[];
  battles: StoredBattle[];
  connected: boolean;
  /** Dernière erreur d'action renvoyée par le serveur (éphémère). */
  actionError: string | null;
  send: (msg: ClientMessage) => void;
}

/** Connexion WS au serveur de jeu, avec reconnexion automatique. */
export function useGameSocket(): GameConnection {
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
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [pirateLairs, setPirateLairs] = useState<PirateLair[]>([]);
  const [battles, setBattles] = useState<StoredBattle[]>([]);
  const [connected, setConnected] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const retryRef = useRef(0);
  const socketRef = useRef<WebSocket | null>(null);
  const errorTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    let disposed = false;
    let retryTimer: number | undefined;
    // Jeton d'identité : lu au montage, puis mis à jour par le `hello` du serveur
    // (les reconnexions réutilisent alors l'empire appris).
    let token = initialToken();

    const connect = () => {
      const protocol = location.protocol === "https:" ? "wss" : "ws";
      const query = token ? `?player=${encodeURIComponent(token)}` : "";
      const socket = new WebSocket(`${protocol}://${location.host}/ws${query}`);
      socketRef.current = socket;
      socket.onopen = () => {
        retryRef.current = 0;
        setConnected(true);
      };
      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data) as ServerMessage;
        if (msg.type === "hello") {
          token = msg.playerId;
          localStorage.setItem(PLAYER_TOKEN_KEY, msg.playerId);
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
          setFleets(msg.fleets);
          setPirateLairs(msg.pirateLairs);
          setBattles(msg.battles);
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
          setFleets(msg.fleets);
          setPirateLairs(msg.pirateLairs);
          setBattles(msg.battles);
          if (msg.universe) setUniverse(msg.universe);
        } else if (msg.type === "actionError") {
          setActionError(msg.message);
          window.clearTimeout(errorTimerRef.current);
          errorTimerRef.current = window.setTimeout(() => setActionError(null), 4000);
        }
      };
      socket.onclose = () => {
        setConnected(false);
        if (disposed) return;
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
  }, []);

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
    fleets,
    pirateLairs,
    battles,
    connected,
    actionError,
    send,
  };
}
