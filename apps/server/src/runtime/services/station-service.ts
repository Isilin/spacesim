import {
  applyStationTick,
  enqueueInstallation,
  enqueueZone,
  resolveInstallQueue,
  resolveZoneQueue,
  type BalanceConstants,
  type InstallationDef,
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
 * Stations orbitales (chantier 24) : construction de zones/installations et tick de
 * production. Service dédié, sur le modèle de `GatewayService` — une station est une
 * entité de premier rang distincte d'une colonie, pas une extension d'`IndustryService`.
 * La fondation (`foundStation`, mission avec trajet réel) arrive au chantier 24.5, une
 * fois le mécanisme de mission étendu — ce service n'a donc pas encore besoin des
 * callbacks `insertMission`/`reserveShip` de `LogisticsService`.
 */
export class StationService {
  private readonly repo: StationRepository;

  constructor(
    private readonly runtime: GameRuntime,
    private readonly notify: () => void,
    private readonly logger: Logger,
  ) {
    this.repo = new StationRepository(runtime.clock.id, runtime.writeSet);
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
