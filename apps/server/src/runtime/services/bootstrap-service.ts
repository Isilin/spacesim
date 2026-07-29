import {
  computeEffects,
  emptyOrbital,
  emptyResources,
  pickStarterGalaxy,
  type Colony,
  type GalaxyOccupancy,
  type Planet,
  type ResourceId,
  type TechId,
} from "@spacesim/shared";
import { randomUUID } from "node:crypto";
import { Empire } from "../../empire.js";
import type { GameRuntime } from "../game-runtime.js";
import type { Logger } from "../logger.js";
import { ClaimRepository } from "../repositories/claim-repository.js";
import { ColonyRepository } from "../repositories/colony-repository.js";
import { FleetRepository } from "../repositories/fleet-repository.js";
import { PlayerRepository } from "../repositories/player-repository.js";

/** Empire par défaut d'une partie solo (chantier 7 — socle multi-locataire). */
const DEFAULT_PLAYER_NAME = "Empire";
const DEFAULT_PLAYER_COLOR = "#4fd1ff";

/** Couleurs de territoire attribuées aux empires supplémentaires (outil de dev). */
const DEV_EMPIRE_COLORS = ["#4fd1ff", "#ff6b6b", "#ffd93d", "#6bcB77", "#c77dff", "#ff922b"];

/**
 * Amorce d'empires PNJ au boot (chantier 14) : distincte du peuplement joueur — juste
 * assez de PNJ pour que l'IA économique anime un monde vivant dès le premier tick.
 */
const NPC_EMPIRE_COUNT = 3;
const NPC_EMPIRE_NAMES = [
  "Confédération de Kess",
  "Dominion Vashtar",
  "République Solenne",
  "Directoire Zhorn",
  "Ligue Cindra",
  "Hégémonie Aurel",
];

/**
 * Bootstrap des empires (compte joueur, PNJ, colonie mère) et outils de dev qui en
 * dépendent directement. Dépendances vers d'autres domaines (persistance de colonie,
 * plans de départ, extension de l'univers, exploration) injectées comme callbacks
 * étroits, à l'identique des services précédents.
 */
export class BootstrapService {
  private readonly playerRepo: PlayerRepository;
  private readonly colonyRepo: ColonyRepository;
  private readonly claimRepo: ClaimRepository;
  private readonly fleetRepo: FleetRepository;

  constructor(
    private readonly runtime: GameRuntime,
    private readonly notify: () => void,
    private readonly logger: Logger,
    private readonly seedStarterBlueprints: (empire: Empire) => void,
    private readonly ensureFrontier: () => void,
    private readonly galaxyOccupancy: () => GalaxyOccupancy[],
    private readonly growUniverse: (count: number) => void,
    private readonly markExplored: (empire: Empire, systemId: string) => void,
  ) {
    this.playerRepo = new PlayerRepository(runtime.clock.id, runtime.writeSet);
    this.colonyRepo = new ColonyRepository(runtime.clock.id, runtime.writeSet);
    this.claimRepo = new ClaimRepository(runtime.clock.id, runtime.writeSet);
    this.fleetRepo = new FleetRepository(runtime.clock.id, runtime.writeSet);
  }

  /**
   * Colonie de départ : la planète la plus habitable de la galaxie d'origine.
   * Garantit qu'un empire par défaut existe et adopte les entités orphelines.
   * Socle du multi (chantier 7) : en solo, un unique player possède tout.
   * Pour une sauvegarde mono-locataire pré-existante, backfill des `ownerId` NULL.
   *
   * NB : l'état d'empire des sauvegardes pré-7b a été copié `games`→`players` par la
   * migration 0005 ; les colonnes legacy de `games` sont supprimées en 0006 (Phase D).
   */
  async ensureDefaultPlayer(): Promise<void> {
    const player = await this.playerRepo.first();
    const defaultId = player?.id ?? randomUUID();
    if (!player) {
      await this.playerRepo.insertDefault({
        id: defaultId,
        name: DEFAULT_PLAYER_NAME,
        color: DEFAULT_PLAYER_COLOR,
      });
    }
    // Sauvegarde mono-locataire pré-7b : backfill des ownerId NULL, table par table.
    await this.colonyRepo.adoptOrphans(defaultId);
    await this.fleetRepo.adoptOrphanFleets(defaultId);
    await this.claimRepo.adoptOrphans(defaultId);
  }

