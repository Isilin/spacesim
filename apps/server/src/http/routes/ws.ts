import { ClientMessageSchema } from "@spacesim/protocol";
import type { ServerMessage } from "@spacesim/protocol";
import type { FastifyInstance } from "fastify";
import { resolveSession } from "../../auth.js";
import type { GameEngine } from "../../game.js";
import { dispatchClientMessage } from "../../ws/dispatch.js";

/** Fermeture WS : session absente/expirée (le client renvoie alors vers l'écran de connexion). */
const WS_UNAUTHORIZED = 4001;

export function registerWsRoutes(app: FastifyInstance, engine: GameEngine): void {
  app.get("/ws", { websocket: true }, (socket, request) => {
    const send = (msg: ServerMessage) => socket.send(JSON.stringify(msg));
    // Identité de connexion (chantier 8) : jeton de session `?session=` → compte → empire.
    const account = resolveSession((request.query as { session?: string }).session);
    if (!account) {
      socket.close(WS_UNAUTHORIZED, "Session invalide");
      return;
    }
    const empire = engine.empireForAccount(account.id) ?? engine.createEmpireForAccount(account.id);
    if (!empire) {
      socket.close(WS_UNAUTHORIZED, "Aucun empire pour ce compte");
      return;
    }
    send({
      type: "hello",
      playerId: empire.id,
      universe: engine.clientUniverseForEmpire(empire),
      ...engine.snapshotForEmpire(empire),
    });
    const unsubscribe = engine.onChange(() =>
      send({ type: "tick", ...engine.snapshotForEmpire(empire) }),
    );

    socket.on("message", (raw: Buffer) => {
      let payload: unknown;
      try {
        payload = JSON.parse(raw.toString());
      } catch {
        send({ type: "actionError", message: "Message illisible" });
        return;
      }
      const parsed = ClientMessageSchema.safeParse(payload);
      if (!parsed.success) {
        send({ type: "actionError", message: "Commande invalide" });
        return;
      }
      const error = dispatchClientMessage(engine, empire, parsed.data);
      if (error) send({ type: "actionError", message: error });
    });

    socket.on("close", unsubscribe);
  });
}
