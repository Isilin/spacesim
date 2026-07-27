import {
  combatDefFromStats,
  createRng,
  fleetIsEmpty,
  fleetPower,
  jumpDistanceInUniverse,
  gatewayLinks,
  PIRATE_SPAWN_CHANCE,
  PIRATE_TAX_PER_TICK,
  pirateBounty,
  pirateComposition,
  pirateDirectives,
  randInt,
  RAID_FRACTION,
  resolveBattle,
  resolveBlueprint,
  RESOURCES,
  storageCap,
  transferDurationMs,
  WARSHIP_COMBAT_DEFS,
  WARSHIPS,
  WORLD_EVENT_PIRATE_MULT,
  type CombatDef,
  type Colony,
  type Fleet,
  type FleetComposition,
  type PirateLair,
  type ResourceId,
  type StoredBattle,
  type WarshipId,
  type WorldEventKind,
} from "@spacesim/shared";
import { randomUUID } from "node:crypto";
import type { Empire } from "../../empire.js";
import type { GameRuntime } from "../game-runtime.js";
import type { Logger } from "../logger.js";
import { FleetRepository } from "../repositories/fleet-repository.js";

/** Directives par défaut d'une flotte neuve. */
const DEFAULT_DIRECTIVES = { long: "focus_fire", medium: "focus_fire", short: "focus_fire" };

/** Batailles archivées conservées. */
const MAX_BATTLES = 20;

/**
 * Flottes et combat : création/production/déplacement de flotte, attaques (repaire,
 * flotte ennemie, colonie), tick de production/déplacement et apparition des repaires
 * pirates PNJ. Dépendances vers d'autres domaines (colonie, territoire, diplomatie,
 * événements de monde) injectées comme callbacks étroits, à l'identique des services
 * précédents.
 */
export class FleetService {
  private readonly repo: FleetRepository;

  constructor(
    private readonly runtime: GameRuntime,
    private readonly notify: () => void,
    private readonly logger: Logger,
    private readonly persistColony: (colony: Colony) => void,
    private readonly dropClaim: (empire: Empire, systemId: string) => void,
    private readonly markExplored: (empire: Empire, systemId: string) => void,
    private readonly atWar: (a: string, b: string) => boolean,
    private readonly worldEventKindsOnGalaxy: (galaxyId: string) => WorldEventKind[],
  ) {
    this.repo = new FleetRepository(runtime.clock.id);
  }

  private get portalLinks(): [string, string][] {
    return gatewayLinks(this.runtime.universe, [...this.runtime.gatewayMap.values()]);
  }

  /** Localise une flotte parmi tous les empires (cible PvP). */
  private findFleet(fleetId: string): { empire: Empire; fleet: Fleet } | null {
    for (const empire of this.runtime.empires.values()) {
      const fleet = empire.fleetMap.get(fleetId);
      if (fleet) return { empire, fleet };
    }
    return null;
  }

  /** Localise une colonie parmi tous les empires (cible PvP). */
  private findColony(colonyId: string): { empire: Empire; colony: Colony } | null {
    for (const empire of this.runtime.empires.values()) {
      const colony = empire.colonyMap.get(colonyId);
      if (colony) return { empire, colony };
    }
    return null;
  }

  /**
   * Définitions de combat couvrant les classes historiques (défaut/PNJ) + les plans des
   * empires impliqués dans la bataille — le combat résout ainsi n'importe quel id présent.
   */
  private combatDefs(...empires: Empire[]): Record<string, CombatDef> {
    const defs: Record<string, CombatDef> = { ...WARSHIP_COMBAT_DEFS };
    for (const empire of empires) {
      for (const bp of empire.blueprintMap.values()) {
        defs[bp.id] = combatDefFromStats(resolveBlueprint(bp));
      }
    }
    return defs;
  }

  /** Action joueur : créer une flotte vide rattachée à une colonie. */
  createFleet(empire: Empire, colonyId: string, name: string): string | null {
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    const systemId = this.runtime.planetsById.get(colony.planetId)?.systemId;
    if (!systemId) return "Système inconnu";
    const fleet: Fleet = {
      id: randomUUID(),
      ownerId: empire.id,
      name: name.trim().slice(0, 40) || "Flotte",
      systemId,
      homeColonyId: colonyId,
      ships: {},
      directives: { ...DEFAULT_DIRECTIVES },
      queue: [],
      movement: null,
    };
    empire.fleetMap.set(fleet.id, fleet);
    this.persistFleet(fleet, true);
    this.notify();
    return null;
  }

