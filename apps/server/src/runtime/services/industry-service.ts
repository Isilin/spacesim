import {
  BLUEPRINT_BUY_MARKUP,
  BLUEPRINT_SELL_FRACTION,
  CLAIM_PRODUCTION_BONUS,
  applyColonyTick,
  applyLift,
  canResearch,
  computeEffects,
  costValue,
  enqueueBuilding,
  enqueueShip,
  enqueueShipFromStats,
  gatewayLinks,
  idleShips,
  jumpDistanceInUniverse,
  researchPath,
  resolveBlueprint,
  resolveQueue,
  resolveShips,
  validateBlueprint,
  type BalanceConstants,
  type Blueprint,
  type BuildingId,
  type ChassisDef,
  type Colony,
  type Fleet,
  type InstallationDef,
  type ModuleDef,
  type ResourceId,
  type ShipId,
  type TechDef,
  type TechId,
  type ZoneTypeDef,
} from "@spacesim/shared";
import { randomUUID } from "node:crypto";
import type { Empire } from "../../empire.js";
import {
  balanceFromContent,
  buildingDefsFromContent,
  chassisDefsFromContent,
  installationDefsFromContent,
  moduleDefsFromContent,
  shipDefsFromContent,
  techDefsFromContent,
  zoneTypeDefsFromContent,
} from "../content/content-service.js";
import type { GameRuntime } from "../game-runtime.js";
import type { Logger } from "../logger.js";
import { BlueprintRepository } from "../repositories/blueprint-repository.js";
import { ColonyRepository } from "../repositories/colony-repository.js";
import { PlayerRepository } from "../repositories/player-repository.js";

const MAX_BLUEPRINTS = 40;

/**
 * Industrie et recherche : bâtiments, chantier naval civil, plans de vaisseaux (chantier
 * 13) et arbre de recherche. `persistFleet` est injecté (pas un service `Fleet` entier)
 * parce que `buildBlueprint` a besoin d'écrire une flotte pour son domaine "flotte" —
 * seul point de contact avec un autre domaine.
 */
export class IndustryService {
  private readonly blueprintRepo: BlueprintRepository;
  private readonly colonyRepo: ColonyRepository;
  private readonly playerRepo: PlayerRepository;

