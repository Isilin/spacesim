import type { GameRuntime } from "./game-runtime.js";
import type { Logger } from "./logger.js";
import type { EmpireEventDraft } from "@spacesim/shared";
import type { Persister } from "./persistence/persister.js";
import { BootstrapService } from "./services/bootstrap-service.js";
import { ContractService } from "./services/contract-service.js";
import { CommunicationService } from "./services/communication-service.js";
import { CorporationService } from "./services/corporation-service.js";
import { DevService } from "./services/dev-service.js";
import { DiplomacyService } from "./services/diplomacy-service.js";
import { ExplorationService } from "./services/exploration-service.js";
import { FleetService } from "./services/fleet-service.js";
import { GatewayService } from "./services/gateway-service.js";
import { IndustryService } from "./services/industry-service.js";
import { InboxService } from "./services/inbox-service.js";
import { LogisticsService } from "./services/logistics-service.js";
import { MarketService } from "./services/market-service.js";
import { ObjectiveService } from "./services/objective-service.js";
import { OrderBookService } from "./services/order-book-service.js";
import { StationService } from "./services/station-service.js";
import { TickRunner } from "./tick-runner.js";

/** Les onze services par domaine + bootstrap + outils de dev + l'orchestrateur de tick, composés. */
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
  inbox: InboxService;
  corporation: CorporationService;
  communication: CommunicationService;
  orderBook: OrderBookService;
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
  // Même cycle cassé par une fermeture paresseuse que pour les autres services : la
  // logistique dépose dans un avoir à l'arrivée d'un convoi, le carnet ne connaît pas
  // les convois.
  let orderBook: OrderBookService;

  /**
   * La boîte de réception (chantier 32.4) est construite en PREMIER et sans dépendance :
   * elle n'appelle personne, tout le monde l'appelle. Les services de domaine reçoivent
   * `emit` comme ils reçoivent déjà `persistColony` — aucun d'eux ne connaît
   * l'`InboxService` (ADR 0001).
   */
  const inbox = new InboxService(runtime, notify, logger);
  const emit = (draft: EmpireEventDraft) => inbox.emit(draft);

  const industry = new IndustryService(
    runtime,
    notify,
    logger,
    (fleet) => fleetService.persistFleet(fleet),
    {
      resolveTradeAccess: (empire, fromColonyId, stationId) =>
        station.resolveTradeAccess(empire, fromColonyId, stationId),
      applyStationTrade: (stationId, creditDelta) =>
        station.applyStationTrade(stationId, creditDelta),
    },
    emit,
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
    emit,
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
    (empire, systemId) => exploration.markScanned(empire, systemId),
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
      depositToHolding: (stationId, empireId, cargo) =>
        orderBook.depositToHolding(stationId, empireId, cargo),
      venueAccess: (empire, stationId) =>
        station.resolveVenueAccess(empire, stationId),
      stationSystemId: (stationId) => station.stationSystemId(stationId),
    },
    {
      insertStation: (empire, newStation) =>
        station.insertStation(empire, newStation),
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
    // Guerre héritée de la corporation : un membre ne peut pas s'en extraire par une
    // paix personnelle, sinon une déclaration de corporation ne vaudrait rien (ADR 0011).
    (a, b) => diplomacy.atWar(a, b) || corporation.corpsAtWar(a, b),
    (galaxyId) => diplomacy.worldEventKindsOnGalaxy(galaxyId),
    emit,
  );
  diplomacy = new DiplomacyService(runtime, notify, logger, emit);
  const corporation = new CorporationService(
    runtime,
    notify,
    logger,
    (colony) => industry.persistColony(colony),
    emit,
  );
  const objective = new ObjectiveService(
    runtime,
    notify,
    logger,
    (colony) => industry.persistColony(colony),
    emit,
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
    (a, b) => corporation.sameCorporation(a, b),
    (ownerId, visitorId) => corporation.standingTowards(ownerId, visitorId),
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
  const communication = new CommunicationService(
    runtime,
    notify,
    logger,
    emit,
    // Le silence est recopié sur l'empire à la connexion et à chaque décision de
    // modération : le comparer ici est synchrone, comme la commande qui l'interroge.
    (empire) => empire.mutedUntil !== null && empire.mutedUntil > Date.now(),
  );
  orderBook = new OrderBookService(
    runtime,
    notify,
    logger,
    // Le carnet ne connaît pas les stations : il demande au domaine si la place est
    // ouverte, à quel taux, et pour qui. Même geste que partout ailleurs (ADR 0001).
    (empire, stationId) => station.resolveVenueAccess(empire, stationId),
    (stationId, creditDelta) =>
      station.applyStationTrade(stationId, creditDelta),
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
    logger,
  );
  const devService = new DevService(runtime, notify, logger, {
    gateway,
    diplomacy,
    market,
    bootstrap,
    exploration,
    fleetService,
    station,
  });

  return {
    inbox,
    corporation,
    communication,
    orderBook,
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
