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
      return engine.industry.build(empire, msg.colonyId, msg.buildingId);
    case "transfer":
      return engine.logistics.sendTransfer(
        empire,
        msg.fromColonyId,
        msg.toId,
        msg.toKind ?? "colony",
        msg.resources,
        msg.ships,
      );
    case "probe":
      return engine.exploration.probe(empire, msg.colonyId, msg.systemId);
    case "colonize":
      return engine.exploration.colonize(empire, msg.colonyId, msg.planetId);
    case "foundStation":
      return engine.station.foundStation(empire, msg.colonyId, msg.bodyId);
    case "buildZone":
      return engine.station.buildZone(empire, msg.stationId, msg.zoneTypeId, msg.q, msg.r);
    case "buildInstallation":
      return engine.station.buildInstallation(
        empire,
        msg.stationId,
        msg.installationId,
      );
    case "setStationMarketPolicy":
      return engine.station.setMarketPolicy(
        empire,
        msg.stationId,
        msg.marketAccess,
        msg.taxRate,
      );
    case "research":
      return engine.industry.startResearch(empire, msg.techId);
    case "queueResearch":
      return engine.industry.queueResearch(empire, msg.techId);
    case "clearResearchQueue":
      return engine.industry.clearResearchQueue(empire);
    case "setLiftRule":
      return engine.logistics.setLiftRule(
        empire,
        msg.colonyId,
        msg.resource,
        msg.rule,
      );
    case "sell":
      return msg.venueKind === "station"
        ? engine.station.sellToStation(
            empire,
            msg.colonyId,
            msg.venueId,
            msg.resources,
          )
        : engine.market.sellToTradingPost(
            empire,
            msg.colonyId,
            msg.venueId,
            msg.resources,
          );
    case "buy":
      return msg.venueKind === "station"
        ? engine.station.buyFromStation(
            empire,
            msg.colonyId,
            msg.venueId,
            msg.resource,
            msg.budget,
          )
        : engine.market.buyFromTradingPost(
            empire,
            msg.colonyId,
            msg.venueId,
            msg.resource,
            msg.budget,
          );
    case "buildShip":
      return engine.industry.buildShip(empire, msg.colonyId, msg.shipId);
    case "createBlueprint":
      return engine.industry.createBlueprint(
        empire,
        msg.name,
        msg.chassisId,
        msg.modules,
      );
    case "updateBlueprint":
      return engine.industry.updateBlueprint(
        empire,
        msg.blueprintId,
        msg.name,
        msg.chassisId,
        msg.modules,
      );
    case "deleteBlueprint":
      return engine.industry.deleteBlueprint(empire, msg.blueprintId);
    case "buildBlueprint":
      return engine.industry.buildBlueprint(
        empire,
        msg.blueprintId,
        msg.colonyId,
        msg.fleetId,
      );
    case "buyBlueprint":
      return msg.venueKind === "station"
        ? engine.industry.buyBlueprintFromStation(
            empire,
            msg.colonyId,
            msg.venueId,
            msg.presetId,
          )
        : engine.industry.buyBlueprintFromTradingPost(
            empire,
            msg.colonyId,
            msg.venueId,
            msg.presetId,
          );
    case "sellBlueprint":
      return msg.venueKind === "station"
        ? engine.industry.sellBlueprintToStation(
            empire,
            msg.colonyId,
            msg.venueId,
            msg.blueprintId,
          )
        : engine.industry.sellBlueprint(
            empire,
            msg.colonyId,
            msg.venueId,
            msg.blueprintId,
          );
    case "sellShip":
      return msg.venueKind === "station"
        ? engine.industry.sellShipToStation(
            empire,
            msg.colonyId,
            msg.venueId,
            msg.shipId,
            msg.count,
          )
        : engine.industry.sellShip(
            empire,
            msg.colonyId,
            msg.venueId,
            msg.shipId,
            msg.count,
          );
    case "buildOutpost":
      return engine.logistics.buildOutpost(empire, msg.colonyId, msg.beltId);
    case "createRoute":
      return engine.logistics.createRoute(
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
      return engine.logistics.setRoutePaused(empire, msg.routeId, msg.paused);
    case "deleteRoute":
      return engine.logistics.deleteRoute(empire, msg.routeId);
    case "claimSystem":
      return engine.exploration.claimSystem(empire, msg.systemId);
    case "unclaimSystem":
      return engine.exploration.unclaimSystem(empire, msg.systemId);
    case "contributeGateway":
      return engine.gateway.contributeGateway(
        empire,
        msg.colonyId,
        msg.galaxyId,
        msg.resources,
      );
    case "createFleet":
      return engine.fleetService.createFleet(empire, msg.colonyId, msg.name);
    case "buildWarship":
      return engine.fleetService.buildWarship(
        empire,
        msg.fleetId,
        msg.warshipId,
      );
    case "setFleetDirectives":
      return engine.fleetService.setFleetDirectives(
        empire,
        msg.fleetId,
        msg.directives,
      );
    case "moveFleet":
      return engine.fleetService.moveFleet(empire, msg.fleetId, msg.toSystemId);
    case "attackLair":
      return engine.fleetService.attackLair(empire, msg.fleetId, msg.lairId);
    case "attackFleet":
      return engine.fleetService.attackFleet(
        empire,
        msg.fleetId,
        msg.targetFleetId,
      );
    case "attackColony":
      return engine.fleetService.attackColony(
        empire,
        msg.fleetId,
        msg.targetColonyId,
      );
    case "declareWar":
      return engine.diplomacy.declareWar(empire, msg.targetEmpireId);
    case "makePeace":
      return engine.diplomacy.makePeace(empire, msg.targetEmpireId);
    case "disbandFleet":
      return engine.fleetService.disbandFleet(empire, msg.fleetId);
    case "postContract":
      return engine.contract.postContract(
        empire,
        msg.colonyId,
        msg.resource,
        msg.quantity,
        msg.pricePerUnit,
        msg.durationMs,
      );
    case "acceptContract":
      return engine.contract.acceptContract(
        empire,
        msg.colonyId,
        msg.contractId,
        msg.quantity,
      );
    case "cancelContract":
      return engine.contract.cancelContract(empire, msg.contractId);
    case "proposeRelation":
      return engine.diplomacy.proposeRelation(
        empire,
        msg.targetEmpireId,
        msg.kind,
      );
    case "respondRelation":
      return engine.diplomacy.respondRelation(
        empire,
        msg.proposalId,
        msg.accept,
      );
    case "cancelProposal":
      return engine.diplomacy.cancelProposal(empire, msg.proposalId);
    case "breakRelation":
      return engine.diplomacy.breakRelation(empire, msg.targetEmpireId);
    default:
      return assertNever(msg);
  }
}
