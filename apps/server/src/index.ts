import websocket from "@fastify/websocket";
import type { ClientMessage, ServerMessage } from "@spacesim/shared";
import Fastify from "fastify";
import { GameEngine } from "./game.js";

const PORT = Number(process.env.PORT ?? 3001);

const engine = GameEngine.load();
engine.start();

const app = Fastify({ logger: { level: "warn" } });
await app.register(websocket);

app.get("/health", () => ({ ok: true, tick: engine.game.tick }));

// Triches de dev : injection de ressources, avance rapide. Jamais en production.
if (process.env.NODE_ENV !== "production") {
  app.post("/dev/grant", (request) => {
    engine.devGrant((request.body ?? {}) as Record<string, number>);
    return { ok: true };
  });
  app.post("/dev/fastforward", (request) => {
    const { seconds } = (request.body ?? {}) as { seconds?: number };
    engine.devFastForward(seconds ?? 0);
    return { ok: true, tick: engine.game.tick };
  });
  app.post("/dev/fundgateway", (request) => {
    const { galaxyId, leave } = (request.body ?? {}) as { galaxyId?: string; leave?: number };
    engine.devFundGateway(galaxyId ?? "", leave ?? 50);
    return { ok: true };
  });
  app.post("/dev/spawnpirate", (request) => {
    const { systemId, threat } = (request.body ?? {}) as { systemId?: string; threat?: number };
    engine.devSpawnPirate(systemId ?? "", threat ?? 2);
    return { ok: true };
  });
  app.post("/dev/spawnempire", (request) => {
    const { name } = (request.body ?? {}) as { name?: string };
    const empireId = engine.devSpawnEmpire(name);
    return { ok: empireId !== null, empireId };
  });
  app.get("/dev/empires", () => engine.devEmpireSummaries());
}

app.get("/ws", { websocket: true }, (socket, request) => {
  const send = (msg: ServerMessage) => socket.send(JSON.stringify(msg));
  // Identité de connexion (chantier 7c-B) : jeton `?player=` → empire (rejoint ou créé).
  const token = (request.query as { player?: string }).player;
  const empire = engine.createOrJoinEmpire(token);
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
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send({ type: "actionError", message: "Message illisible" });
      return;
    }
    let error: string | null = null;
    if (msg.type === "build") {
      error = engine.build(empire, msg.colonyId, msg.buildingId);
    } else if (msg.type === "transfer") {
      error = engine.sendTransfer(empire, msg.fromColonyId, msg.toColonyId, msg.resources);
    } else if (msg.type === "probe") {
      error = engine.probe(empire, msg.colonyId, msg.systemId);
    } else if (msg.type === "colonize") {
      error = engine.colonize(empire, msg.colonyId, msg.planetId);
    } else if (msg.type === "research") {
      error = engine.startResearch(empire, msg.techId);
    } else if (msg.type === "sell") {
      error = engine.sellToStation(empire, msg.colonyId, msg.stationId, msg.resources);
    } else if (msg.type === "buy") {
      error = engine.buyFromStation(empire, msg.colonyId, msg.stationId, msg.resource, msg.budget);
    } else if (msg.type === "buildShip") {
      error = engine.buildShip(empire, msg.colonyId, msg.shipId);
    } else if (msg.type === "buildOutpost") {
      error = engine.buildOutpost(empire, msg.colonyId, msg.beltId);
    } else if (msg.type === "createRoute") {
      error = engine.createRoute(
        empire,
        msg.ownerColonyId,
        msg.fromId,
        msg.fromKind,
        msg.toId,
        msg.toKind,
        msg.resource,
        msg.rule,
        msg.ships,
      );
    } else if (msg.type === "setRoutePaused") {
      error = engine.setRoutePaused(empire, msg.routeId, msg.paused);
    } else if (msg.type === "deleteRoute") {
      error = engine.deleteRoute(empire, msg.routeId);
    } else if (msg.type === "claimSystem") {
      error = engine.claimSystem(empire, msg.systemId);
    } else if (msg.type === "unclaimSystem") {
      error = engine.unclaimSystem(empire, msg.systemId);
    } else if (msg.type === "contributeGateway") {
      error = engine.contributeGateway(empire, msg.colonyId, msg.galaxyId, msg.resources);
    } else if (msg.type === "createFleet") {
      error = engine.createFleet(empire, msg.colonyId, msg.name);
    } else if (msg.type === "buildWarship") {
      error = engine.buildWarship(empire, msg.fleetId, msg.warshipId);
    } else if (msg.type === "setFleetDirectives") {
      error = engine.setFleetDirectives(empire, msg.fleetId, msg.directives);
    } else if (msg.type === "moveFleet") {
      error = engine.moveFleet(empire, msg.fleetId, msg.toSystemId);
    } else if (msg.type === "attackLair") {
      error = engine.attackLair(empire, msg.fleetId, msg.lairId);
    } else if (msg.type === "disbandFleet") {
      error = engine.disbandFleet(empire, msg.fleetId);
    }
    if (error) send({ type: "actionError", message: error });
  });

  socket.on("close", unsubscribe);
});

await app.listen({ port: PORT, host: "127.0.0.1" });
console.log(`[server] http://127.0.0.1:${PORT} — partie ${engine.game.id} (seed ${engine.game.seed}), tick ${engine.game.tick}`);