  constructor(
    private readonly runtime: GameRuntime,
    private readonly notify: () => void,
    private readonly logger: Logger,
    private readonly persistFleet: (fleet: Fleet) => void,
  ) {
    this.blueprintRepo = new BlueprintRepository(
      runtime.clock.id,
      runtime.writeSet,
    );
    this.colonyRepo = new ColonyRepository(runtime.clock.id, runtime.writeSet);
    this.playerRepo = new PlayerRepository(runtime.clock.id, runtime.writeSet);
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

  /** Arbre de recherche (DB-backed, chantier 23.9) — remplace `TECHS` dans ce service. */
  private get techDefs(): Record<string, TechDef> {
    return techDefsFromContent(this.runtime.content.techs);
  }

  /** Châssis/modules (DB-backed, chantier 23.10) — remplace `CHASSIS`/`MODULES` ici. */
  private get chassisDefs(): Record<string, ChassisDef> {
    return chassisDefsFromContent(this.runtime.content.chassis);
  }

  private get moduleDefs(): Record<string, ModuleDef> {
    return moduleDefsFromContent(this.runtime.content.modules);
  }

  /** Types de zone/installations de station orbitale (DB-backed, chantier 24). */
  private get zoneTypeDefs(): Record<string, ZoneTypeDef> {
    return zoneTypeDefsFromContent(this.runtime.content.zoneTypes);
  }

  private get installationDefs(): Record<string, InstallationDef> {
    return installationDefsFromContent(this.runtime.content.installations);
  }

  /** Effets d'empire recalculés depuis le contenu DB-backed (techs, châssis, modules,
   *  types de zone et installations de station orbitale). */
  private empireEffects(
    researched: readonly string[],
  ): ReturnType<typeof computeEffects> {
    return computeEffects(
      researched,
      this.techDefs,
      this.chassisDefs,
      this.moduleDefs,
      this.zoneTypeDefs,
      this.installationDefs,
    );
  }

  // ── Bâtiments & chantier civil ───────────────────────────────────────────

  build(
    empire: Empire,
    colonyId: string,
    buildingId: BuildingId,
  ): string | null {
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    const planet = this.runtime.planetsById.get(colony.planetId);
    if (!planet) return "Planète inconnue";
    const result = enqueueBuilding(
      colony,
      planet,
      buildingId,
      Date.now(),
      empire.effects,
      buildingDefsFromContent(this.runtime.content.buildings),
      this.balance,
    );
    if (!result.ok) return result.reason;
    empire.colonyMap.set(colonyId, result.colony);
    this.persistColony(result.colony);
    this.notify();
    return null;
  }

  buildShip(empire: Empire, colonyId: string, shipId: ShipId): string | null {
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    const result = enqueueShip(
      colony,
      shipId,
      Date.now(),
      empire.researched as TechId[],
      empire.effects,
      shipDefsFromContent(this.runtime.content.ships),
    );
    if (!result.ok) return result.reason;
    empire.colonyMap.set(colonyId, result.colony);
    this.persistColony(result.colony);
    this.notify();
    return null;
  }

  // ── Conception de vaisseaux (chantier 13) ────────────────────────────────

  async loadBlueprints(): Promise<void> {
    for (const bp of await this.blueprintRepo.loadAll()) {
      const empire = this.runtime.empires.get(bp.ownerId);
      if (!empire) continue;
      empire.blueprintMap.set(bp.id, bp);
    }
  }

  private persistBlueprint(bp: Blueprint): void {
    this.blueprintRepo.save(bp);
  }

  /** Amorce un empire sans plan avec les designs de départ (presets constructibles). */
  seedStarterBlueprints(empire: Empire): void {
    if (empire.blueprintMap.size > 0) return;
    for (const preset of Object.values(this.runtime.content.presets)) {
      if (!preset.starter) continue;
      const bp: Blueprint = {
        id: randomUUID(),
        ownerId: empire.id,
        name: preset.nameFr,
        chassisId: preset.chassisId,
        modules: [...preset.modules],
        createdAt: Date.now(),
      };
      empire.blueprintMap.set(bp.id, bp);
      this.persistBlueprint(bp);
    }
  }

  seedStarterBlueprintsForAll(): void {
    for (const empire of this.runtime.empires.values())
      this.seedStarterBlueprints(empire);
  }

  createBlueprint(
    empire: Empire,
    name: string,
    chassisId: string,
    modules: string[],
  ): string | null {
    if (empire.blueprintMap.size >= MAX_BLUEPRINTS)
      return "Trop de plans enregistrés";
    const problems = validateBlueprint(
      { chassisId, modules },
      empire.effects,
      this.chassisDefs,
      this.moduleDefs,
    );
    if (problems.length > 0) return problems[0]!;
    const bp: Blueprint = {
      id: randomUUID(),
      ownerId: empire.id,
      name: name.trim().slice(0, 40) || "Plan sans nom",
      chassisId,
      modules: [...modules],
      createdAt: Date.now(),
    };
    empire.blueprintMap.set(bp.id, bp);
    this.persistBlueprint(bp);
    this.notify();
    return null;
  }

  updateBlueprint(
    empire: Empire,
    blueprintId: string,
    name: string,
    chassisId: string,
    modules: string[],
  ): string | null {
    const bp = empire.blueprintMap.get(blueprintId);
    if (!bp) return "Plan inconnu";
    const problems = validateBlueprint(
      { chassisId, modules },
      empire.effects,
      this.chassisDefs,
      this.moduleDefs,
    );
    if (problems.length > 0) return problems[0]!;
    const next: Blueprint = {
      ...bp,
      name: name.trim().slice(0, 40) || bp.name,
      chassisId,
      modules: [...modules],
    };
    empire.blueprintMap.set(blueprintId, next);
    this.persistBlueprint(next);
    this.notify();
    return null;
  }

  deleteBlueprint(empire: Empire, blueprintId: string): string | null {
    if (!empire.blueprintMap.has(blueprintId)) return "Plan inconnu";
    empire.blueprintMap.delete(blueprintId);
    this.blueprintRepo.remove(blueprintId);
    this.notify();
    return null;
  }

  buildBlueprint(
    empire: Empire,
    blueprintId: string,
    colonyId?: string,
    fleetId?: string,
  ): string | null {
    const bp = empire.blueprintMap.get(blueprintId);
    if (!bp) return "Plan inconnu";
    const problems = validateBlueprint(
      bp,
      empire.effects,
      this.chassisDefs,
      this.moduleDefs,
    );
    if (problems.length > 0) return problems[0]!;
    const stats = resolveBlueprint(bp, this.chassisDefs, this.moduleDefs);

    if (stats.domain === "colony") {
      const colony = colonyId ? empire.colonyMap.get(colonyId) : undefined;
      if (!colony) return "Colonie inconnue";
      const result = enqueueShipFromStats(
        colony,
        bp.id,
        stats,
        Date.now(),
        empire.effects,
      );
      if (!result.ok) return result.reason;
      empire.colonyMap.set(colony.id, result.colony);
      this.persistColony(result.colony);
      this.notify();
      return null;
    }

    // Domaine flotte : produit au chantier naval de la colonie de rattachement de la flotte.
    const fleet = fleetId ? empire.fleetMap.get(fleetId) : undefined;
    if (!fleet) return "Flotte inconnue";
    if (fleet.movement) return "Flotte en déplacement";
    const home = empire.colonyMap.get(fleet.homeColonyId);
    if (!home) return "Colonie de rattachement inconnue";
    if ((home.buildings.shipyard ?? 0) < 1) return "Chantier naval requis";
    if (fleet.queue.length >= 5) return "File de production pleine";
    const resources = { ...home.resources };
    for (const [res, amount] of Object.entries(stats.cost) as [
      ResourceId,
      number,
    ][]) {
      if ((resources[res] ?? 0) < amount)
        return `Ressources insuffisantes (${amount} ${res})`;
    }
    for (const [res, amount] of Object.entries(stats.cost) as [
      ResourceId,
      number,
    ][]) {
      resources[res] -= amount;
    }
    empire.colonyMap.set(home.id, { ...home, resources });
    this.persistColony(empire.colonyMap.get(home.id)!);
    const now = Date.now();
    const startedAt = Math.max(now, fleet.queue.at(-1)?.finishesAt ?? now);
    const buildMs = Math.round(
      stats.buildMs * empire.effects.shipBuildSpeedMult,
    );
    const next: Fleet = {
      ...fleet,
      queue: [
        ...fleet.queue,
        { warshipId: bp.id, startedAt, finishesAt: startedAt + buildMs },
      ],
    };
    empire.fleetMap.set(fleet.id, next);
    this.persistFleet(next);
    this.notify();
    return null;
  }

  /** Distance en sauts colonie → comptoir, -1 si inaccessible (aide au marché de plans). */
  private jumpsToTradingPost(colony: Colony, tradingPostId: string): number {
    const comptoir = this.runtime.tradingPostsById.get(tradingPostId);
    if (!comptoir) return -1;
    const fromPlanet = this.runtime.planetsById.get(colony.planetId);
    if (!fromPlanet) return -1;
    return jumpDistanceInUniverse(
      this.runtime.universe,
      fromPlanet.systemId,
      comptoir.systemId,
      this.portalLinks,
    );
  }

  buyBlueprintFromTradingPost(
    empire: Empire,
    colonyId: string,
    tradingPostId: string,
    presetId: string,
  ): string | null {
    if (empire.blueprintMap.size >= MAX_BLUEPRINTS)
      return "Trop de plans enregistrés";
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    const comptoir = this.runtime.tradingPostsById.get(tradingPostId);
    if (!comptoir) return "Comptoir inconnu";
    if (!empire.explored.has(comptoir.systemId))
      return "Comptoir non découvert";
    if (this.jumpsToTradingPost(colony, tradingPostId) < 0)
      return "Comptoir inaccessible";
    const preset = this.runtime.content.presets[presetId];
    if (!preset) return "Plan inconnu au catalogue";

    const price = Math.round(
      costValue(
        resolveBlueprint(preset, this.chassisDefs, this.moduleDefs).cost,
      ) * BLUEPRINT_BUY_MARKUP,
    );
    if (colony.resources.credits < price)
      return `Crédits insuffisants (${price})`;

    const bp: Blueprint = {
      id: randomUUID(),
      ownerId: empire.id,
      name: preset.nameFr,
      chassisId: preset.chassisId,
      modules: [...preset.modules],
      createdAt: Date.now(),
    };
    empire.blueprintMap.set(bp.id, bp);
    this.persistBlueprint(bp);
    empire.colonyMap.set(colony.id, {
      ...colony,
      resources: {
        ...colony.resources,
        credits: colony.resources.credits - price,
      },
    });
    this.persistColony(empire.colonyMap.get(colony.id)!);
    this.notify();
    return null;
  }

  sellBlueprint(
    empire: Empire,
    colonyId: string,
    tradingPostId: string,
    blueprintId: string,
  ): string | null {
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    if (this.jumpsToTradingPost(colony, tradingPostId) < 0)
      return "Comptoir inaccessible";
    const bp = empire.blueprintMap.get(blueprintId);
    if (!bp) return "Plan inconnu";

    const price = Math.round(
      costValue(resolveBlueprint(bp, this.chassisDefs, this.moduleDefs).cost) *
        BLUEPRINT_SELL_FRACTION,
    );
    empire.blueprintMap.delete(blueprintId);
    this.blueprintRepo.remove(blueprintId);
    empire.colonyMap.set(colony.id, {
      ...colony,
      resources: {
        ...colony.resources,
        credits: colony.resources.credits + price,
      },
    });
    this.persistColony(empire.colonyMap.get(colony.id)!);
    this.notify();
    return null;
  }

  sellShip(
    empire: Empire,
    colonyId: string,
    tradingPostId: string,
    shipId: string,
    countRaw: number,
  ): string | null {
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    if (this.jumpsToTradingPost(colony, tradingPostId) < 0)
      return "Comptoir inaccessible";
    const count = Math.floor(Number(countRaw));
    if (!Number.isFinite(count) || count <= 0) return "Quantité invalide";

    const idle = idleShips(colony, [...empire.routeMap.values()]);
    if ((idle[shipId] ?? 0) < count)
      return "Vaisseaux indisponibles (occupés ou insuffisants)";

    const legacyDef = shipDefsFromContent(this.runtime.content.ships)[shipId];
    const bp = empire.blueprintMap.get(shipId);
    const cost =
      legacyDef?.cost ??
      (bp
        ? resolveBlueprint(bp, this.chassisDefs, this.moduleDefs).cost
        : null);
    if (!cost) return "Vaisseau inconnu";

    const price = Math.round(costValue(cost) * BLUEPRINT_SELL_FRACTION) * count;
    const ships = {
      ...colony.ships,
      [shipId]: (colony.ships[shipId] ?? 0) - count,
    };
    empire.colonyMap.set(colony.id, {
      ...colony,
      ships,
      resources: {
        ...colony.resources,
        credits: colony.resources.credits + price,
      },
    });
    this.persistColony(empire.colonyMap.get(colony.id)!);
    this.notify();
    return null;
  }

  // ── Recherche (chantier 11) ──────────────────────────────────────────────

  startResearch(empire: Empire, techId: string): string | null {
    if (empire.research) return "Une recherche est déjà en cours";
    const tech = this.techDefs[techId];
    if (!tech) return "Technologie inconnue";
    if (!canResearch(tech.id, empire.researched, this.techDefs)) {
      return "Prérequis non satisfaits";
    }
    if (!this.beginResearch(empire, tech.id)) {
      const totalScience = [...empire.colonyMap.values()].reduce(
        (s, c) => s + c.resources.science,
        0,
      );
      return `Science insuffisante (${Math.floor(totalScience)}/${tech.cost})`;
    }
    this.notify();
    return null;
  }

  /**
   * Débite la science et démarre une recherche. Retourne false si la science manque —
   * la file (11.4) réessaiera au tick suivant plutôt que d'être vidée.
   */
  private beginResearch(
    empire: Empire,
    techId: string,
    now = Date.now(),
  ): boolean {
    const tech = this.techDefs[techId]!;
    const colonies = [...empire.colonyMap.values()];
    const totalScience = colonies.reduce((s, c) => s + c.resources.science, 0);
    if (totalScience < tech.cost) return false;

    // Paiement réparti : on ponctionne les colonies dans l'ordre jusqu'à couvrir le coût.
    let remaining = tech.cost;
    for (const colony of colonies) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, colony.resources.science);
      if (take <= 0) continue;
      remaining -= take;
      const updated = {
        ...colony,
        resources: {
          ...colony.resources,
          science: colony.resources.science - take,
        },
      };
      empire.colonyMap.set(colony.id, updated);
      this.persistColony(updated);
    }