  /** Action joueur : produire un vaisseau de guerre (file de la flotte, tech requise). */
  buildWarship(empire: Empire, fleetId: string, warshipId: string): string | null {
    const fleet = empire.fleetMap.get(fleetId);
    if (!fleet) return "Flotte inconnue";
    if (fleet.movement) return "Flotte en déplacement";
    const def = WARSHIPS[warshipId as WarshipId];
    if (!def) return "Vaisseau inconnu";
    const home = empire.colonyMap.get(fleet.homeColonyId);
    if (!home) return "Colonie de rattachement inconnue";
    if ((home.buildings.shipyard ?? 0) < 1) return "Chantier naval requis";
    if (!empire.researched.includes(def.requiresTech)) {
      return "Technologie militaire requise";
    }
    if (fleet.queue.length >= 5) return "File de production pleine";
    const resources = { ...home.resources };
    for (const [res, amount] of Object.entries(def.cost) as [ResourceId, number][]) {
      if (resources[res] < amount) return `Ressources insuffisantes (${amount} ${res})`;
    }
    for (const [res, amount] of Object.entries(def.cost) as [ResourceId, number][]) {
      resources[res] -= amount;
    }
    empire.colonyMap.set(home.id, { ...home, resources });
    this.persistColony(empire.colonyMap.get(home.id)!);
    const now = Date.now();
    const lastFinish = fleet.queue.at(-1)?.finishesAt ?? now;
    const startedAt = Math.max(now, lastFinish);
    const next: Fleet = {
      ...fleet,
      queue: [...fleet.queue, { warshipId, startedAt, finishesAt: startedAt + def.buildMs }],
    };
    empire.fleetMap.set(fleetId, next);
    this.persistFleet(next);
    this.notify();
    return null;
  }

  setFleetDirectives(
    empire: Empire,
    fleetId: string,
    directives: Record<string, string>,
  ): string | null {
    const fleet = empire.fleetMap.get(fleetId);
    if (!fleet) return "Flotte inconnue";
    const next: Fleet = {
      ...fleet,
      directives: {
        long: directives.long ?? fleet.directives.long ?? "focus_fire",
        medium: directives.medium ?? fleet.directives.medium ?? "focus_fire",
        short: directives.short ?? fleet.directives.short ?? "focus_fire",
      },
    };
    empire.fleetMap.set(fleetId, next);
    this.persistFleet(next);
    this.notify();
    return null;
  }

  /** Action joueur : déplacer une flotte vers un système accessible. */
  moveFleet(empire: Empire, fleetId: string, toSystemId: string): string | null {
    const fleet = empire.fleetMap.get(fleetId);
    if (!fleet) return "Flotte inconnue";
    if (fleet.movement) return "Flotte déjà en déplacement";
    if (fleet.queue.length > 0) return "Production en cours au chantier";
    if (toSystemId === fleet.systemId) return "Déjà sur place";
    const jumps = jumpDistanceInUniverse(
      this.runtime.universe,
      fleet.systemId,
      toSystemId,
      this.portalLinks,
    );
    if (jumps < 0) return "Système inaccessible";
    const now = Date.now();
    const next: Fleet = {
      ...fleet,
      movement: {
        toSystemId,
        departedAt: now,
        arrivesAt: now + transferDurationMs(jumps) * empire.effects.transferSpeedMult,
      },
    };
    empire.fleetMap.set(fleetId, next);
    this.persistFleet(next);
    this.notify();
    return null;
  }

