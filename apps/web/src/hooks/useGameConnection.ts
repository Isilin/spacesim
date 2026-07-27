import type { ClientMessage, ServerMessage } from "@spacesim/protocol";
import { useEffect } from "react";
import { useGameStore } from "../state/game-store.js";

/** Code de fermeture WS émis par le serveur quand la session n'est plus valide (chantier 8). */
const WS_UNAUTHORIZED = 4001;

/**
 * Connexion WS au serveur de jeu, avec reconnexion automatique. Ne retourne rien : l'état
 * de jeu vit dans `useGameStore` (`state/game-store.ts`), lu directement par les composants.
 * `sessionToken` = jeton d'authentification (chantier 8) ; `onUnauthorized` est appelé
 * quand le serveur le rejette, pour renvoyer à l'écran de connexion.
 */
export function useGameConnection(sessionToken: string, onUnauthorized: () => void): void {
  useEffect(() => {
    const store = useGameStore.getState();
    // Un store Zustand est un singleton de module : contrairement à `useState`, il ne se
    // réinitialise pas tout seul quand `AuthGate` remonte `App` sur changement de compte.
    // Cet effet ne rejoue qu'au (re)montage (clé = `sessionToken`), pas aux reconnexions
    // internes (cf. `connect()` ci-dessous) : un compte neuf part d'un état vide, une
    // reconnexion du même compte garde l'état déjà affiché jusqu'au prochain `hello`.
    store.reset();

    let disposed = false;
    let retryTimer: number | undefined;
    let retryCount = 0;
    let socket: WebSocket | null = null;
    let errorTimer: number | undefined;

    const connect = () => {
      const protocol = location.protocol === "https:" ? "wss" : "ws";
      const query = `?session=${encodeURIComponent(sessionToken)}`;
      socket = new WebSocket(`${protocol}://${location.host}/ws${query}`);
      socket.onopen = () => {
        retryCount = 0;
        useGameStore.getState().setConnected(true);
      };
      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data) as ServerMessage;
        if (msg.type === "hello") {
          useGameStore.getState().applyHello(msg);
        } else if (msg.type === "tick") {
          useGameStore.getState().applyTick(msg);
        } else if (msg.type === "actionError") {
          useGameStore.getState().setActionError(msg.message);
          window.clearTimeout(errorTimer);
          errorTimer = window.setTimeout(() => useGameStore.getState().setActionError(null), 4000);
        }
      };
      socket.onclose = (event) => {
        useGameStore.getState().setConnected(false);
        if (disposed) return;
        // Session rejetée : inutile de retenter, on repasse par l'écran de connexion.
        if (event.code === WS_UNAUTHORIZED) {
          onUnauthorized();
          return;
        }
        const delay = Math.min(1000 * 2 ** retryCount, 15000);
        retryCount++;
        retryTimer = window.setTimeout(connect, delay);
      };
    };

    const send = (msg: ClientMessage) => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
    };
    store.setSend(send);

    connect();
    return () => {
      disposed = true;
      window.clearTimeout(retryTimer);
      window.clearTimeout(errorTimer);
      socket?.close();
    };
  }, [sessionToken, onUnauthorized]);
}
