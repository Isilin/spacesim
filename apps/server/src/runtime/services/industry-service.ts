import {
  BLUEPRINT_BUY_MARKUP,
  BLUEPRINT_SELL_FRACTION,
  CLAIM_PRODUCTION_BONUS,
  SHIPS,
  STARTER_PRESET_IDS,
  TECHS,
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
  presetById,
  researchPath,
  resolveBlueprint,
  resolveQueue,
  resolveShips,
  validateBlueprint,
  type Blueprint,
  type BuildingId,
  type Colony,
  type Fleet,
  type LegacyShipId,
  type ResourceId,
  type ShipId,
  type TechId,
} from "@spacesim/shared";
import { randomUUID } from "node:crypto";
import type { Empire } from "../../empire.js";
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
    this.blueprintRepo = new BlueprintRepository(runtime.clock.id);
    this.colonyRepo = new ColonyRepository(runtime.clock.id);
    this.playerRepo = new PlayerRepository(runtime.clock.id);
  }

  private get portalLinks(): [string, string][] {
    return gatewayLinks(this.runtime.universe, [...this.runtime.gatewayMap.values()]);
  }

  // ── Bâtiments & chantier civil ───────────────────────────────────────────

  build(empire: Empire, colonyId: string, buildingId: BuildingId): string | null {
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    const planet = this.runtime.planetsById.get(colony.planetId);
    if (!planet) return "Planète inconnue";
    const result = enqueueBuilding(colony, planet, buildingId, Date.now(), empire.effects);
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

  private persistBlueprint(bp: Blueprint, insert = false): void {
    this.blueprintRepo.save(bp, insert);
  }

  /** Amorce un empire sans plan avec les designs de départ (presets constructibles). */
  seedStarterBlueprints(empire: Empire): void {
    if (empire.blueprintMap.size > 0) return;
    for (const presetId of STARTER_PRESET_IDS) {
      const preset = presetById(presetId);
      if (!preset) continue;
      const bp: Blueprint = {
        id: randomUUID(),
        ownerId: empire.id,
        name: preset.name,
        chassisId: preset.chassisId,
        modules: [...preset.modules],
        createdAt: Date.now(),
      };
      empire.blueprintMap.set(bp.id, bp);
      this.persistBlueprint(bp, true);
    }
  }

  seedStarterBlueprintsForAll(): void {
    for (const empire of this.runtime.empires.values()) this.seedStarterBlueprints(empire);
  }

  createBlueprint(
    empire: Empire,
    name: string,
    chassisId: string,
    modules: string[],
  ): string | null {
    if (empire.blueprintMap.size >= MAX_BLUEPRINTS) return "Trop de plans enregistrés";
    const problems = validateBlueprint({ chassisId, modules }, empire.effects);
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
    this.persistBlueprint(bp, true);
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
    const problems = validateBlueprint({ chassisId, modules }, empire.effects);
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
    const problems = validateBlueprint(bp, empire.effects);
    if (problems.length > 0) return problems[0]!;
    const stats = resolveBlueprint(bp);

    if (stats.domain === "colony") {
      const colony = colonyId ? empire.colonyMap.get(colonyId) : undefined;
      if (!colony) return "Colonie inconnue";
      const result = enqueueShipFromStats(colony, bp.id, stats, Date.now(), empire.effects);
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
    for (const [res, amount] of Object.entries(stats.cost) as [ResourceId, number][]) {
      if ((resources[res] ?? 0) < amount) return `Ressources insuffisantes (${amount} ${res})`;
    }
    for (const [res, amount] of Object.entries(stats.cost) as [ResourceId, number][]) {
      resources[res] -= amount;
    }
    empire.colonyMap.set(home.id, { ...home, resources });
    this.persistColony(empire.colonyMap.get(home.id)!);
    const now = Date.now();
    const startedAt = Math.max(now, fleet.queue.at(-1)?.finishesAt ?? now);
    const buildMs = Math.round(stats.buildMs * empire.effects.shipBuildSpeedMult);
    const next: Fleet = {
      ...fleet,
      queue: [...fleet.queue, { warshipId: bp.id, startedAt, finishesAt: startedAt + buildMs }],
    };
    empire.fleetMap.set(fleet.id, next);
    this.persistFleet(next);
    this.notify();
    return null;
  }

  /** Distance en sauts colonie → station, -1 si inaccessible (aide au marché de plans). */
  private jumpsToStation(colony: Colony, stationId: string): number {
    const station = this.runtime.stationsById.get(stationId);
    if (!station) return -1;
    const fromPlanet = this.runtime.planetsById.get(colony.planetId);
    if (!fromPlanet) return -1;
    return jumpDistanceInUniverse(
      this.runtime.universe,
      fromPlanet.systemId,
      station.systemId,
      this.portalLinks,
    );
  }

  buyBlueprintFromStation(
    empire: Empire,
    colonyId: string,
    stationId: string,
    presetId: string,
  ): string | null {
    if (empire.blueprintMap.size >= MAX_BLUEPRINTS) return "Trop de plans enregistrés";
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    const station = this.runtime.stationsById.get(stationId);
    if (!station) return "Station inconnue";
    if (!empire.explored.has(station.systemId)) return "Station non découverte";
    if (this.jumpsToStation(colony, stationId) < 0) return "Station inaccessible";
    const preset = presetById(presetId);
    if (!preset) return "Plan inconnu au catalogue";

    const price = Math.round(costValue(resolveBlueprint(preset).cost) * BLUEPRINT_BUY_MARKUP);
    if (colony.resources.credits < price) return `Crédits insuffisants (${price})`;

    const bp: Blueprint = {
      id: randomUUID(),
      ownerId: empire.id,
      name: preset.name,
      chassisId: preset.chassisId,
      modules: [...preset.modules],
      createdAt: Date.now(),
    };
    empire.blueprintMap.set(bp.id, bp);
    this.persistBlueprint(bp, true);
    empire.colonyMap.set(colony.id, {
      ...colony,
      resources: { ...colony.resources, credits: colony.resources.credits - price },
    });
    this.persistColony(empire.colonyMap.get(colony.id)!);
    this.notify();
    return null;
  }

  sellBlueprint(
    empire: Empire,
    colonyId: string,
    stationId: string,
    blueprintId: string,
  ): string | null {
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    if (this.jumpsToStation(colony, stationId) < 0) return "Station inaccessible";
    const bp = empire.blueprintMap.get(blueprintId);
    if (!bp) return "Plan inconnu";

    const price = Math.round(costValue(resolveBlueprint(bp).cost) * BLUEPRINT_SELL_FRACTION);
    empire.blueprintMap.delete(blueprintId);
    this.blueprintRepo.remove(blueprintId);
    empire.colonyMap.set(colony.id, {
      ...colony,
      resources: { ...colony.resources, credits: colony.resources.credits + price },
    });
    this.persistColony(empire.colonyMap.get(colony.id)!);
    this.notify();
    return null;
  }

  sellShip(
    empire: Empire,
    colonyId: string,
    stationId: string,
    shipId: string,
    countRaw: number,
  ): string | null {
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    if (this.jumpsToStation(colony, stationId) < 0) return "Station inaccessible";
    const count = Math.floor(Number(countRaw));
    if (!Number.isFinite(count) || count <= 0) return "Quantité invalide";

    const idle = idleShips(colony, [...empire.routeMap.values()]);
    if ((idle[shipId] ?? 0) < count) return "Vaisseaux indisponibles (occupés ou insuffisants)";

    const legacyDef = SHIPS[shipId as LegacyShipId];
    const bp = empire.blueprintMap.get(shipId);
    const cost = legacyDef?.cost ?? (bp ? resolveBlueprint(bp).cost : null);
    if (!cost) return "Vaisseau inconnu";

    const price = Math.round(costValue(cost) * BLUEPRINT_SELL_FRACTION) * count;
    const ships = { ...colony.ships, [shipId]: (colony.ships[shipId] ?? 0) - count };
    empire.colonyMap.set(colony.id, {
      ...colony,
      ships,
      resources: { ...colony.resources, credits: colony.resources.credits + price },
    });
    this.persistColony(empire.colonyMap.get(colony.id)!);
    this.notify();
    return null;
  }

  // ── Recherche (chantier 11) ──────────────────────────────────────────────

  startResearch(empire: Empire, techId: string): string | null {
    if (empire.research) return "Une recherche est déjà en cours";
    const tech = TECHS[techId as TechId];
    if (!tech) return "Technologie inconnue";
    if (!canResearch(tech.id, empire.researched as TechId[])) {
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
  private beginResearch(empire: Empire, techId: TechId, now = Date.now()): boolean {
    const tech = TECHS[techId];
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
        resources: { ...colony.resources, science: colony.resources.science - take },
      };
      empire.colonyMap.set(colony.id, updated);
      this.persistColony(updated);
    }

    empire.research = { techId: tech.id, startedAt: now, finishesAt: now + tech.durationMs };
    this.persistResearch(empire);
    return true;
  }

  queueResearch(empire: Empire, techId: string): string | null {
    const tech = TECHS[techId as TechId];
    if (!tech) return "Technologie inconnue";
    const path = researchPath(tech.id, empire.researched as TechId[]);
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
    empire.researchQueue = empire.researchQueue.filter((id) => !empire.researched.includes(id));
    const next = empire.researchQueue[0] as TechId | undefined;
    if (!next) return;
    if (!canResearch(next, empire.researched as TechId[])) return;
    if (this.beginResearch(empire, next, now)) {
      empire.researchQueue = empire.researchQueue.slice(1);
    }
  }

  resolveResearch(empire: Empire, t: number): void {
    const finished = empire.research && empire.research.finishesAt <= t ? empire.research : null;
    if (finished) {
      empire.researched = [...empire.researched, finished.techId];
      empire.research = null;
      empire.effects = computeEffects(empire.researched as TechId[]);
      this.logger.info(`[game] recherche terminée : ${finished.techId}`);
    }
    // Enchaînement de la file, y compris quand la science manquait au tick précédent.
    const beforeQueue = empire.research;
    this.advanceResearchQueue(empire, t);
    if (finished || beforeQueue !== empire.research) this.persistResearch(empire);
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
            outputMultAll: empire.effects.outputMultAll * CLAIM_PRODUCTION_BONUS,
          }
        : empire.effects;
      // L'ascenseur tourne après la production : ce qui vient d'être produit peut monter.
      empire.colonyMap.set(
        id,
        applyLift(
          applyColonyTick(resolveShips(resolveQueue(colony, t), t), planet, effects),
          effects,
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