  /** Action joueur : attaquer un repaire pirate présent dans le système de la flotte. */
  attackLair(empire: Empire, fleetId: string, lairId: string): string | null {
    const fleet = empire.fleetMap.get(fleetId);
    if (!fleet) return "Flotte inconnue";
    if (fleet.movement) return "Flotte en déplacement";
    const lair = this.runtime.lairMap.get(lairId);
    if (!lair) return "Repaire inconnu";
    if (lair.systemId !== fleet.systemId) return "Flotte pas sur zone";
    if (fleetIsEmpty(fleet.ships)) return "Flotte sans vaisseau";

    const report = resolveBattle(
      fleet.ships as FleetComposition,
      lair.ships as FleetComposition,
      fleet.directives as never,
      lair.directives as never,
      this.combatDefs(empire),
    );
    this.archiveBattle(fleet.systemId, fleet.name, "Repaire pirate", report);

    // Mise à jour de la flotte (survivants).
    const updatedFleet: Fleet = { ...fleet, ships: report.attackerSurvivors };
    empire.fleetMap.set(fleetId, updatedFleet);
    this.persistFleet(updatedFleet);

    if (report.winner === "attacker") {
      // Butin crédité à la colonie de rattachement, repaire détruit.
      const home = empire.colonyMap.get(fleet.homeColonyId);
      if (home) {
        empire.colonyMap.set(home.id, {
          ...home,
          resources: { ...home.resources, credits: home.resources.credits + lair.bounty },
        });
        this.persistColony(empire.colonyMap.get(home.id)!);
      }
      this.runtime.lairMap.delete(lairId);
      this.repo.removeLair(lairId);
      this.logger.info(`[game] repaire nettoyé (butin ${lair.bounty})`);
    } else {
      // Le repaire survivant est réduit à ses rescapés.
      const survivingLair: PirateLair = { ...lair, ships: report.defenderSurvivors };
      if (fleetIsEmpty(survivingLair.ships)) {
        this.runtime.lairMap.delete(lairId);
        this.repo.removeLair(lairId);
      } else {
        this.runtime.lairMap.set(lairId, survivingLair);
        this.persistLair(survivingLair);
      }
    }
    this.notify();
    return null;
  }

  disbandFleet(empire: Empire, fleetId: string): string | null {
    const fleet = empire.fleetMap.get(fleetId);
    if (!fleet) return "Flotte inconnue";
    if (fleet.movement) return "Flotte en déplacement";
    empire.fleetMap.delete(fleetId);
    this.repo.removeFleet(fleetId);
    this.notify();
    return null;
  }

  /** Retire une flotte (survivants nuls) ou la met à jour (chantier 7d — PvP). */
  private applyFleetSurvivors(empire: Empire, fleet: Fleet, ships: FleetComposition): void {
    if (fleetIsEmpty(ships)) {
      empire.fleetMap.delete(fleet.id);
      this.repo.removeFleet(fleet.id);
    } else {
      const next: Fleet = { ...fleet, ships };
      empire.fleetMap.set(fleet.id, next);
      this.persistFleet(next);
    }
  }

  /** Action joueur : attaquer une flotte ennemie stationnée dans le même système (PvP). */
  attackFleet(empire: Empire, fleetId: string, targetFleetId: string): string | null {
    const fleet = empire.fleetMap.get(fleetId);
    if (!fleet) return "Flotte inconnue";
    if (fleet.movement) return "Flotte en déplacement";
    if (fleetIsEmpty(fleet.ships)) return "Flotte sans vaisseau";
    const target = this.findFleet(targetFleetId);
    if (!target || target.empire.id === empire.id) return "Cible inconnue";
    if (!this.atWar(empire.id, target.empire.id)) return "En paix — déclarez la guerre d'abord";
    if (target.fleet.movement) return "Cible en déplacement";
    if (target.fleet.systemId !== fleet.systemId) return "Cible hors de portée";
    if (fleetIsEmpty(target.fleet.ships)) return "Cible sans vaisseau";

    const report = resolveBattle(
      fleet.ships as FleetComposition,
      target.fleet.ships as FleetComposition,
      fleet.directives as never,
      target.fleet.directives as never,
      this.combatDefs(empire, target.empire),
    );
    this.archiveBattle(
      fleet.systemId,
      fleet.name,
      `${target.empire.name} — ${target.fleet.name}`,
      report,
    );
    this.applyFleetSurvivors(empire, fleet, report.attackerSurvivors as FleetComposition);
    this.applyFleetSurvivors(
      target.empire,
      target.fleet,
      report.defenderSurvivors as FleetComposition,
    );
    this.notify();
    return null;
  }

