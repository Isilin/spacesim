import type { GameRuntime } from "./game-runtime.js";
import type { Logger } from "./logger.js";
import { BootstrapService } from "./services/bootstrap-service.js";
import { ContractService } from "./services/contract-service.js";
import { DevService } from "./services/dev-service.js";
import { DiplomacyService } from "./services/diplomacy-service.js";
import { ExplorationService } from "./services/exploration-service.js";
import { FleetService } from "./services/fleet-service.js";
import { GatewayService } from "./services/gateway-service.js";
import { IndustryService } from "./services/industry-service.js";
import { LogisticsService } from "./services/logistics-service.js";
import { MarketService } from "./services/market-service.js";
import { ObjectiveService } from "./services/objective-service.js";
import { TickRunner } from "./tick-runner.js";

/** Les neuf services par domaine + bootstrap + outils de dev + l'orchestrateur de tick, composés. */
export interface ComposedEngine {
  industry: IndustryService;
  logistics: LogisticsService;
  gateway: GatewayService;
  contract: ContractService;
  market: MarketService;
  exploration: ExplorationService;
  fleetService: FleetService;
  diplomacy: DiplomacyService;
  objective: ObjectiveService;
  bootstrap: BootstrapService;
  devService: DevService;
  tickRunner: TickRunner;
}

/**
 * Câble les neuf services par domaine, le bootstrap et le `TickRunner` (chantier 19.9,
 * extrait du constructeur de `GameEngine`).
 *
 * Cycle de dépendances cassé par des callbacks PARESSEUX (fermetures) sur des variables
 * locales `let` déclarées avant d'être affectées : Gateway/Contract/Market ont besoin de
 * `reserveShip`/`insertMission` (Logistics) ; Logistics a besoin de `resolveSaleAt`/
 * `persistGateway` (Market/Gateway) pour résoudre les missions qui traversent leur
 * domaine. L'ordre de CONSTRUCTION des services n'importe pas, seul l'ordre
 * d'AFFECTATION des variables compte — TypeScript autorise la lecture d'une `let` pas
 * encore affectée depuis une fermeture non exécutée immédiatement (même patron que
 * l'ancien `this.xxx` dans le constructeur de `GameEngine`, transposé en variables
 * locales).
 */
export function composeEngine(
  runtime: GameRuntime,
  logger: Logger,
  notify: () => void,
): ComposedEngine {
  let logistics: LogisticsService;
  let gateway: GatewayService;
  let contract: ContractService;
  let market: MarketService;
  let exploration: ExplorationService;
  let diplomacy: DiplomacyService;
  let bootstrap: BootstrapService;

  const industry = new IndustryService(runtime, notify, logger, (fleet) =>
    fleetService.persistFleet(fleet),
  );
  gateway = new GatewayService(
    runtime,
    notify,
    logger,
    (colony) => industry.persistColony(colony),
    (empire, colony, busyUntil) => logistics.reserveShip(empire, colony, busyUntil),
    (empire, kind, fromColonyId, targetId, durationMs, extras) =>
      logistics.insertMission(empire, kind, fromColonyId, targetId, durationMs, extras),
  );
  contract = new ContractService(
    runtime,
    notify,
    logger,
    (colony) => industry.persistColony(colony),
    (empire, colony, busyUntil) => logistics.reserveShip(empire, colony, busyUntil),
    (empire, kind, fromColonyId, targetId, durationMs, extras, departedAt) =>
      logistics.insertMission(empire, kind, fromColonyId, targetId, durationMs, extras, departedAt),
  );
  market = new MarketService(
    runtime,
    notify,
    logger,
    (colony) => industry.persistColony(colony),
    (state) => diplomacy.persistFactionState(state),
    (galaxyId) => diplomacy.worldEventKindsOnGalaxy(galaxyId),
    (empire, colony, busyUntil) => logistics.reserveShip(empire, colony, busyUntil),
    (empire, kind, fromColonyId, targetId, durationMs, extras, departedAt) =>
      logistics.insertMission(empire, kind, fromColonyId, targetId, durationMs, extras, departedAt),
    (empire, colonyId, resource, quantity, pricePerUnit, durationMs) =>
      contract.postContract(empire, colonyId, resource, quantity, pricePerUnit, durationMs),
    (c) => contract.insertContract(c),
  );
  logistics = new LogisticsService(
    runtime,
    notify,
    logger,
    (colony) => industry.persistColony(colony),
    (empire, colony) => bootstrap.insertColony(empire, colony),
    (empire, systemId) => exploration.markExplored(empire, systemId),
    (colonyId) => bootstrap.empireOfColony(colonyId),
    {
      resolveSaleAt: (stationId, cargo) => market.resolveSaleAt(stationId, cargo),
      resolvePurchaseAt: (stationId, resource, budget, capacity) =>
        market.resolvePurchaseAt(stationId, resource, budget, capacity),
      stationRepBonus: (empire, stationId) => market.stationRepBonus(empire, stationId),
      addFactionRep: (empire, stationId, creditsExchanged) =>
        market.addFactionRep(empire, stationId, creditsExchanged),
    },
    (g) => gateway.persistGateway(g),
  );
  exploration = new ExplorationService(
    runtime,
    notify,
    logger,
    (colony) => industry.persistColony(colony),
    (empire, kind, fromColonyId, targetId, durationMs) =>
      logistics.insertMission(empire, kind, fromColonyId, targetId, durationMs),
    () => market.initMarkets(),
    () => gateway.initGateways(),
  );
  const fleetService = new FleetService(
    runtime,
    notify,
    logger,
    (colony) => industry.persistColony(colony),
    (empire, systemId) => exploration.dropClaim(empire, systemId),
    (empire, systemId) => exploration.markExplored(empire, systemId),
    (a, b) => diplomacy.atWar(a, b),
    (galaxyId) => diplomacy.worldEventKindsOnGalaxy(galaxyId),
  );
  diplomacy = new DiplomacyService(runtime, notify, logger);
  const objective = new ObjectiveService(runtime, notify, logger, (colony) =>
    industry.persistColony(colony),
  );
  bootstrap = new BootstrapService(
    runtime,
    notify,
    logger,
    (empire) => industry.seedStarterBlueprints(empire),
    () => exploration.ensureFrontier(),
    () => exploration.galaxyOccupancy(),
    (count) => exploration.growUniverse(count),
    (empire, systemId) => exploration.markExplored(empire, systemId),
  );
  const tickRunner = new TickRunner(
    runtime,
    {
      industry,
      logistics,
      gateway,
      contract,
      market,
      exploration,
      fleetService,
      diplomacy,
      objective,
    },
    notify,
  );
  const devService = new DevService(runtime, notify, logger, {
    gateway,
    diplomacy,
    market,
    bootstrap,
    exploration,
    fleetService,
  });

  return {
    industry,
    logistics,
    gateway,
    contract,
    market,
    exploration,
    fleetService,
    diplomacy,
    objective,
    bootstrap,
    devService,
    tickRunner,
  };
}
