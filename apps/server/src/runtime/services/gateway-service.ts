import {
  GATEWAY_COST,
  gatewayLinks,
  galaxyParentIndex,
  gatewayRemaining,
  jumpDistanceInUniverse,
  transferCostCredits,
  transferDurationMs,
  type BalanceConstants,
  type Colony,
  type Gateway,
  type Mission,
  type ResourceId,
  type ShipId,
} from "@spacesim/shared";
import type { Empire } from "../../empire.js";
import { balanceFromContent } from "../content/content-service.js";
import type { GameRuntime } from "../game-runtime.js";
import type { Logger } from "../logger.js";
import { GatewayRepository } from "../repositories/gateway-repository.js";

/**
 * Portails inter-galactiques (chantier 5/9) : chantiers de portail, contribution en
 * ressources, activation. `reserveShip`/`insertMission` restent la propriété de
 * Logistics (convois et missions) — injectés ici comme callbacks étroits, à
 * l'identique du patron déjà en place pour les autres services.
 */
export class GatewayService {
  private readonly repo: GatewayRepository;

  constructor(
    private readonly runtime: GameRuntime,
    private readonly notify: () => void,
    private readonly logger: Logger,
    private readonly persistColony: (colony: Colony) => void,
    private readonly reserveShip: (
      empire: Empire,
      colony: Colony,
      busyUntil: number,
    ) => { colony: Colony; shipId: ShipId; capacity: number } | null,
    private readonly insertMission: (
      empire: Empire,
      kind: Mission["kind"],
      fromColonyId: string,
      targetId: string,
      durationMs: number,
      extras?: Pick<Mission, "cargo" | "budget" | "buyResource" | "capacity" | "contractId">,
    ) => void,
  ) {
    this.repo = new GatewayRepository(runtime.clock.id, runtime.writeSet);
  }

  private get portalLinks(): [string, string][] {
    return gatewayLinks(this.runtime.universe, [...this.runtime.gatewayMap.values()]);
  }

  /** Scalaires d'équilibrage (DB-backed, chantier 23.8). */
  private get balance(): BalanceConstants {
    return balanceFromContent(this.runtime.content.constants);
  }

  /** Action joueur : livrer des ressources au chantier d'un portail. */
  contributeGateway(
    empire: Empire,
    colonyId: string,
    galaxyId: string,
    wanted: Partial<Record<ResourceId, number>>,
  ): string | null {
    if (!empire.researched.includes("gateway_engineering")) {
      return "Technologie « Ingénierie des portails » requise";
    }
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    const gateway = this.runtime.gatewayMap.get(galaxyId);
    if (!gateway) return "Aucun chantier de portail vers cette galaxie";
    if (gateway.active) return "Portail déjà actif";
    if (gateway.activatesAt) return "Chantier final en cours";

    const remaining = gatewayRemaining(gateway);
    const cargo: Partial<Record<ResourceId, number>> = {};
    for (const [res, raw] of Object.entries(wanted) as [ResourceId, number][]) {
      const amount = Math.floor(Number(raw));
      if (!Number.isFinite(amount) || amount <= 0) continue;
      if (!(res in GATEWAY_COST)) return `Le chantier ne demande pas de ${res}`;
      cargo[res] = Math.min(amount, remaining[res] ?? 0);
    }
    if (Object.values(cargo).every((n) => !n)) return "Cargaison vide (ou déjà couverte)";

    const fromPlanet = this.runtime.planetsById.get(colony.planetId);
    if (!fromPlanet) return "Planète inconnue";
    // Le chantier se mène depuis l'ancrage de la galaxie PARENTE (le versant proche du
    // trou de ver) : on ne peut donc financer un portail que si l'on atteint déjà sa
    // voisine — l'expansion se fait de proche en proche.
    const childIndex = this.runtime.universe.galaxies.findIndex((g) => g.id === galaxyId);
    const parentIndex = galaxyParentIndex(this.runtime.universe, childIndex);
    const anchorId =
      parentIndex === null
        ? this.runtime.universe.galaxies[0]!.anchorSystemId
        : this.runtime.universe.galaxies[parentIndex]!.anchorSystemId;
    const jumps = jumpDistanceInUniverse(
      this.runtime.universe,
      fromPlanet.systemId,
      anchorId,
      this.portalLinks,
    );
    if (jumps < 0) return "Galaxie voisine encore inaccessible";
    const balance = this.balance;
    const fee = transferCostCredits(jumps, balance);

    const resources = { ...colony.resources };
    if (resources.credits < fee + (cargo.credits ?? 0)) {
      return `Crédits insuffisants (cargaison + frais ${fee})`;
    }
    for (const [res, amount] of Object.entries(cargo) as [ResourceId, number][]) {
      if (resources[res] < amount) return `Stock insuffisant : ${res}`;
    }

    const duration = transferDurationMs(jumps, balance) * empire.effects.transferSpeedMult;
    const reserved = this.reserveShip(empire, colony, Date.now() + 2 * duration);
    if (!reserved) return "Aucun cargo disponible";
    const physical = Object.entries(cargo)
      .filter(([res]) => res !== "credits")
      .reduce((s, [, n]) => s + (n ?? 0), 0);
    if (physical > reserved.capacity) {
      return `Cargaison trop lourde (soute : ${reserved.capacity})`;
    }

    resources.credits -= fee;
    for (const [res, amount] of Object.entries(cargo) as [ResourceId, number][]) {
      resources[res] -= amount;
    }
    empire.colonyMap.set(colony.id, { ...reserved.colony, resources });
    this.persistColony(empire.colonyMap.get(colony.id)!);
    this.insertMission(empire, "contribute_gateway", colonyId, galaxyId, duration, { cargo });
    this.notify();
    return null;
  }

  /**
   * Ouvre un chantier de portail pour chaque galaxie lointaine qui n'en a pas encore.
   * Idempotent : rejoué après chaque extension de l'univers (chantier 9).
   */
  initGateways(): void {
    for (const galaxy of this.runtime.universe.galaxies.slice(1)) {
      if (this.runtime.gatewayMap.has(galaxy.id)) continue;
      const gateway: Gateway = {
        galaxyId: galaxy.id,
        progress: {},
        activatesAt: null,
        active: false,
      };
      this.runtime.gatewayMap.set(galaxy.id, gateway);
      this.repo.insert(gateway);
    }
  }

  async loadGateways(): Promise<void> {
    for (const gateway of await this.repo.loadAll()) {
      this.runtime.gatewayMap.set(gateway.galaxyId, gateway);
    }
  }

  persistGateway(gateway: Gateway): void {
    this.repo.save(gateway);
  }

  /** Active les portails dont le chantier final est terminé. */
  resolveGateways(t: number): void {
    for (const [id, gateway] of this.runtime.gatewayMap) {
      if (gateway.active || !gateway.activatesAt || gateway.activatesAt > t) continue;
      this.runtime.gatewayMap.set(id, { ...gateway, active: true });
      this.persistGateway(this.runtime.gatewayMap.get(id)!);
      this.logger.info(`[game] portail actif vers ${id}`);
    }
  }

  /** Outil de dev uniquement : décale l'échéance du chantier final (dev-fastforward). */
  shiftTime(deltaMs: number): void {
    for (const [id, gateway] of this.runtime.gatewayMap) {
      if (gateway.activatesAt === null) continue;
      this.runtime.gatewayMap.set(id, { ...gateway, activatesAt: gateway.activatesAt - deltaMs });
      this.persistGateway(this.runtime.gatewayMap.get(id)!);
    }
  }
}