  /**
   * Action joueur : attaquer une colonie ennemie (PvP — raid). La flotte ennemie la
   * plus puissante stationnée sur zone défend d'abord ; si l'attaquant l'emporte (ou
   * qu'il n'y a pas de défenseur), il pille une fraction des ressources et rompt le
   * claim ennemi sur le système. Pas de capture de colonie à ce stade.
   */
  attackColony(empire: Empire, fleetId: string, targetColonyId: string): string | null {
    const fleet = empire.fleetMap.get(fleetId);
    if (!fleet) return "Flotte inconnue";
    if (fleet.movement) return "Flotte en déplacement";
    if (fleetIsEmpty(fleet.ships)) return "Flotte sans vaisseau";
    const target = this.findColony(targetColonyId);
    if (!target || target.empire.id === empire.id) return "Colonie cible inconnue";
    if (!this.atWar(empire.id, target.empire.id)) return "En paix — déclarez la guerre d'abord";
    const systemId = this.runtime.planetsById.get(target.colony.planetId)?.systemId;
    if (!systemId) return "Système inconnu";
    if (systemId !== fleet.systemId) return "Cible hors de portée";

    // Défense : la flotte ennemie la plus fournie stationnée dans le système.
    const shipCount = (ships: Fleet["ships"]): number => {
      let total = 0;
      for (const n of Object.values(ships)) total += n ?? 0;
      return total;
    };
    const defender = [...target.empire.fleetMap.values()]
      .filter((f) => f.systemId === systemId && !f.movement && !fleetIsEmpty(f.ships))
      .sort((a, b) => shipCount(b.ships) - shipCount(a.ships))[0];

    if (defender) {
      const report = resolveBattle(
        fleet.ships as FleetComposition,
        defender.ships as FleetComposition,
        fleet.directives as never,
        defender.directives as never,
        this.combatDefs(empire, target.empire),
      );
      this.archiveBattle(systemId, fleet.name, `${target.empire.name} — ${defender.name}`, report);
      this.applyFleetSurvivors(
        target.empire,
        defender,
        report.defenderSurvivors as FleetComposition,
      );
      this.applyFleetSurvivors(empire, fleet, report.attackerSurvivors as FleetComposition);
      // Attaquant anéanti ou défense victorieuse → pas de raid.
      if (fleetIsEmpty(report.attackerSurvivors) || report.winner !== "attacker") {
        this.notify();
        return null;
      }
    }

    // Raid : pillage d'une fraction des ressources, crédité à la colonie de rattachement.
    const home = empire.colonyMap.get(fleet.homeColonyId);
    const victim = target.empire.colonyMap.get(targetColonyId)!;
    const stolen: Partial<Record<ResourceId, number>> = {};
    const victimResources = { ...victim.resources };
    for (const res of RESOURCES) {
      const take = Math.floor(victimResources[res] * RAID_FRACTION);
      if (take <= 0) continue;
      stolen[res] = take;
      victimResources[res] -= take;
    }
    target.empire.colonyMap.set(victim.id, { ...victim, resources: victimResources });
    this.persistColony(target.empire.colonyMap.get(victim.id)!);
    if (home) {
      const homeResources = { ...home.resources };
      for (const [res, amount] of Object.entries(stolen) as [ResourceId, number][]) {
        homeResources[res] = Math.min(
          homeResources[res] + amount,
          storageCap(home, res, empire.effects),
        );
      }
      empire.colonyMap.set(home.id, { ...home, resources: homeResources });
      this.persistColony(empire.colonyMap.get(home.id)!);
    }
    // Rupture du claim ennemi sur le système pillé.
    if (target.empire.claimedSystemIds.includes(systemId)) {
      this.dropClaim(target.empire, systemId);
    }
    this.archiveBattle(systemId, fleet.name, `${target.empire.name} — ${victim.name} (raid)`, {
      raid: true,
      stolen,
    });
    this.logger.info(`[game] raid sur ${victim.name} par « ${empire.name} »`);
    this.notify();
    return null;
  }

  private archiveBattle(
    systemId: string,
    attackerName: string,
    defenderName: string,
    report: unknown,
  ): void {
    const battle: StoredBattle = {
      id: randomUUID(),
      at: Date.now(),
      systemId,
      attackerName,
      defenderName,
      report,
    };
    this.runtime.battleLog = [battle, ...this.runtime.battleLog].slice(0, MAX_BATTLES);
    this.repo.insertBattle(battle);
    // Purge des batailles au-delà de la limite.
    this.repo.removeBattlesExcept(new Set(this.runtime.battleLog.map((b) => b.id)));
  }

