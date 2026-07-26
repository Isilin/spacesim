import { ClientMessageSchema } from "@spacesim/protocol";
import type { ClientMessage, ServerMessage } from "@spacesim/protocol";
import type { FastifyInstance } from "fastify";
import { resolveSession } from "../../auth.js";
import type { GameEngine } from "../../game.js";

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
      const msg: ClientMessage = parsed.data;
      let error: string | null = null;
      if (msg.type === "build") {
        error = engine.build(empire, msg.colonyId, msg.buildingId);
      } else if (msg.type === "transfer") {
        error = engine.sendTransfer(
          empire,
          msg.fromColonyId,
          msg.toColonyId,
          msg.resources,
          msg.ships,
        );
      } else if (msg.type === "probe") {
        error = engine.probe(empire, msg.colonyId, msg.systemId);
      } else if (msg.type === "colonize") {
        error = engine.colonize(empire, msg.colonyId, msg.planetId);
      } else if (msg.type === "research") {
        error = engine.startResearch(empire, msg.techId);
      } else if (msg.type === "queueResearch") {
        error = engine.queueResearch(empire, msg.techId);
      } else if (msg.type === "clearResearchQueue") {
        error = engine.clearResearchQueue(empire);
      } else if (msg.type === "setLiftRule") {
        error = engine.setLiftRule(empire, msg.colonyId, msg.resource, msg.rule);
      } else if (msg.type === "sell") {
        error = engine.sellToStation(empire, msg.colonyId, msg.stationId, msg.resources);
      } else if (msg.type === "buy") {
        error = engine.buyFromStation(
          empire,
          msg.colonyId,
          msg.stationId,
          msg.resource,
          msg.budget,
        );
      } else if (msg.type === "buildShip") {
        error = engine.buildShip(empire, msg.colonyId, msg.shipId);
      } else if (msg.type === "createBlueprint") {
        error = engine.createBlueprint(empire, msg.name, msg.chassisId, msg.modules);
      } else if (msg.type === "updateBlueprint") {
        error = engine.updateBlueprint(
          empire,
          msg.blueprintId,
          msg.name,
          msg.chassisId,
          msg.modules,
        );
      } else if (msg.type === "deleteBlueprint") {
        error = engine.deleteBlueprint(empire, msg.blueprintId);
      } else if (msg.type === "buildBlueprint") {
        error = engine.buildBlueprint(empire, msg.blueprintId, msg.colonyId, msg.fleetId);
      } else if (msg.type === "buyBlueprintFromStation") {
        error = engine.buyBlueprintFromStation(empire, msg.colonyId, msg.stationId, msg.presetId);
      } else if (msg.type === "sellBlueprint") {
        error = engine.sellBlueprint(empire, msg.colonyId, msg.stationId, msg.blueprintId);
      } else if (msg.type === "sellShip") {
        error = engine.sellShip(empire, msg.colonyId, msg.stationId, msg.shipId, msg.count);
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
      } else if (msg.type === "attackFleet") {
        error = engine.attackFleet(empire, msg.fleetId, msg.targetFleetId);
      } else if (msg.type === "attackColony") {
        error = engine.attackColony(empire, msg.fleetId, msg.targetColonyId);
      } else if (msg.type === "declareWar") {
        error = engine.declareWar(empire, msg.targetEmpireId);
      } else if (msg.type === "makePeace") {
        error = engine.makePeace(empire, msg.targetEmpireId);
      } else if (msg.type === "disbandFleet") {
        error = engine.disbandFleet(empire, msg.fleetId);
      } else if (msg.type === "postContract") {
        error = engine.postContract(
          empire,
          msg.colonyId,
          msg.resource,
          msg.quantity,
          msg.pricePerUnit,
          msg.durationMs,
        );
      } else if (msg.type === "acceptContract") {
        error = engine.acceptContract(empire, msg.colonyId, msg.contractId, msg.quantity);
      } else if (msg.type === "cancelContract") {
        error = engine.cancelContract(empire, msg.contractId);
      } else if (msg.type === "proposeRelation") {
        error = engine.proposeRelation(empire, msg.targetEmpireId, msg.kind);
      } else if (msg.type === "respondRelation") {
        error = engine.respondRelation(empire, msg.proposalId, msg.accept);
      } else if (msg.type === "cancelProposal") {
        error = engine.cancelProposal(empire, msg.proposalId);
      } else if (msg.type === "breakRelation") {
        error = engine.breakRelation(empire, msg.targetEmpireId);
      }
      if (error) send({ type: "actionError", message: error });
    });

    socket.on("close", unsubscribe);
  });
}
