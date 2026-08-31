import {
  createRng,
  generateObjectiveSpec,
  MAX_OPEN_OBJECTIVES_PER_EMPIRE,
  objectiveMet,
  OBJECTIVE_DURATION_MS,
  type Colony,
  type EmpireEventDraft,
  type Objective,
} from "@spacesim/shared";
import { randomUUID } from "node:crypto";
import { objectivesForEmpire } from "../projections.js";
import type { GameRuntime } from "../game-runtime.js";
import type { Logger } from "../logger.js";
import { ObjectiveRepository } from "../repositories/objective-repository.js";

/**
 * Objectifs éphémères personnels (chantier 17) : tirage, validation, expiration.
 * Domaine isolé — aucune dépendance vers diplomatie/événements de monde/factions.
 */
export class ObjectiveService {
  private readonly repo: ObjectiveRepository;

  constructor(
    private readonly runtime: GameRuntime,
    private readonly notify: () => void,
    private readonly logger: Logger,
    private readonly persistColony: (colony: Colony) => void,
    private readonly emit: (draft: EmpireEventDraft) => void,
  ) {
    this.repo = new ObjectiveRepository(runtime.clock.id, runtime.writeSet);
  }

  async loadObjectives(): Promise<void> {
    for (const objective of await this.repo.loadAll()) {
      this.runtime.objectiveMap.set(objective.id, objective);
    }
  }

  private insertObjective(objective: Objective): void {
    this.repo.insert(objective);
  }

  persistObjective(objective: Objective): void {
    this.repo.save(objective);
  }

  /** Empires en tête de population/influence — sert à évaluer lead_population/lead_influence. */
  private empireLeaders(): {
    populationLeaderId: string | null;
    influenceLeaderId: string | null;
  } {
    let popLeader: { id: string; value: number } | null = null;
    let infLeader: { id: string; value: number } | null = null;
    for (const empire of this.runtime.empires.values()) {
      const population = [...empire.colonyMap.values()].reduce(
        (s, c) => s + c.population,
        0,
      );
      if (!popLeader || population > popLeader.value)
        popLeader = { id: empire.id, value: population };
      if (!infLeader || empire.influence > infLeader.value)
        infLeader = { id: empire.id, value: empire.influence };
    }
    return {
      populationLeaderId: popLeader?.id ?? null,
      influenceLeaderId: infLeader?.id ?? null,
    };
  }

  /** Tire un nouvel objectif éphémère pour chaque empire humain qui n'en a pas déjà un ouvert. */
  generateObjectives(tickNumber: number, now: number): void {
    for (const empire of this.runtime.empires.values()) {
      if (empire.kind !== "human") continue;
      const mine = objectivesForEmpire(this.runtime, empire);
      const open = mine.filter((o) => o.status === "open");
      if (open.length >= MAX_OPEN_OBJECTIVES_PER_EMPIRE) continue;
      // Cooldown : pas de nouveau tirage juste après complétion/expiration, sinon un but
      // trivialement déjà vrai (ex. lead_influence en tête depuis longtemps) se rejouerait
      // en boucle à chaque tick éco et verserait sa récompense sans fin.
      const lastCreatedAt = mine.reduce(
        (max, o) => Math.max(max, o.createdAt),
        0,
      );
      if (lastCreatedAt > 0 && now - lastCreatedAt < OBJECTIVE_DURATION_MS)
        continue;
      const rng = createRng(
        `objective-${this.runtime.clock.seed}-${empire.id}-${tickNumber}`,
      );
      const spec = generateObjectiveSpec(
        rng,
        now,
        empire.colonyMap.size,
        empire.claimedSystemIds,
      );
      const objective: Objective = {
        id: randomUUID(),
        empireId: empire.id,
        status: "open",
        ...spec,
      };
      this.runtime.objectiveMap.set(objective.id, objective);
      this.insertObjective(objective);
    }
  }

  /** Valide ou expire les objectifs ouverts, contre l'état courant du jeu. */
  resolveObjectives(t: number): void {
    const { populationLeaderId, influenceLeaderId } = this.empireLeaders();
    for (const [id, objective] of this.runtime.objectiveMap) {
      if (objective.status !== "open") continue;
      const empire = this.runtime.empires.get(objective.empireId);
      if (!empire) continue;
      const met = objectiveMet(objective, {
        colonyCount: empire.colonyMap.size,
        claimedSystemIds: empire.claimedSystemIds,
        leadsPopulation: populationLeaderId === empire.id,
        leadsInfluence: influenceLeaderId === empire.id,
      });
      if (met) {
        const home = [...empire.colonyMap.values()][0];
        if (home) {
          const resources = {
            ...home.resources,
            credits: home.resources.credits + objective.reward,
          };
          empire.colonyMap.set(home.id, { ...home, resources });
          this.persistColony(empire.colonyMap.get(home.id)!);
        }
        const next: Objective = { ...objective, status: "completed" };
        this.runtime.objectiveMap.set(id, next);
        this.persistObjective(next);
        this.emit({
          empireId: empire.id,
          kind: "objective_completed",
          subjectId: objective.kind,
          amount: objective.reward,
        });
        this.logger.info(
          `[game] « ${empire.name} » a rempli son objectif : ${objective.kind}`,
        );
      } else if (t >= objective.deadline) {
        const next: Objective = { ...objective, status: "expired" };
        this.runtime.objectiveMap.set(id, next);
        this.persistObjective(next);
      }
    }
  }

  /** Outil de dev uniquement : décale l'échéance des objectifs ouverts (dev-fastforward). */
  shiftTime(deltaMs: number): void {
    for (const [id, objective] of this.runtime.objectiveMap) {
      if (objective.status !== "open") continue;
      const next: Objective = {
        ...objective,
        deadline: objective.deadline - deltaMs,
      };
      this.runtime.objectiveMap.set(id, next);
      this.persistObjective(next);
    }
  }
}