  /**
   * Résout production et déplacements des flottes de l'empire, puis la ponction
   * pirate sur ses colonies. Repaires pirates = PNJ partagés (l'apparition est
   * résolue une fois par tick au niveau univers, cf. `advance`).
   */
  fleetsTick(empire: Empire, t: number): void {
    for (const [id, fleet] of empire.fleetMap) {
      let current = fleet;
      // Livraison des vaisseaux produits.
      const done = current.queue.filter((q) => q.finishesAt <= t);
      if (done.length > 0) {
        const ships = { ...current.ships };
        for (const item of done) ships[item.warshipId] = (ships[item.warshipId] ?? 0) + 1;
        current = { ...current, ships, queue: current.queue.filter((q) => q.finishesAt > t) };
      }
      // Arrivée d'un déplacement : la flotte révèle son système de destination.
      if (current.movement && current.movement.arrivesAt <= t) {
        const arrivedAt = current.movement.toSystemId;
        current = { ...current, systemId: arrivedAt, movement: null };
        this.markExplored(empire, arrivedAt);
      }
      if (current !== fleet) {
        empire.fleetMap.set(id, current);
        this.persistFleet(current);
      }
    }

    // Piraterie : ponction de crédits aux colonies partageant un système avec un repaire.
    for (const lair of this.runtime.lairMap.values()) {
      for (const colony of empire.colonyMap.values()) {
        if (this.runtime.planetsById.get(colony.planetId)?.systemId !== lair.systemId) continue;
        const credits = Math.max(0, colony.resources.credits - PIRATE_TAX_PER_TICK);
        empire.colonyMap.set(colony.id, {
          ...colony,
          resources: { ...colony.resources, credits },
        });
      }
    }
  }

  /**
   * Apparition de repaires pirates PNJ (univers partagé, une fois par tick éco).
   * Brouillard univers (union des empires) ; jamais dans un système revendiqué.
   */
  spawnPirates(
    tickNumber: number,
    universeExplored: Set<string>,
    claimOwner: (systemId: string) => Empire | null,
  ): void {
    for (const systemId of universeExplored) {
      if (claimOwner(systemId)) continue;
      if ([...this.runtime.lairMap.values()].some((l) => l.systemId === systemId)) continue;
      const galaxy = this.runtime.universe.galaxies.find((g) =>
        g.systems.some((s) => s.id === systemId),
      );
      // Vague pirate majeure (chantier 17) : la galaxie touchée voit sa chance de spawn multipliée.
      const surging = galaxy
        ? this.worldEventKindsOnGalaxy(galaxy.id).includes("pirate_surge")
        : false;
      const chance = surging
        ? Math.min(1, PIRATE_SPAWN_CHANCE * WORLD_EVENT_PIRATE_MULT)
        : PIRATE_SPAWN_CHANCE;
      const rng = createRng(`pirate-${this.runtime.clock.seed}-${systemId}-${tickNumber}`);
      if (rng() > chance) continue;
      // Menace croissante selon l'éloignement de la galaxie d'origine.
      const threat = galaxy && galaxy.id !== "gal-0" ? 3 : randInt(rng, 1, 2);
      const ships = pirateComposition(rng, threat);
      const lair: PirateLair = {
        id: randomUUID(),
        systemId,
        ships,
        directives: pirateDirectives(rng),
        bounty: pirateBounty(ships),
      };
      this.runtime.lairMap.set(lair.id, lair);
      this.persistLair(lair, true);
    }
  }

  persistFleet(fleet: Fleet, insert = false): void {
    this.repo.saveFleet(
      { ...fleet, ownerId: fleet.ownerId ?? this.runtime.defaultEmpire.id },
      insert,
    );
  }

  persistLair(lair: PirateLair, insert = false): void {
    this.repo.saveLair(lair, insert);
  }

  async loadFleets(): Promise<void> {
    for (const fleet of await this.repo.loadFleets(this.runtime.defaultEmpire.id)) {
      const ownerId = fleet.ownerId ?? this.runtime.defaultEmpire.id;
      const empire = this.runtime.empires.get(ownerId) ?? this.runtime.defaultEmpire;
      empire.fleetMap.set(fleet.id, fleet);
    }
  }

  async loadPirates(): Promise<void> {
    for (const lair of await this.repo.loadLairs()) {
      this.runtime.lairMap.set(lair.id, lair);
    }
  }

  async loadBattles(): Promise<void> {
    this.runtime.battleLog = (await this.repo.loadBattles())
      .sort((a, b) => b.at - a.at)
      .slice(0, MAX_BATTLES);
  }
}