  /**
   * Instancie un `Empire` par ligne `players` (Phase A du chantier 7c). Chaque empire
   * charge son état autoritaire (recherche, influence, réputation, brouillard, effets)
   * et ses claims (par `ownerId`). `defaultEmpire` = premier player (ordre d'insertion),
   * fallback de compatibilité tant que l'identité de connexion (7c-B) n'existe pas.
   */
  async loadPlayers(): Promise<void> {
    for (const p of await this.playerRepo.loadAll()) {
      const empire = new Empire(p.id, p.name, p.color, p.accountId, p.kind);
      empire.joinedAt = p.joinedAt;
      empire.researched = p.researched;
      empire.research = p.research;
      empire.researchQueue = p.researchQueue;
      empire.influence = p.influence;
      empire.factionRep = p.factionRep;
      empire.explored = new Set(p.explored);
      empire.claimedSystemIds = await this.claimRepo.systemIdsOwnedBy(p.id);
      empire.effects = computeEffects(empire.researched as TechId[]);
      this.runtime.empires.set(empire.id, empire);
    }
    this.runtime.defaultEmpire = this.runtime.empires.values().next().value!;
  }

  /** Empire propriétaire d'une colonie (pour router les entités dérivées au chargement). */
  empireOfColony(colonyId: string): Empire {
    for (const empire of this.runtime.empires.values()) {
      if (empire.colonyMap.has(colonyId)) return empire;
    }
    return this.runtime.defaultEmpire;
  }

  createHomeColony(): void {
    const homeGalaxy = this.runtime.universe.galaxies[0]!;
    const planets = homeGalaxy.systems.flatMap((s) => s.planets);
    const home = planets.reduce((best, p) => (p.habitability > best.habitability ? p : best));
    this.foundHomeColony(this.runtime.defaultEmpire, home);
  }

  /** Fonde une colonie mère pour un empire sur `planet` et révèle son système. */
  private foundHomeColony(empire: Empire, planet: Planet): void {
    this.insertColony(empire, {
      id: randomUUID(),
      planetId: planet.id,
      name: `${planet.name} — Colonie mère`,
      resources: { ...emptyResources(), ore: 400, energy: 200, food: 200, credits: 50 },
      // La colonie mère naît avec son dock et une soute orbitale amorcée : le premier
      // convoi doit rester possible sans attendre l'ascenseur (chantier 12).
      orbitalResources: { ...emptyOrbital(), ore: 150, food: 50 },
      liftRules: { ore: { keepGround: 250, direction: "up" } },
      buildings: { mine: 1, power_plant: 1, farm: 1, habitat: 1, shipyard: 1, orbital_dock: 1 },
      queue: [],
      population: 12,
      satisfaction: 80,
      ships: { cargo_small: 2 },
      shipsBusy: [],
      shipQueue: [],
    });
    this.markExplored(empire, planet.systemId);
    this.logger.info(
      `[game] colonie mère fondée sur ${planet.name} (habitabilité ${planet.habitability}) pour « ${empire.name} »`,
    );
  }

  insertColony(empire: Empire, colony: Colony): void {
    colony.ownerId = empire.id;
    empire.colonyMap.set(colony.id, colony);
    this.colonyRepo.insert(colony);
  }

  async loadColonies(): Promise<void> {
    for (const colony of await this.colonyRepo.loadAll(this.runtime.defaultEmpire.id)) {
      const empire = this.runtime.empires.get(colony.ownerId!) ?? this.runtime.defaultEmpire;
      empire.colonyMap.set(colony.id, colony);
    }
  }

