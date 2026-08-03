import {
  allSystems,
  CLAIM_COST,
  colonizeInfluenceCost,
  colonyShipDurationMs,
  contiguousClaims,
  CONTIGUOUS_CLAIM_BONUS,
  galaxiesToAdd,
  generateGalaxyAt,
  influencePerTick,
  jumpDistanceInUniverse,
  gatewayLinks,
  probeDurationMs,
  COLONY_SHIP_COST,
  type BalanceConstants,
  type Colony,
  type GalaxyOccupancy,
  type Mission,
  type ResourceId,
} from "@spacesim/shared";
import type { Empire } from "../../empire.js";
import { balanceFromContent } from "../content/content-service.js";
import type { GameRuntime } from "../game-runtime.js";
import type { Logger } from "../logger.js";
import { ClaimRepository } from "../repositories/claim-repository.js";
import { PlayerRepository } from "../repositories/player-repository.js";
import { stageGalaxies, withParentIndexes } from "../universe-store.js";

/**
 * Exploration et territoire : sondes, colonisation, revendications de systèmes et
 * croissance de l'univers (frontière glissante, chantier 9). `insertMission` est
 * injecté depuis Logistics plutôt que d'y référer directement, à l'identique du
 * patron déjà utilisé par les autres services.
 */
export class ExplorationService {
  private readonly claimRepo: ClaimRepository;
  private readonly playerRepo: PlayerRepository;

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
    private readonly initMarkets: () => void,
    private readonly initGateways: () => void,
  ) {
    this.claimRepo = new ClaimRepository(runtime.clock.id, runtime.writeSet);
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

  /** Action joueur : envoyer une sonde révéler un système. */
  probe(empire: Empire, colonyId: string, systemId: string): string | null {
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    if (empire.explored.has(systemId)) return "Système déjà exploré";
    const system = allSystems(this.runtime.universe).find(
      (s) => s.id === systemId,
    );
    if (!system) return "Système inconnu";
    if (
      [...empire.missionMap.values()].some(
        (m) => m.kind === "probe" && m.targetId === systemId,
      )
    ) {
      return "Une sonde est déjà en route";
    }
    const fromPlanet = this.runtime.planetsById.get(colony.planetId);
    if (!fromPlanet) return "Planète inconnue";
    const balance = this.balance;
    const cost = Math.round(
      balance.probeCostCredits * empire.effects.probeCostMult,
    );
    if (colony.resources.credits < cost) {
      return `Crédits insuffisants (coût : ${cost})`;
    }
    const jumps = jumpDistanceInUniverse(
      this.runtime.universe,
      fromPlanet.systemId,
      systemId,
      this.portalLinks,
    );
    if (jumps < 0) return "Système inaccessible";

    const resources = {
      ...colony.resources,
      credits: colony.resources.credits - cost,
    };
    empire.colonyMap.set(colony.id, { ...colony, resources });
    this.persistColony(empire.colonyMap.get(colony.id)!);
    this.insertMission(
      empire,
      "probe",
      colonyId,
      systemId,
      probeDurationMs(jumps, balance) * empire.effects.probeSpeedMult,
    );
    this.notify();
    return null;
  }

  /** Action joueur : envoyer un vaisseau colonial fonder une colonie. */
  colonize(empire: Empire, colonyId: string, planetId: string): string | null {
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    const target = this.runtime.planetsById.get(planetId);
    if (!target) return "Planète inconnue";
    if (!empire.explored.has(target.systemId)) return "Système non exploré";
    if (target.type === "gas")
      return "Impossible de coloniser une géante gazeuse";
    if ([...empire.colonyMap.values()].some((c) => c.planetId === planetId)) {
      return "Planète déjà colonisée";
    }
    if (
      [...empire.missionMap.values()].some(
        (m) => m.kind === "colonize" && m.targetId === planetId,
      )
    ) {
      return "Un vaisseau colonial est déjà en route";
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
    for (const [res, amount] of Object.entries(COLONY_SHIP_COST) as [
      ResourceId,
      number,
    ][]) {
      if (resources[res] < amount) {
        return `Ressources insuffisantes pour le vaisseau colonial (${amount} ${res})`;
      }
    }
    // Frein politique : chaque colonie supplémentaire coûte de l'influence.
    const pendingColonies = [...empire.missionMap.values()].filter(
      (m) => m.kind === "colonize",
    ).length;
    const influenceCost = colonizeInfluenceCost(
      empire.colonyMap.size + pendingColonies,
    );
    if (empire.influence < influenceCost) {
      return `Influence insuffisante (${Math.floor(empire.influence)}/${influenceCost})`;
    }
    for (const [res, amount] of Object.entries(COLONY_SHIP_COST) as [
      ResourceId,
      number,
    ][]) {
      resources[res] -= amount;
    }
    empire.influence -= influenceCost;
    empire.colonyMap.set(colony.id, { ...colony, resources });
    this.persistColony(empire.colonyMap.get(colony.id)!);
    this.insertMission(
      empire,
      "colonize",
      colonyId,
      planetId,
      colonyShipDurationMs(jumps, this.balance) *
        empire.effects.colonyShipSpeedMult,
    );
    this.notify();
    return null;
  }

  /** Empire propriétaire du claim d'un système, ou null (claims exclusifs — Phase E). */
  claimOwner(systemId: string): Empire | null {
    for (const empire of this.runtime.empires.values()) {
      if (empire.claimedSystemIds.includes(systemId)) return empire;
    }
    return null;
  }

  /** Union des systèmes explorés par tous les empires (brouillard univers — Phase E). */
  universeExplored(): Set<string> {
    const explored = new Set<string>();
    for (const empire of this.runtime.empires.values()) {
      for (const systemId of empire.explored) explored.add(systemId);
    }
    return explored;
  }

  /** Occupation par galaxie, matière première des règles d'expansion (`sim/expansion`). */
  galaxyOccupancy(): GalaxyOccupancy[] {
    const occupiedPlanets = new Set<string>();
    /** Empires ayant au moins une colonie, par index de galaxie. */
    const empiresByGalaxy = new Map<number, Set<string>>();
    for (const empire of this.runtime.empires.values()) {
      for (const colony of empire.colonyMap.values()) {
        occupiedPlanets.add(colony.planetId);
        const systemId = this.runtime.planetsById.get(
          colony.planetId,
        )?.systemId;
        const index =
          systemId === undefined
            ? undefined
            : this.runtime.galaxyIndexOfSystem.get(systemId);
        if (index === undefined) continue;
        const set = empiresByGalaxy.get(index) ?? new Set<string>();
        set.add(empire.id);
        empiresByGalaxy.set(index, set);
      }
    }
    return this.runtime.universe.galaxies.map((galaxy, index) => {
      let colonies = 0;
      let freeHabitable = 0;
      for (const system of galaxy.systems) {
        for (const planet of system.planets) {
          if (occupiedPlanets.has(planet.id)) colonies++;
          else if (planet.type !== "gas") freeHabitable++;
        }
      }
      return {
        index,
        colonies,
        empires: empiresByGalaxy.get(index)?.size ?? 0,
        freeHabitable,
      };
    });
  }

  /**
   * Déroule `count` galaxies de plus depuis la seed. Les galaxies déjà générées sont
   * intactes (RNG dérivé par index — chantier 9.1) : on ajoute, on ne régénère pas.
   */
  growUniverse(count: number): void {
    if (count <= 0) return;
    const from = this.runtime.universe.galaxies.length;
    const added = Array.from({ length: count }, (_, i) =>
      generateGalaxyAt(this.runtime.clock.seed, from + i),
    );
    // Parents figés sur les positions RÉELLES de l'univers courant (issu de la DB),
    // puis matérialisation transactionnelle : une galaxie n'existe qu'une fois écrite,
    // et le générateur n'a plus jamais autorité sur elle (chantier 18).
    this.runtime.universe = withParentIndexes({
      ...this.runtime.universe,
      galaxies: [...this.runtime.universe.galaxies, ...added],
    });
    this.runtime.clock.galaxyCount = this.runtime.universe.galaxies.length;
    this.runtime.reindexUniverse();
    // Staging synchrone dans le WriteSet (chantier 20.3) — `growUniverse` tourne dans
    // le chemin de tick, qui ne peut pas `await` une requête Postgres. `games.galaxyCount`
    // (déjà mis à jour en RAM ci-dessus) est porté par `TickRunner.saveTick`, pas ici.
    // AVANT `initMarkets`/`initGateways` : ceux-ci stagent des lignes qui référencent
    // (FK réelles, chantier 20.3) les tables `universe_*` d'ici — le `Persister` applique
    // le flush dans l'ordre de staging au sein d'une même transaction.
    stageGalaxies(
      this.runtime.writeSet,
      this.runtime.clock.id,
      this.runtime.universe.galaxies.slice(from),
    );
    // Les galaxies neuves arrivent avec leurs comptoirs et leur chantier de portail.
    this.initMarkets();
    this.initGateways();
    // Tous les clients doivent recevoir la nouvelle carte, y compris ceux qui n'ont
    // rien exploré depuis leur dernier message.
    for (const empire of this.runtime.empires.values())
      empire.universeDirty = true;
    this.logger.info(
      `[game] univers étendu : +${count} galaxie(s) (${added.map((g) => g.name).join(", ")}) — ${this.runtime.clock.galaxyCount} au total`,
    );
    this.notify();
  }

  /** Maintient la frontière glissante : toujours des galaxies vierges devant les joueurs. */
  ensureFrontier(): void {
    this.growUniverse(galaxiesToAdd(this.galaxyOccupancy()));
  }

  /** Action joueur : revendiquer un système (colonie sur place requise). */
  claimSystem(empire: Empire, systemId: string): string | null {
    const system = allSystems(this.runtime.universe).find(
      (s) => s.id === systemId,
    );
    if (!system) return "Système inconnu";
    if (!empire.explored.has(systemId)) return "Système non exploré";
    if (empire.claimedSystemIds.includes(systemId))
      return "Système déjà revendiqué";
    // Claims exclusifs (Phase E) : un système n'appartient qu'à un empire à la fois.
    if (this.claimOwner(systemId))
      return "Système revendiqué par un autre empire";
    const hasColony = [...empire.colonyMap.values()].some(
      (c) => this.runtime.planetsById.get(c.planetId)?.systemId === systemId,
    );
    if (!hasColony) return "Une colonie sur place est requise pour revendiquer";
    if (empire.influence < CLAIM_COST) {
      return `Influence insuffisante (${Math.floor(empire.influence)}/${CLAIM_COST})`;
    }
    empire.influence -= CLAIM_COST;
    empire.claimedSystemIds = [...empire.claimedSystemIds, systemId];
    this.claimRepo.insert(systemId, empire.id);
    this.notify();
    return null;
  }

  /** Action joueur : abandonner une revendication (sans remboursement). */
  unclaimSystem(empire: Empire, systemId: string): string | null {
    if (!empire.claimedSystemIds.includes(systemId))
      return "Système non revendiqué";
    this.dropClaim(empire, systemId);
    this.notify();
    return null;
  }

  dropClaim(empire: Empire, systemId: string): void {
    empire.claimedSystemIds = empire.claimedSystemIds.filter(
      (id) => id !== systemId,
    );
    this.claimRepo.remove(systemId);
  }

  /** Génération d'influence ; entretien impayé = la revendication la plus récente tombe. */
  influenceTick(empire: Empire): void {
    // Bonus de territoire soudé : les claims contigus rapportent un supplément d'influence.
    const contiguous = contiguousClaims(
      this.runtime.universe,
      empire.claimedSystemIds,
    ).size;
    const net =
      influencePerTick(
        [...empire.colonyMap.values()],
        empire.claimedSystemIds.length,
        empire.effects.influenceMult,
      ) +
      contiguous * CONTIGUOUS_CLAIM_BONUS;
    let influence = empire.influence + net;
    if (influence < 0 && empire.claimedSystemIds.length > 0) {
      const dropped = empire.claimedSystemIds.at(-1)!;
      this.dropClaim(empire, dropped);
      influence = 0;
      this.logger.info(
        `[game] revendication perdue faute d'influence : ${dropped}`,
      );
    }
    empire.influence = Math.max(0, influence);
  }

  markExplored(empire: Empire, systemId: string): void {
    if (empire.explored.has(systemId)) return;
    empire.explored.add(systemId);
    empire.explorationDirty = true;
    this.playerRepo.saveExplored(empire);
  }
}