    empire.research = {
      techId: tech.id,
      startedAt: now,
      finishesAt: now + tech.durationMs,
    };
    this.persistResearch(empire);
    return true;
  }

  queueResearch(empire: Empire, techId: string): string | null {
    const tech = this.techDefs[techId];
    if (!tech) return "Technologie inconnue";
    const path = researchPath(tech.id, empire.researched, this.techDefs);
    if (path.length === 0) return "Technologie déjà acquise";
    // La recherche en cours n'est pas interrompue : elle sort simplement de la file.
    empire.researchQueue = path.filter((id) => id !== empire.research?.techId);
    this.advanceResearchQueue(empire);
    this.persistResearch(empire);
    this.notify();
    return null;
  }

  clearResearchQueue(empire: Empire): string | null {
    empire.researchQueue = [];
    this.persistResearch(empire);
    this.notify();
    return null;
  }

  /**
   * Lance la première tech de la file dont les prérequis sont satisfaits. Appelée à la
   * planification et après chaque recherche terminée : la chaîne s'enchaîne seule.
   */
  private advanceResearchQueue(empire: Empire, now = Date.now()): void {
    if (empire.research || empire.researchQueue.length === 0) return;
    // Les techs déjà acquises entre-temps (autre chemin) sont retirées silencieusement.
    empire.researchQueue = empire.researchQueue.filter(
      (id) => !empire.researched.includes(id),
    );
    const next = empire.researchQueue[0];
    if (!next) return;
    if (!canResearch(next, empire.researched, this.techDefs)) return;
    if (this.beginResearch(empire, next, now)) {
      empire.researchQueue = empire.researchQueue.slice(1);
    }
  }

  resolveResearch(empire: Empire, t: number): void {
    const finished =
      empire.research && empire.research.finishesAt <= t
        ? empire.research
        : null;
    if (finished) {
      empire.researched = [...empire.researched, finished.techId];
      empire.research = null;
      empire.effects = this.empireEffects(empire.researched);
      this.logger.info(`[game] recherche terminée : ${finished.techId}`);
    }
    // Enchaînement de la file, y compris quand la science manquait au tick précédent.
    const beforeQueue = empire.research;
    this.advanceResearchQueue(empire, t);
    if (finished || beforeQueue !== empire.research)
      this.persistResearch(empire);
  }

  persistResearch(empire: Empire): void {
    this.playerRepo.saveResearch(empire);
  }

  // ── Production de colonie (tick) ─────────────────────────────────────────

  colonyProductionTick(empire: Empire, t: number): void {
    for (const [id, colony] of empire.colonyMap) {
      const planet = this.runtime.planetsById.get(colony.planetId);
      if (!planet) continue;
      // Bonus territorial : système revendiqué = production boostée.
      const claimed = empire.claimedSystemIds.includes(planet.systemId);
      const effects = claimed
        ? {
            ...empire.effects,
            outputMultAll:
              empire.effects.outputMultAll * CLAIM_PRODUCTION_BONUS,
          }
        : empire.effects;
      // L'ascenseur tourne après la production : ce qui vient d'être produit peut monter.
      const balance = this.balance;
      empire.colonyMap.set(
        id,
        applyLift(
          applyColonyTick(
            resolveShips(resolveQueue(colony, t), t),
            planet,
            effects,
            buildingDefsFromContent(this.runtime.content.buildings),
            balance,
          ),
          effects,
          balance,
        ),
      );
    }
  }

  persistColony(colony: Colony): void {
    this.colonyRepo.save(colony);
  }

  /**
   * Outil de dev uniquement : décale les timers de recherche et de production/
   * construction (dev-fastforward). Ne persiste pas les colonies, à l'identique du
   * comportement historique de `devFastForward` (seule la recherche l'était).
   */
  shiftTime(empire: Empire, deltaMs: number): void {
    if (empire.research) {
      empire.research = {
        ...empire.research,
        startedAt: empire.research.startedAt - deltaMs,
        finishesAt: empire.research.finishesAt - deltaMs,
      };
    }
    for (const [id, colony] of empire.colonyMap) {
      if (colony.queue.length === 0 && colony.shipQueue.length === 0) continue;
      empire.colonyMap.set(id, {
        ...colony,
        queue: colony.queue.map((q) => ({
          ...q,
          startedAt: q.startedAt - deltaMs,
          finishesAt: q.finishesAt - deltaMs,
        })),
        shipQueue: colony.shipQueue.map((q) => ({
          ...q,
          startedAt: q.startedAt - deltaMs,
          finishesAt: q.finishesAt - deltaMs,
        })),
      });
    }
  }
}