  /**
   * Le nouvel arrivant est posé dans une **galaxie de départ** — la plus proche du
   * centre ayant encore de la place, en préférant celles déjà peuplées : les joueurs
   * se retrouvent voisins, avec commerce, frontières et PvP dès les premières heures.
   * Dans cette galaxie, on prend la planète la plus habitable d'un système vierge
   * (brouillards disjoints). L'univers s'étend si plus aucune galaxie n'a de place.
   */
  private pickHomePlanet(): Planet | null {
    const starter = pickStarterGalaxy(this.galaxyOccupancy());
    if (starter === null) {
      // Plus une seule place : ouvrir la frontière, puis viser la première galaxie neuve.
      const before = this.runtime.universe.galaxies.length;
      this.growUniverse(1);
      if (this.runtime.universe.galaxies.length === before) return null; // plafond atteint
      return this.pickHomePlanet();
    }

    const occupiedPlanets = new Set<string>();
    const occupiedSystems = new Set<string>();
    for (const e of this.runtime.empires.values()) {
      for (const c of e.colonyMap.values()) {
        occupiedPlanets.add(c.planetId);
        const sys = this.runtime.planetsById.get(c.planetId)?.systemId;
        if (sys) occupiedSystems.add(sys);
      }
    }
    const candidates = this.runtime.universe.galaxies[starter]!.systems.flatMap((s) => s.planets)
      .filter((p) => p.type !== "gas" && !occupiedPlanets.has(p.id))
      .sort((a, b) => b.habitability - a.habitability);
    const freeSystem = candidates.filter((p) => !occupiedSystems.has(p.systemId));
    return freeSystem[0] ?? candidates[0] ?? null;
  }

  /**
   * Instancie un nouvel empire : ligne `players` + colonie mère dans sa galaxie de
   * départ (brouillard isolé). Retourne l'`Empire`, ou `null` si l'univers ne peut
   * plus accueillir personne (plafond de galaxies atteint).
   */
  private createEmpire(
    id: string,
    name?: string,
    accountId: string | null = null,
    kind: "human" | "npc" = "human",
  ): Empire | null {
    const home = this.pickHomePlanet();
    if (!home) return null;

    const index = this.runtime.empires.size;
    const empireName = (name?.trim() || `Empire ${index + 1}`).slice(0, 40);
    const color = DEV_EMPIRE_COLORS[index % DEV_EMPIRE_COLORS.length]!;
    this.playerRepo.insert({ id, accountId, kind, name: empireName, color });
    const empire = new Empire(id, empireName, color, accountId, kind);
    this.runtime.empires.set(id, empire);
    this.foundHomeColony(empire, home);
    this.seedStarterBlueprints(empire);
    // L'arrivant peut avoir entamé la dernière galaxie vierge : on repousse le bord.
    this.ensureFrontier();
    this.notify();
    this.logger.info(
      `[game] empire « ${empireName} » instancié (${this.runtime.empires.size} au total)`,
    );
    return empire;
  }

  /**
   * Amorce quelques empires PNJ si le monde n'en a encore aucun (chantier 14) : le
   * monde n'est plus vide au premier tick, l'IA économique (`npcTick`) les fait vivre
   * ensuite. Public et idempotent (compte les PNJ déjà présents plutôt que de dépendre
   * d'un flag « partie neuve ») : le serveur peut l'appeler à chaque boot sans jamais
   * doubler la population, y compris pour une partie créée avant ce chantier. Distinct
   * de `load()` à dessein — les tests qui n'en ont pas besoin restent à un seul empire.
   */
  ensureNpcPopulation(count = NPC_EMPIRE_COUNT): void {
    const existing = [...this.runtime.empires.values()].filter((e) => e.kind === "npc").length;
    for (let i = existing; i < count; i++) {
      const name = NPC_EMPIRE_NAMES[i % NPC_EMPIRE_NAMES.length]!;
      this.createEmpire(randomUUID(), name, null, "npc");
    }
  }

  /**
   * Empire piloté par un compte (chantier 8). null si le compte n'a pas encore d'empire
   * dans cette partie — l'inscription en crée un via `createEmpireForAccount`.
   */
  empireForAccount(accountId: string): Empire | null {
    for (const empire of this.runtime.empires.values()) {
      if (empire.accountId === accountId) return empire;
    }
    return null;
  }

