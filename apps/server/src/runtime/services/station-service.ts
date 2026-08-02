import {
  applyStationTick,
  canFoundStation,
  enqueueInstallation,
  enqueueZone,
  gatewayLinks,
  jumpDistanceInUniverse,
  resolveInstallQueue,
  resolveZoneQueue,
  stationShipDurationMs,
  STATION_SHIP_COST,
  type BalanceConstants,
  type Colony,
  type InstallationDef,
  type Mission,
  type ResourceId,
  type Station,
  type ZoneTypeDef,
} from "@spacesim/shared";
import type { Empire } from "../../empire.js";
import {
  balanceFromContent,
  installationDefsFromContent,
  zoneTypeDefsFromContent,
} from "../content/content-service.js";
import type { GameRuntime } from "../game-runtime.js";
import type { Logger } from "../logger.js";
import { StationRepository } from "../repositories/station-repository.js";

/**
 * Stations orbitales (chantier 24) : fondation (mission avec trajet réel, sur le
 * modèle de `ExplorationService.colonize`), construction de zones/installations et
 * tick de production. Service dédié, sur le modèle de `GatewayService` — une station
 * est une entité de premier rang distincte d'une colonie, pas une extension
 * d'`IndustryService`. `persistColony`/`insertMission` restent la propriété
 * d'Industry/Logistics — injectés ici comme callbacks étroits, à l'identique du
 * patron déjà en place pour les autres services.
 */
export class StationService {
  private readonly repo: StationRepository;

  constructor(
    private readonly runtime: GameRuntime,
    private readonly notify: () => void,
    private readonly logger: Logger,
    private readonly persistColony: (colony: Colony) => void,
    private readonly insertMission: (
      empire: Empire,
      kind: Mission["kind"],
      fromColonyId: string,
      targetId: string,
      durationMs: number,
    ) => void,
  ) {
    this.repo = new StationRepository(runtime.clock.id, runtime.writeSet);
  }

  private get portalLinks(): [string, string][] {
    return gatewayLinks(this.runtime.universe, [
      ...this.runtime.gatewayMap.values(),
    ]);
  }

  /** Scalaires d'équilibrage (DB-backed, chantier 23.8). */
  private get balance(): BalanceConstants {
    return balanceFromContent(this.runtime.content.constants);
  }

  /** Types de zone/installations (DB-backed, chantier 24). */
  private get zoneTypeDefs(): Record<string, ZoneTypeDef> {
    return zoneTypeDefsFromContent(this.runtime.content.zoneTypes);
  }

  private get installationDefs(): Record<string, InstallationDef> {
    return installationDefsFromContent(this.runtime.content.installations);
  }

  /**
   * Action joueur : envoyer un vaisseau de construction fonder une station en orbite
   * d'un corps. Sur le modèle exact de `colonize` (coût débité + mission avec trajet
   * réel), sans exclusion géante gazeuse (une station est en orbite, pas en surface)
   * et sans coût d'influence (une station ne revendique rien, contrairement à
   * `colonize` — ça reste le rôle des claims). Ne vérifie que les stations de CET
   * empire au corps visé (même choix que `colonize`, qui n'empêche pas deux empires
   * de coloniser la même planète).
   */
  foundStation(
    empire: Empire,
    colonyId: string,
    bodyId: string,
  ): string | null {
    if (!canFoundStation(empire.effects)) {
      return "Aucun type de zone débloqué — technologie requise non recherchée";
    }
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    const target = this.runtime.planetsById.get(bodyId);
    if (!target) return "Corps inconnu";
    if (!empire.explored.has(target.systemId)) return "Système non exploré";
    if ([...empire.stationMap.values()].some((s) => s.bodyId === bodyId)) {
      return "Une station orbite déjà ce corps";
    }
    if (
      [...empire.missionMap.values()].some(
        (m) => m.kind === "found_station" && m.targetId === bodyId,
      )
    ) {
      return "Un vaisseau de construction est déjà en route";
    }
    const fromPlanet = this.runtime.planetsById.get(colony.planetId);
    if (!fromPlanet) return "Planète inconnue";
    const jumps = jumpDistanceInUniverse(
      this.runtime.universe,
      fromPlanet.systemId,
      target.systemId,
      this.portalLinks,
    );
    if (jumps < 0) return "Système inaccessible";

    const resources = { ...colony.resources };
    for (const [res, amount] of Object.entries(STATION_SHIP_COST) as [
      ResourceId,
      number,
    ][]) {
      if (resources[res] < amount) {
        return `Ressources insuffisantes pour le vaisseau de construction (${amount} ${res})`;
      }
    }
    for (const [res, amount] of Object.entries(STATION_SHIP_COST) as [
      ResourceId,
      number,
    ][]) {
      resources[res] -= amount;
    }
    empire.colonyMap.set(colony.id, { ...colony, resources });
    this.persistColony(empire.colonyMap.get(colony.id)!);
    this.insertMission(
      empire,
      "found_station",
      colonyId,
      bodyId,
      stationShipDurationMs(jumps, this.balance),
    );
    this.notify();
    return null;
  }

