import type { GameRuntime } from "./game-runtime.js";
import type { Logger } from "./logger.js";
import type { Persister } from "./persistence/persister.js";
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
import { StationService } from "./services/station-service.js";
import { TickRunner } from "./tick-runner.js";

/** Les dix services par domaine + bootstrap + outils de dev + l'orchestrateur de tick, composés. */
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
  station: StationService;
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
  persister: Persister,
): ComposedEngine {
  let logistics: LogisticsService;
  let gateway: GatewayService;
  let contract: ContractService;
  let market: MarketService;
  let exploration: ExplorationService;
  let diplomacy: DiplomacyService;
  let bootstrap: BootstrapService;
  let station: StationService;

  const industry = new IndustryService(runtime, notify, logger, (fleet) =>
    fleetService.persistFleet(fleet),
  );
  gateway = new GatewayService(
    runtime,
    notify,
    logger,
    (colony) => industry.persistColony(colony),
    (empire, colony, busyUntil) =>
      logistics.reserveShip(empire, colony, busyUntil),
    (empire, kind, fromColonyId, targetId, durationMs, extras) =>
      logistics.insertMission(
        empire,
        kind,
        fromColonyId,
        targetId,
        durationMs,
        extras,
      ),
  );
  contract = new ContractService(
    runtime,
    notify,
    logger,
    (colony) => industry.persistColony(colony),
    (empire, colony, busyUntil) =>
      logistics.reserveShip(empire, colony, busyUntil),
    (empire, kind, fromColonyId, targetId, durationMs, extras, departedAt) =>
      logistics.insertMission(
        empire,
        kind,
        fromColonyId,
        targetId,
        durationMs,
        extras,
        departedAt,
      ),
  );
  market = new MarketService(
    runtime,
    notify,
    logger,
    (colony) => industry.persistColony(colony),
    (state) => diplomacy.persistFactionState(state),
    (galaxyId) => diplomacy.worldEventKindsOnGalaxy(galaxyId),
    (empire, colony, busyUntil) =>
      logistics.reserveShip(empire, colony, busyUntil),
    (empire, kind, fromColonyId, targetId, durationMs, extras, departedAt) =>
      logistics.insertMission(
        empire,
        kind,
        fromColonyId,
        targetId,
        durationMs,
        extras,
        departedAt,
      ),
    (empire, colonyId, resource, quantity, pricePerUnit, durationMs) =>
      contract.postContract(
        empire,
        colonyId,
        resource,
        quantity,
        pricePerUnit,
        durationMs,
      ),
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
      resolveSaleAt: (tradingPostId, cargo) =>
        market.resolveSaleAt(tradingPostId, cargo),
      resolvePurchaseAt: (tradingPostId, resource, budget, capacity) =>
        market.resolvePurchaseAt(tradingPostId, resource, budget, capacity),
      tradingPostRepBonus: (empire, tradingPostId) =>
        market.tradingPostRepBonus(empire, tradingPostId),
      addFactionRep: (empire, tradingPostId, creditsExchanged) =>
        market.addFactionRep(empire, tradingPostId, creditsExchanged),
    },
    (g) => gateway.persistGateway(g),
    {
      insertStation: (empire, newStation) => station.insertStation(empire, newStation),
      persistStation: (s) => station.persistStation(s),
      resolveStationSaleAt: (stationId, cargo) =>
        station.resolveStationSaleAt(stationId, cargo),
      resolveStationPurchaseAt: (stationId, resource, budget, capacity) =>
        station.resolveStationPurchaseAt(stationId, resource, budget, capacity),
    },
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
  station = new StationService(
    runtime,
    notify,
    logger,
    (colony) => industry.persistColony(colony),
    (empire, colony, busyUntil) =>
      logistics.reserveShip(empire, colony, busyUntil),
    (empire, kind, fromColonyId, targetId, durationMs, extras) =>
      logistics.insertMission(
        empire,
        kind,
        fromColonyId,
        targetId,
        durationMs,
        extras,
      ),
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
      station,
    },
    notify,
    persister,
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
    station,
    bootstrap,
    devService,
    tickRunner,
  };
}