  /**
   * Rattache un empire à un compte fraîchement inscrit. Le premier compte **adopte**
   * l'empire amorcé au boot (sa colonie mère et son brouillard) plutôt que d'en créer un
   * second, qui laisserait un empire fantôme sur la meilleure planète. Les suivants
   * obtiennent un empire neuf. null si l'univers n'a plus de planète d'accueil.
   */
  createEmpireForAccount(accountId: string, name?: string): Empire | null {
    const existing = this.empireForAccount(accountId);
    if (existing) return existing;

    // "human" exclut les PNJ (chantier 14) : sans ce filtre, la deuxième inscription
    // pourrait adopter un empire piloté par l'IA au lieu de l'empire amorcé au boot.
    const orphan = [...this.runtime.empires.values()].find(
      (e) => e.accountId === null && e.kind === "human",
    );
    if (orphan) {
      orphan.accountId = accountId;
      const empireName = name?.trim().slice(0, 40);
      if (empireName) orphan.name = empireName;
      this.playerRepo.adopt(orphan);
      this.logger.info(`[game] empire « ${orphan.name} » adopté par un compte`);
      this.notify();
      return orphan;
    }
    return this.createEmpire(randomUUID(), name, accountId);
  }

  /** Empire par son id (outils de dev). */
  empireById(id: string): Empire | null {
    return this.runtime.empires.get(id) ?? null;
  }

  /** Outil de dev uniquement : instancie un empire supplémentaire. Retourne son id. */
  devSpawnEmpire(name?: string): string | null {
    return this.createEmpire(randomUUID(), name)?.id ?? null;
  }

  /** Outil de dev uniquement : instancie un empire PNJ (chantier 14). Retourne son id. */
  devSpawnNpcEmpire(name?: string): string | null {
    return this.createEmpire(randomUUID(), name, null, "npc")?.id ?? null;
  }

  /** Outil de dev uniquement : résumé par empire (état en mémoire) pour l'observation. */
  devEmpireSummaries(): unknown {
    return [...this.runtime.empires.values()].map((e) => this.summarizeEmpire(e));
  }

  /**
   * Résumé d'un empire par compte propriétaire (admin, chantier 23.3) — même forme que
   * `devEmpireSummaries()`, scopée à un seul empire. null si le compte n'a pas encore
   * d'empire dans cette partie.
   */
  empireSummaryForAccount(accountId: string): unknown | null {
    const empire = this.empireForAccount(accountId);
    return empire ? this.summarizeEmpire(empire) : null;
  }

  private summarizeEmpire(e: Empire) {
    return {
      id: e.id,
      name: e.name,
      color: e.color,
      kind: e.kind,
      isDefault: e.id === this.runtime.defaultEmpire.id,
      influence: Math.round(e.influence * 100) / 100,
      researched: e.researched.length,
      claimed: e.claimedSystemIds.length,
      exploredCount: e.explored.size,
      exploredSystemIds: [...e.explored],
      colonies: [...e.colonyMap.values()].map((c) => ({
        name: c.name,
        systemId: this.runtime.planetsById.get(c.planetId)?.systemId ?? "?",
        population: Math.round(c.population * 100) / 100,
        credits: Math.round(c.resources.credits),
        ore: Math.round(c.resources.ore),
        energy: Math.round(c.resources.energy),
        food: Math.round(c.resources.food),
      })),
      fleets: e.fleetMap.size,
    };
  }

  /** Outil de dev uniquement : injecte des ressources pour tester sans attendre. */
  devGrant(resources: Partial<Record<ResourceId, number>>): void {
    const colony = [...this.runtime.defaultEmpire.colonyMap.values()][0];
    if (!colony) return;
    const updated = { ...colony.resources };
    for (const [res, amount] of Object.entries(resources) as [ResourceId, number][]) {
      updated[res] = (updated[res] ?? 0) + amount;
    }
    this.runtime.defaultEmpire.colonyMap.set(colony.id, { ...colony, resources: updated });
    this.colonyRepo.save(this.runtime.defaultEmpire.colonyMap.get(colony.id)!);
    this.notify();
  }
}