  /** Action joueur : construire une zone sur une station possédée. */
  buildZone(
    empire: Empire,
    stationId: string,
    zoneTypeId: string,
  ): string | null {
    const station = empire.stationMap.get(stationId);
    if (!station) return "Station inconnue";
    const result = enqueueZone(
      station,
      zoneTypeId,
      Date.now(),
      empire.effects,
      this.zoneTypeDefs,
      this.balance,
    );
    if (!result.ok) return result.reason;
    empire.stationMap.set(stationId, result.station);
    this.persistStation(result.station);
    this.notify();
    return null;
  }

  /** Action joueur : construire une installation sur une station possédée. */
  buildInstallation(
    empire: Empire,
    stationId: string,
    installationId: string,
  ): string | null {
    const station = empire.stationMap.get(stationId);
    if (!station) return "Station inconnue";
    const result = enqueueInstallation(
      station,
      installationId,
      Date.now(),
      empire.effects,
      this.installationDefs,
      this.balance,
    );
    if (!result.ok) return result.reason;
    empire.stationMap.set(stationId, result.station);
    this.persistStation(result.station);
    this.notify();
    return null;
  }

  /** Insère une station nouvellement fondée (appelé à la résolution de la mission de
   *  fondation, chantier 24.5 — `LogisticsService.resolveMissions`). */
  insertStation(empire: Empire, station: Station): void {
    empire.stationMap.set(station.id, station);
    this.repo.insert(station);
  }

  async loadStations(): Promise<void> {
    for (const station of await this.repo.loadAll()) {
      const empire = this.runtime.empires.get(station.ownerId);
      if (!empire) continue;
      empire.stationMap.set(station.id, station);
    }
  }

  persistStation(station: Station): void {
    this.repo.save(station);
  }

  /** Production/consommation par tick de chaque station possédée — après la production
   *  des colonies (même position relative que l'ascenseur orbital), sans bonus de
   *  territoire revendiqué : une station n'occupe pas de système au sens des claims. */
  stationProductionTick(empire: Empire, t: number): void {
    for (const [id, station] of empire.stationMap) {
      empire.stationMap.set(
        id,
        applyStationTick(
          resolveInstallQueue(resolveZoneQueue(station, t), t),
          this.installationDefs,
        ),
      );
    }
  }

  /** Outil de dev uniquement : décale les timers de construction (dev-fastforward). */
  shiftTime(empire: Empire, deltaMs: number): void {
    for (const [id, station] of empire.stationMap) {
      if (station.zoneQueue.length === 0 && station.installQueue.length === 0)
        continue;
      empire.stationMap.set(id, {
        ...station,
        zoneQueue: station.zoneQueue.map((q) => ({
          ...q,
          startedAt: q.startedAt - deltaMs,
          finishesAt: q.finishesAt - deltaMs,
        })),
        installQueue: station.installQueue.map((q) => ({
          ...q,
          startedAt: q.startedAt - deltaMs,
          finishesAt: q.finishesAt - deltaMs,
        })),
      });
    }
  }
}
