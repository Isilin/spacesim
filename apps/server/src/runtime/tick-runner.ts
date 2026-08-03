import { ECONOMY_TICK_TICKS, TICK_MS } from "@spacesim/shared";
import type { GameRuntime } from "./game-runtime.js";
import { consoleLogger, type Logger } from "./logger.js";
import type { Persister } from "./persistence/persister.js";
import { GameRepository } from "./repositories/game-repository.js";
import { PlayerRepository } from "./repositories/player-repository.js";
import type { ContractService } from "./services/contract-service.js";
import type { DiplomacyService } from "./services/diplomacy-service.js";
import type { ExplorationService } from "./services/exploration-service.js";
import type { FleetService } from "./services/fleet-service.js";
import type { GatewayService } from "./services/gateway-service.js";
import type { IndustryService } from "./services/industry-service.js";
import type { LogisticsService } from "./services/logistics-service.js";
import type { MarketService } from "./services/market-service.js";
import type { ObjectiveService } from "./services/objective-service.js";
import type { StationService } from "./services/station-service.js";

/** Les dix services que `TickRunner` orchestre, dans l'ordre exact de production. */
export interface TickServices {
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
}

/**
 * Fait avancer la simulation d'un nombre de ticks donné — boucle, persistance,
 * notification. Prend les services directement (chantier 19.6) : l'interface
 * `TickHost` d'origine (21 méthodes passe-plat sur `GameEngine`) a disparu.
 */
export class TickRunner {
  private readonly gameRepo = new GameRepository();
  private readonly playerRepo: PlayerRepository;

  /** Durée du dernier `run()`, en ms — un seul lot, pas la moyenne par tick. Exposé pour
   *  la supervision (même patron que `Persister.lastFlushAt`) et pour 27.6/27.12 sans
   *  redériver la mesure. */
  lastRunDurationMs: number | null = null;
  lastRunTickCount: number | null = null;

  constructor(
    private readonly runtime: GameRuntime,
    private readonly services: TickServices,
    private readonly notify: () => void,
    private readonly persister: Persister,
    private readonly logger: Logger = consoleLogger,
  ) {
    this.playerRepo = new PlayerRepository(runtime.clock.id, runtime.writeSet);
  }

  run(ticks: number): void {
    const startedAt = performance.now();
    for (let i = 1; i <= ticks; i++) {
      this.runOne(
        this.runtime.clock.lastTickAt + i * TICK_MS,
        this.runtime.clock.tick + i,
      );
    }
    this.runtime.clock.tick += ticks;
    this.runtime.clock.lastTickAt += ticks * TICK_MS;
    this.gameRepo.saveTick(this.runtime.clock, this.runtime.writeSet);
    for (const empire of this.runtime.empires.values()) {
      this.playerRepo.saveInfluence(empire);
      for (const colony of empire.colonyMap.values())
        this.services.industry.persistColony(colony);
      for (const station of empire.stationMap.values())
        this.services.station.persistStation(station);
      this.services.logistics.persistOutposts(empire);
    }
    this.notify();
    // Fin de lot de ticks : frontière de flush (chantier 20.2). Fire-and-forget — la
    // RAM fait déjà autorité, `notify()` est parti sans l'attendre ; le `Persister` se
    // sérialise et journalise lui-même ses échecs.
    void this.persister.flush();
    this.lastRunDurationMs = performance.now() - startedAt;
    this.lastRunTickCount = ticks;
    this.logger.info(
      `[tick] ${ticks} tick(s) en ${this.lastRunDurationMs.toFixed(1)}ms`,
    );
  }

  /** Une passe de tick : arrivées/recherche, monde partagé, routes/flottes/influence,
   *  économie/PNJ/objectifs/frontière (tick éco seulement), puis production des colonies. */
  private runOne(t: number, tickNumber: number): void {
    const { runtime, services } = this;
    const isEconomyTick = tickNumber % ECONOMY_TICK_TICKS === 0;

    // Étapes par empire (un seul instancié à ce stade — la boucle tourne une fois).
    for (const empire of runtime.empires.values()) {
      services.logistics.deliverTransfers(empire, t);
      services.logistics.resolveMissions(empire, t);
      services.industry.resolveResearch(empire, t);
    }
    // Portails et contrats : univers partagé, résolus une fois par tick.
    services.gateway.resolveGateways(t);
    services.contract.resolveContracts(t);
    // Objectifs éphémères : réactifs à tout changement (colonisation, claim…), pas
    // seulement au tick éco.
    services.objective.resolveObjectives(t);
    // Événements de monde : expiration à chaque tick, nouveau tirage au tick éco (avant
    // spawnPirates, pour qu'une vague pirate fraîchement déclenchée s'applique tout de suite).
    services.diplomacy.resolveWorldEvents(t);
    if (isEconomyTick) services.diplomacy.worldEventTick(tickNumber, t);
    for (const empire of runtime.empires.values()) {
      services.logistics.processRoutes(empire, t);
      services.logistics.outpostsTick(empire);
      services.fleetService.fleetsTick(empire, t);
    }
    // Apparition de repaires (PNJ partagés) : après les mouvements de flotte, avant
    // l'entretien d'influence — position historique (fin de `fleetsTick`), tick éco.
    if (isEconomyTick) {
      services.fleetService.spawnPirates(
        tickNumber,
        services.exploration.universeExplored(),
        (systemId) => services.exploration.claimOwner(systemId),
      );
    }
    for (const empire of runtime.empires.values())
      services.exploration.influenceTick(empire);
    // Marchés PNJ : univers partagé, une fois par tick éco.
    if (isEconomyTick) {
      services.market.economyTick(tickNumber);
      // Humeurs de faction (chantier 15) : après les marchés, avant les PNJ qui
      // tarifent leurs contrats sur les cours (et bientôt les humeurs) à jour.
      services.market.factionMoodTick(t, tickNumber);
      // Économie des empires PNJ (chantier 14) : après les marchés, pour tarifer
      // leurs contrats sur des cours à jour.
      for (const empire of runtime.empires.values())
        services.market.npcTick(empire);
      // Objectifs éphémères (chantier 17) : un nouveau tirage par cycle éco, pas par tick.
      services.objective.generateObjectives(tickNumber, t);
    }
    // Front de peuplement : une colonisation a pu entamer la frontière (chantier 9).
    if (isEconomyTick) services.exploration.ensureFrontier();
    for (const empire of runtime.empires.values()) {
      services.industry.colonyProductionTick(empire, t);
      services.station.stationProductionTick(empire, t);
    }
  }
}
