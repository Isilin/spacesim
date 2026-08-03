import {
  createRng,
  FACTION_MOOD_DURATION_MS,
  GATEWAY_BUILD_MS,
  gatewayCost,
  gatewayCovered,
  pirateBounty,
  pirateComposition,
  pirateDirectives,
  WORLD_EVENT_DURATION_MS,
  type CombatPhase,
  type FactionState,
  type Fleet,
  type Gateway,
  type PirateLair,
  type ResourceId,
  type WorldEventKind,
} from "@spacesim/shared";
import { randomUUID } from "node:crypto";
import type { Empire } from "../../empire.js";
import type { GameRuntime } from "../game-runtime.js";
import type { Logger } from "../logger.js";
import type { BootstrapService } from "./bootstrap-service.js";
import type { DiplomacyService } from "./diplomacy-service.js";
import type { ExplorationService } from "./exploration-service.js";
import type { FleetService } from "./fleet-service.js";
import type { GatewayService } from "./gateway-service.js";
import type { MarketService } from "./market-service.js";

/** Directives par défaut d'une flotte neuve (armée par un outil de dev). */
const DEFAULT_DIRECTIVES: Record<CombatPhase, string> = {
  long: "focus_fire",
  medium: "focus_fire",
  short: "focus_fire",
};

/** Les services traversés par les outils de dev — pas de domaine propre, un peu de tout. */
export interface DevServices {
  gateway: GatewayService;
  diplomacy: DiplomacyService;
  market: MarketService;
  bootstrap: BootstrapService;
  exploration: ExplorationService;
  fleetService: FleetService;
}

/**
 * Outils de dev uniquement (jamais en production, voir `http/routes/dev.ts`) : ils ne
 * forment pas un domaine de simulation propre — chacun triche directement dans un
 * domaine différent (portails, pirates, factions, événements de monde, empires,
 * flottes) pour accélérer les tests manuels. D'où l'injection de plusieurs services à
 * la fois plutôt que des callbacks étroits (même patron que `TickServices`).
 */
export class DevService {
  constructor(
    private readonly runtime: GameRuntime,
    private readonly notify: () => void,
    private readonly logger: Logger,
    private readonly services: DevServices,
  ) {}

  /**
   * Finance presque tout un portail (il reste `leave` métaux à livrer) pour tester la
   * dernière contribution et l'activation.
   */
  devFundGateway(galaxyId: string, leave = 50): void {
    const gateway = this.runtime.gatewayMap.get(galaxyId);
    if (!gateway || gateway.active) return;
    const progress: Partial<Record<ResourceId, number>> = {
      ...gatewayCost(galaxyId),
    };
    progress.metals = Math.max(0, (progress.metals ?? 0) - leave);
    let next: Gateway = { ...gateway, progress };
    // Coût entièrement couvert (`leave` = 0) : on lance le chantier final tout de suite,
    // pour qu'un `/dev/fastforward` suffise à ouvrir le portail bout en bout.
    if (gatewayCovered(next) && !next.activatesAt) {
      next = { ...next, activatesAt: Date.now() + GATEWAY_BUILD_MS };
    }
    this.runtime.gatewayMap.set(galaxyId, next);
    this.services.gateway.persistGateway(next);
    this.notify();
  }

  /** Force l'humeur d'une faction (chantier 15). */
  devSetFactionMood(
    factionId: string,
    mood: FactionState["mood"],
    durationMs = FACTION_MOOD_DURATION_MS,
  ): boolean {
    return this.services.diplomacy.devSetFactionMood(
      factionId,
      mood,
      durationMs,
      (fid) =>
        this.services.market.factionPostShortageContract(
          fid,
          createRng(`dev-shortage-${fid}-${Date.now()}`),
        ),
    );
  }

  /**
   * Déclenche un événement de monde (chantier 17). `target` est un id de galaxie
   * (economic_crisis/gold_rush/pirate_surge) ou de faction (faction_boom) ; laissé
   * vide, le premier de l'univers/des factions est pris.
   */
  devTriggerWorldEvent(
    kind: WorldEventKind,
    target = "",
    durationMs = WORLD_EVENT_DURATION_MS,
  ): string | null {
    return this.services.diplomacy.devTriggerWorldEvent(
      kind,
      target,
      durationMs,
    );
  }

  /** Fait apparaître un repaire pirate dans un système. */
  devSpawnPirate(systemId: string, threat = 2): void {
    // Sans système précisé : celui de la première colonie (pratique pour tester).
    if (!systemId) {
      const home = [...this.runtime.defaultEmpire.colonyMap.values()][0];
      const sys = home
        ? this.runtime.planetsById.get(home.planetId)?.systemId
        : undefined;
      if (!sys) return;
      systemId = sys;
    }
    const rng = createRng(`dev-pirate-${systemId}-${Date.now()}`);
    const ships = pirateComposition(rng, threat);
    const lair: PirateLair = {
      id: randomUUID(),
      systemId,
      ships,
      directives: pirateDirectives(rng),
      bounty: pirateBounty(ships),
    };
    this.runtime.lairMap.set(lair.id, lair);
    this.services.fleetService.persistLair(lair);
    this.notify();
  }

  /** Instancie un empire supplémentaire. Retourne son id. */
  devSpawnEmpire(name?: string): string | null {
    return this.services.bootstrap.devSpawnEmpire(name);
  }

  /** Instancie un empire PNJ (chantier 14). Retourne son id. */
  devSpawnNpcEmpire(name?: string): string | null {
    return this.services.bootstrap.devSpawnNpcEmpire(name);
  }

  /** Empire par son id. */
  empireById(id: string): Empire | null {
    return this.services.bootstrap.empireById(id);
  }

  /** Empire par défaut (`/dev/armfleet` sans `empireId`). */
  get defaultEmpireForDev(): Empire {
    return this.runtime.defaultEmpire;
  }

  /** Résumé par empire (état en mémoire) pour l'observation. */
  devEmpireSummaries(): unknown {
    return this.services.bootstrap.devEmpireSummaries();
  }

  /** Injecte des ressources pour tester sans attendre. */
  devGrant(resources: Partial<Record<ResourceId, number>>): void {
    this.services.bootstrap.devGrant(resources);
  }

  /** Arme une flotte d'un empire dans un système (tests PvP). */
  devArmFleet(
    empire: Empire,
    systemId: string,
    ships: Partial<Record<string, number>>,
  ): string {
    const home = [...empire.colonyMap.values()][0];
    const fleet: Fleet = {
      id: randomUUID(),
      ownerId: empire.id,
      name: "Escadre",
      systemId,
      homeColonyId: home?.id ?? "",
      ships,
      directives: { ...DEFAULT_DIRECTIVES },
      queue: [],
      movement: null,
    };
    empire.fleetMap.set(fleet.id, fleet);
    this.services.exploration.markExplored(empire, systemId);
    this.services.fleetService.persistFleet(fleet);
    this.notify();
    return fleet.id;
  }
}
