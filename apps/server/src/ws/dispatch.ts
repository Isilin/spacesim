import type { ClientMessage } from "@spacesim/protocol";
import type { Empire } from "../empire.js";
import type { GameEngine } from "../game.js";

/** Ne compile que si tous les discriminants de `ClientMessage` ont été traités. */
function assertNever(value: never): never {
  throw new Error(`Commande WebSocket non gérée : ${JSON.stringify(value)}`);
}

/** Applique une commande validée à l'empire agissant ; renvoie le message d'erreur du moteur, ou null. */
export function dispatchClientMessage(
  engine: GameEngine,
  empire: Empire,
  msg: ClientMessage,
): string | null {
  switch (msg.type) {
    case "build":
      return engine.build(empire, msg.colonyId, msg.buildingId);
    case "transfer":
      return engine.sendTransfer(
        empire,
        msg.fromColonyId,
        msg.toColonyId,
        msg.resources,
        msg.ships,
      );
    case "probe":
      return engine.probe(empire, msg.colonyId, msg.systemId);
    case "colonize":
      return engine.colonize(empire, msg.colonyId, msg.planetId);
    case "research":
      return engine.startResearch(empire, msg.techId);
    case "queueResearch":
      return engine.queueResearch(empire, msg.techId);
    case "clearResearchQueue":
      return engine.clearResearchQueue(empire);
    case "setLiftRule":
      return engine.setLiftRule(empire, msg.colonyId, msg.resource, msg.rule);
    case "sell":
      return engine.sellToStation(empire, msg.colonyId, msg.stationId, msg.resources);
    case "buy":
      return engine.buyFromStation(empire, msg.colonyId, msg.stationId, msg.resource, msg.budget);
    case "buildShip":
      return engine.buildShip(empire, msg.colonyId, msg.shipId);
    case "createBlueprint":
      return engine.createBlueprint(empire, msg.name, msg.chassisId, msg.modules);
    case "updateBlueprint":
      return engine.updateBlueprint(empire, msg.blueprintId, msg.name, msg.chassisId, msg.modules);
    case "deleteBlueprint":
      return engine.deleteBlueprint(empire, msg.blueprintId);
    case "buildBlueprint":
      return engine.buildBlueprint(empire, msg.blueprintId, msg.colonyId, msg.fleetId);
    case "buyBlueprintFromStation":
      return engine.buyBlueprintFromStation(empire, msg.colonyId, msg.stationId, msg.presetId);
    case "sellBlueprint":
      return engine.sellBlueprint(empire, msg.colonyId, msg.stationId, msg.blueprintId);
    case "sellShip":
      return engine.sellShip(empire, msg.colonyId, msg.stationId, msg.shipId, msg.count);
    case "buildOutpost":
      return engine.buildOutpost(empire, msg.colonyId, msg.beltId);
    case "createRoute":
      return engine.createRoute(
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
    case "setRoutePaused":
      return engine.setRoutePaused(empire, msg.routeId, msg.paused);
    case "deleteRoute":
      return engine.deleteRoute(empire, msg.routeId);
    case "claimSystem":
      return engine.claimSystem(empire, msg.systemId);
    case "unclaimSystem":
      return engine.unclaimSystem(empire, msg.systemId);
    case "contributeGateway":
      return engine.contributeGateway(empire, msg.colonyId, msg.galaxyId, msg.resources);
    case "createFleet":
      return engine.createFleet(empire, msg.colonyId, msg.name);
    case "buildWarship":
      return engine.buildWarship(empire, msg.fleetId, msg.warshipId);
    case "setFleetDirectives":
      return engine.setFleetDirectives(empire, msg.fleetId, msg.directives);
    case "moveFleet":
      return engine.moveFleet(empire, msg.fleetId, msg.toSystemId);
    case "attackLair":
      return engine.attackLair(empire, msg.fleetId, msg.lairId);
    case "attackFleet":
      return engine.attackFleet(empire, msg.fleetId, msg.targetFleetId);
    case "attackColony":
      return engine.attackColony(empire, msg.fleetId, msg.targetColonyId);
    case "declareWar":
      return engine.declareWar(empire, msg.targetEmpireId);
    case "makePeace":
      return engine.makePeace(empire, msg.targetEmpireId);
    case "disbandFleet":
      return engine.disbandFleet(empire, msg.fleetId);
    case "postContract":
      return engine.postContract(
        empire,
        msg.colonyId,
        msg.resource,
        msg.quantity,
        msg.pricePerUnit,
        msg.durationMs,
      );
    case "acceptContract":
      return engine.acceptContract(empire, msg.colonyId, msg.contractId, msg.quantity);
    case "cancelContract":
      return engine.cancelContract(empire, msg.contractId);
    case "proposeRelation":
      return engine.proposeRelation(empire, msg.targetEmpireId, msg.kind);
    case "respondRelation":
      return engine.respondRelation(empire, msg.proposalId, msg.accept);
    case "cancelProposal":
      return engine.cancelProposal(empire, msg.proposalId);
    case "breakRelation":
      return engine.breakRelation(empire, msg.targetEmpireId);
    default:
      return assertNever(msg);
  }
}
