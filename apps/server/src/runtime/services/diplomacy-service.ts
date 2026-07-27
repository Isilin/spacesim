import {
  breakRelationReason,
  createRng,
  DECLARE_WAR_INFLUENCE_COST,
  declareWarReason,
  FACTION_IDS,
  FACTIONS,
  fleetPower,
  generateObjectiveSpec,
  MAX_OPEN_OBJECTIVES_PER_EMPIRE,
  makePeaceReason,
  npcAcceptsProposal,
  objectiveMet,
  OBJECTIVE_DURATION_MS,
  proposeRelationReason,
  relationKey,
  rollWorldEvent,
  WAR_COOLDOWN_MS,
  WORLD_EVENT_DURATION_MS,
  type Colony,
  type FactionId,
  type FactionState,
  type FleetComposition,
  type Objective,
  type ObjectiveKind,
  type ProposalKind,
  type Relation,
  type RelationProposal,
  type RelationState,
  type WorldEvent,
  type WorldEventKind,
} from "@spacesim/shared";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, schema } from "../../db/index.js";
import type { Empire } from "../../empire.js";
import { objectivesForEmpire } from "../projections.js";
import type { GameRuntime } from "../game-runtime.js";
import type { Logger } from "../logger.js";

/**
 * Diplomatie (chantier 16), objectifs éphémères (chantier 17) et événements de monde
 * (chantier 17, y compris l'humeur de faction). Seul `persistColony` est injecté
 * (récompense d'objectif) : ce domaine n'a par ailleurs aucune dépendance externe.
 */
export class DiplomacyService {
  constructor(
    private readonly runtime: GameRuntime,
    private readonly notify: () => void,
    private readonly logger: Logger,
    private readonly persistColony: (colony: Colony) => void,
  ) {}

  // ─────────────────────────── Diplomatie (chantier 16) ───────────────────────────

  /** Relation entre deux empires, "neutre" par défaut en l'absence de ligne. */
  private relationEntry(a: string, b: string): Relation {
    return (
      this.runtime.relationMap.get(relationKey(a, b)) ?? {
        empireA: a < b ? a : b,
        empireB: a < b ? b : a,
        state: "neutral",
        since: 0,
        until: null,
      }
    );
  }

  /** Deux empires sont-ils en guerre ? */
  atWar(a: string, b: string): boolean {
    return this.relationEntry(a, b).state === "war";
  }

  /** Écrit une relation (créée ou mise à jour), symétrique et persistée. */
  private setRelation(a: string, b: string, state: RelationState, until: number | null): void {
    const key = relationKey(a, b);
    const existed = this.runtime.relationMap.has(key);
    const [empireA, empireB] = a < b ? [a, b] : [b, a];
    const relation: Relation = { empireA, empireB, state, since: Date.now(), until };
    this.runtime.relationMap.set(key, relation);
    if (existed) this.persistRelation(relation);
    else this.insertRelation(relation);
  }

  loadRelations(): void {
    for (const row of db.select().from(schema.relations).all()) {
      this.runtime.relationMap.set(relationKey(row.empireA, row.empireB), {
        empireA: row.empireA,
        empireB: row.empireB,
        state: row.state as RelationState,
        since: row.since,
        until: row.until,
      });
    }
  }

  private insertRelation(relation: Relation): void {
    db.insert(schema.relations)
      .values({
        gameId: this.runtime.clock.id,
        empireA: relation.empireA,
        empireB: relation.empireB,
        state: relation.state,
        since: relation.since,
        until: relation.until,
      })
      .run();
  }

  persistRelation(relation: Relation): void {
    db.update(schema.relations)
      .set({ state: relation.state, since: relation.since, until: relation.until })
      .where(
        and(
          eq(schema.relations.empireA, relation.empireA),
          eq(schema.relations.empireB, relation.empireB),
        ),
      )
      .run();
  }

  /** Action joueur : déclarer la guerre à un empire — unilatérale, mais coûteuse en influence. */
  declareWar(empire: Empire, targetEmpireId: string): string | null {
    if (targetEmpireId === empire.id) return "Cible invalide";
    const target = this.runtime.empires.get(targetEmpireId);
    if (!target) return "Empire inconnu";
    const current = this.relationEntry(empire.id, targetEmpireId);
    const reason = declareWarReason(current.state, Date.now(), current.until);
    if (reason) return reason;
    if (empire.influence < DECLARE_WAR_INFLUENCE_COST) {
      return `Influence insuffisante (${Math.floor(empire.influence)}/${DECLARE_WAR_INFLUENCE_COST})`;
    }
    empire.influence -= DECLARE_WAR_INFLUENCE_COST;
    this.setRelation(empire.id, targetEmpireId, "war", null);
    this.logger.info(`[game] « ${empire.name} » déclare la guerre à « ${target.name} »`);
    this.notify();
    return null;
  }

  /** Action joueur : faire la paix avec un empire — rouvre un cooldown avant re-déclaration. */
  makePeace(empire: Empire, targetEmpireId: string): string | null {
    if (targetEmpireId === empire.id) return "Cible invalide";
    const current = this.relationEntry(empire.id, targetEmpireId);
    const reason = makePeaceReason(current.state);
    if (reason) return reason;
    this.setRelation(empire.id, targetEmpireId, "neutral", Date.now() + WAR_COOLDOWN_MS);
    this.notify();
    return null;
  }

  /** Puissance de flotte totale d'un empire (somme de toutes ses flottes). */
  private empireFleetPower(empire: Empire): number {
    let power = 0;
    for (const fleet of empire.fleetMap.values())
      power += fleetPower(fleet.ships as FleetComposition);
    return power;
  }

  /** Action joueur : proposer un pacte (NAP ou alliance) — exige le consentement de la cible. */
  proposeRelation(empire: Empire, targetEmpireId: string, kind: ProposalKind): string | null {
    if (targetEmpireId === empire.id) return "Cible invalide";
    const target = this.runtime.empires.get(targetEmpireId);
    if (!target) return "Empire inconnu";
    const current = this.relationEntry(empire.id, targetEmpireId).state;
    const reason = proposeRelationReason(current, kind);
    if (reason) return reason;
    const key = relationKey(empire.id, targetEmpireId);
    const alreadyPending = [...this.runtime.proposalMap.values()].some(
      (p) => relationKey(p.fromEmpireId, p.toEmpireId) === key,
    );
    if (alreadyPending) return "Une proposition est déjà en attente entre ces deux empires";

    const proposal: RelationProposal = {
      id: randomUUID(),
      fromEmpireId: empire.id,
      toEmpireId: targetEmpireId,
      kind,
      createdAt: Date.now(),
    };
    this.runtime.proposalMap.set(proposal.id, proposal);
    this.insertProposal(proposal);
    // Un PNJ ne « joue » jamais : il répond tout de suite, pas d'attente indéfinie.
    if (target.kind === "npc") {
      this.resolveProposal(
        proposal,
        npcAcceptsProposal(kind, this.empireFleetPower(target), this.empireFleetPower(empire)),
      );
    }
    this.notify();
    return null;
  }

  /** Action joueur : répondre (accepter/refuser) une proposition qui lui est adressée. */
  respondRelation(empire: Empire, proposalId: string, accept: boolean): string | null {
    const proposal = this.runtime.proposalMap.get(proposalId);
    if (!proposal || proposal.toEmpireId !== empire.id) return "Proposition inconnue";
    this.resolveProposal(proposal, accept);
    this.notify();
    return null;
  }

  /** Action joueur : retirer sa propre proposition avant qu'elle ne reçoive de réponse. */
  cancelProposal(empire: Empire, proposalId: string): string | null {
    const proposal = this.runtime.proposalMap.get(proposalId);
    if (!proposal || proposal.fromEmpireId !== empire.id) return "Proposition inconnue";
    this.runtime.proposalMap.delete(proposalId);
    this.deleteProposal(proposalId);
    this.notify();
    return null;
  }

  /** Action joueur : rompre un pacte (NAP ou alliance) en vigueur — retour à neutre. */
  breakRelation(empire: Empire, targetEmpireId: string): string | null {
    if (targetEmpireId === empire.id) return "Cible invalide";
    const current = this.relationEntry(empire.id, targetEmpireId).state;
    const reason = breakRelationReason(current);
    if (reason) return reason;
    this.setRelation(empire.id, targetEmpireId, "neutral", null);
    this.notify();
    return null;
  }

  /** Accepte ou refuse une proposition en attente, et la retire dans tous les cas. */
  private resolveProposal(proposal: RelationProposal, accept: boolean): void {
    this.runtime.proposalMap.delete(proposal.id);
    this.deleteProposal(proposal.id);
    if (accept) this.setRelation(proposal.fromEmpireId, proposal.toEmpireId, proposal.kind, null);
  }

  loadProposals(): void {
    for (const row of db.select().from(schema.relationProposals).all()) {
      this.runtime.proposalMap.set(row.id, {
        id: row.id,
        fromEmpireId: row.fromEmpireId,
        toEmpireId: row.toEmpireId,
        kind: row.kind as ProposalKind,
        createdAt: row.createdAt,
      });
    }
  }

  private insertProposal(proposal: RelationProposal): void {
    db.insert(schema.relationProposals)
      .values({
        id: proposal.id,
        gameId: this.runtime.clock.id,
        fromEmpireId: proposal.fromEmpireId,
        toEmpireId: proposal.toEmpireId,
        kind: proposal.kind,
        createdAt: proposal.createdAt,
      })
      .run();
  }

  private deleteProposal(id: string): void {
    db.delete(schema.relationProposals).where(eq(schema.relationProposals.id, id)).run();
  }

  // ─────────────────────────── Objectifs éphémères (chantier 17) ───────────────────────────

  loadObjectives(): void {
    for (const row of db.select().from(schema.objectives).all()) {
      this.runtime.objectiveMap.set(row.id, {
        id: row.id,
        empireId: row.empireId,
        kind: row.kind as ObjectiveKind,
        ...(row.targetCount !== null ? { targetCount: row.targetCount } : {}),
        ...(row.targetSystemId !== null ? { targetSystemId: row.targetSystemId } : {}),
        reward: row.reward,
        createdAt: row.createdAt,
        deadline: row.deadline,
        status: row.status as Objective["status"],
      });
    }
  }

  private insertObjective(objective: Objective): void {
    db.insert(schema.objectives)
      .values({
        id: objective.id,
        gameId: this.runtime.clock.id,
        empireId: objective.empireId,
        kind: objective.kind,
        targetCount: objective.targetCount ?? null,
        targetSystemId: objective.targetSystemId ?? null,
        reward: objective.reward,
        createdAt: objective.createdAt,
        deadline: objective.deadline,
        status: objective.status,
      })
      .run();
  }

  persistObjective(objective: Objective): void {
    db.update(schema.objectives)
      .set({ status: objective.status, deadline: objective.deadline })
      .where(eq(schema.objectives.id, objective.id))
      .run();
  }

  /** Empires en tête de population/influence — sert à évaluer lead_population/lead_influence. */
  private empireLeaders(): { populationLeaderId: string | null; influenceLeaderId: string | null } {
    let popLeader: { id: string; value: number } | null = null;
    let infLeader: { id: string; value: number } | null = null;
    for (const empire of this.runtime.empires.values()) {
      const population = [...empire.colonyMap.values()].reduce((s, c) => s + c.population, 0);
      if (!popLeader || population > popLeader.value)
        popLeader = { id: empire.id, value: population };
      if (!infLeader || empire.influence > infLeader.value)
        infLeader = { id: empire.id, value: empire.influence };
    }
    return { populationLeaderId: popLeader?.id ?? null, influenceLeaderId: infLeader?.id ?? null };
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
      const lastCreatedAt = mine.reduce((max, o) => Math.max(max, o.createdAt), 0);
      if (lastCreatedAt > 0 && now - lastCreatedAt < OBJECTIVE_DURATION_MS) continue;
      const rng = createRng(`objective-${this.runtime.clock.seed}-${empire.id}-${tickNumber}`);
      const spec = generateObjectiveSpec(rng, now, empire.colonyMap.size, empire.claimedSystemIds);
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
        this.logger.info(`[game] « ${empire.name} » a rempli son objectif : ${objective.kind}`);
      } else if (t >= objective.deadline) {
        const next: Objective = { ...objective, status: "expired" };
        this.runtime.objectiveMap.set(id, next);
        this.persistObjective(next);
      }
    }
  }

  // ─────────────────────────── Événements de monde (chantier 17) ───────────────────────────

  loadWorldEvents(): void {
    for (const row of db.select().from(schema.worldEvents).all()) {
      this.runtime.worldEventMap.set(row.id, {
        id: row.id,
        kind: row.kind as WorldEventKind,
        ...(row.galaxyId !== null ? { galaxyId: row.galaxyId } : {}),
        ...(row.factionId !== null ? { factionId: row.factionId } : {}),
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
      });
    }
  }

  private insertWorldEvent(event: WorldEvent): void {
    db.insert(schema.worldEvents)
      .values({
        id: event.id,
        gameId: this.runtime.clock.id,
        kind: event.kind,
        galaxyId: event.galaxyId ?? null,
        factionId: event.factionId ?? null,
        createdAt: event.createdAt,
        expiresAt: event.expiresAt,
      })
      .run();
  }

  /** Retire les événements de monde expirés (pas de statut : ils disparaissent, point). */
  resolveWorldEvents(t: number): void {
    for (const [id, event] of this.runtime.worldEventMap) {
      if (t < event.expiresAt) continue;
      this.runtime.worldEventMap.delete(id);
      db.delete(schema.worldEvents).where(eq(schema.worldEvents.id, id)).run();
    }
  }

  /** Kinds d'événements de monde actifs sur une galaxie (bonus/malus de prix, spawn pirate). */
  worldEventKindsOnGalaxy(galaxyId: string): WorldEventKind[] {
    return [...this.runtime.worldEventMap.values()]
      .filter((e) => e.galaxyId === galaxyId)
      .map((e) => e.kind);
  }

  /** Tire un nouvel événement de monde et l'applique — cadence lente, un à la fois par cible. */
  worldEventTick(tickNumber: number, now: number): void {
    const rng = createRng(`worldevent-${this.runtime.clock.seed}-${tickNumber}`);
    const kind = rollWorldEvent(rng);
    if (!kind) return;

    if (kind === "faction_boom") {
      const factionId = FACTION_IDS[Math.floor(rng() * FACTION_IDS.length)]!;
      const alreadyActive = [...this.runtime.worldEventMap.values()].some(
        (e) => e.kind === "faction_boom" && e.factionId === factionId,
      );
      if (alreadyActive) return;
      const expiresAt = now + WORLD_EVENT_DURATION_MS;
      const event: WorldEvent = { id: randomUUID(), kind, factionId, createdAt: now, expiresAt };
      this.runtime.worldEventMap.set(event.id, event);
      this.insertWorldEvent(event);
      // Effet immédiat : force le boom, comme une pénurie de faction poste aussitôt un contrat.
      this.setFactionMood(factionId, "boom", expiresAt);
      this.logger.info(`[game] essor de faction : ${FACTIONS[factionId as FactionId].name}`);
      this.notify();
      return;
    }

    // Les trois autres kinds ciblent une galaxie de l'univers déjà généré.
    if (this.runtime.universe.galaxies.length === 0) return;
    const galaxy =
      this.runtime.universe.galaxies[Math.floor(rng() * this.runtime.universe.galaxies.length)]!;
    const alreadyActive = this.worldEventKindsOnGalaxy(galaxy.id).includes(kind);
    if (alreadyActive) return;
    const event: WorldEvent = {
      id: randomUUID(),
      kind,
      galaxyId: galaxy.id,
      createdAt: now,
      expiresAt: now + WORLD_EVENT_DURATION_MS,
    };
    this.runtime.worldEventMap.set(event.id, event);
    this.insertWorldEvent(event);
    this.logger.info(`[game] événement de monde : ${kind} sur ${galaxy.name}`);
    this.notify();
  }

  // ─────────────────────────── Factions (chantier 15) ───────────────────────────

  /** Dote chaque faction d'un état (chantier 15). Idempotent : rejoué sans jamais dédoubler. */
  initFactionStates(): void {
    for (const factionId of FACTION_IDS) {
      if (this.runtime.factionStateMap.has(factionId)) continue;
      const state: FactionState = { factionId, mood: "neutral", moodUntil: null };
      this.runtime.factionStateMap.set(factionId, state);
      this.insertFactionState(state);
    }
  }

  loadFactionStates(): void {
    for (const row of db.select().from(schema.factionStates).all()) {
      this.runtime.factionStateMap.set(row.factionId, {
        factionId: row.factionId,
        mood: row.mood as FactionState["mood"],
        moodUntil: row.moodUntil,
      });
    }
  }

  private insertFactionState(state: FactionState): void {
    db.insert(schema.factionStates)
      .values({
        factionId: state.factionId,
        gameId: this.runtime.clock.id,
        mood: state.mood,
        moodUntil: state.moodUntil,
      })
      .run();
  }

  persistFactionState(state: FactionState): void {
    db.update(schema.factionStates)
      .set({ mood: state.mood, moodUntil: state.moodUntil })
      .where(eq(schema.factionStates.factionId, state.factionId))
      .run();
  }

  /** Force l'humeur d'une faction — partagé entre l'outil de dev et les événements de monde. */
  private setFactionMood(
    factionId: string,
    mood: FactionState["mood"],
    until: number | null,
  ): boolean {
    if (!this.runtime.factionStateMap.has(factionId)) return false;
    const state: FactionState = { factionId, mood, moodUntil: mood === "neutral" ? null : until };
    this.runtime.factionStateMap.set(factionId, state);
    this.persistFactionState(state);
    return true;
  }

  /**
   * Outil de dev uniquement : force l'humeur d'une faction (chantier 15). `onShortage`
   * est injecté (économie PNJ, module Logistics) pour reproduire le même effet de bord
   * qu'une bascule naturelle plutôt que de laisser l'outil de dev mentir dessus.
   */
  devSetFactionMood(
    factionId: string,
    mood: FactionState["mood"],
    durationMs: number,
    onShortage: (factionId: string) => void,
  ): boolean {
    if (!this.setFactionMood(factionId, mood, Date.now() + durationMs)) return false;
    if (mood === "shortage") onShortage(factionId);
    this.notify();
    return true;
  }

  /**
   * Outil de dev uniquement : déclenche un événement de monde (chantier 17). `target`
   * est un id de galaxie (economic_crisis/gold_rush/pirate_surge) ou de faction
   * (faction_boom) ; laissé vide, le premier de l'univers/des factions est pris.
   */
  devTriggerWorldEvent(kind: WorldEventKind, target: string, durationMs: number): string | null {
    const now = Date.now();
    const expiresAt = now + durationMs;
    if (kind === "faction_boom") {
      const factionId = target || FACTION_IDS[0]!;
      if (!this.runtime.factionStateMap.has(factionId)) return null;
      const event: WorldEvent = { id: randomUUID(), kind, factionId, createdAt: now, expiresAt };
      this.runtime.worldEventMap.set(event.id, event);
      this.insertWorldEvent(event);
      this.setFactionMood(factionId, "boom", expiresAt);
      this.notify();
      return event.id;
    }
    const galaxyId = target || this.runtime.universe.galaxies[0]?.id;
    if (!galaxyId || !this.runtime.universe.galaxies.some((g) => g.id === galaxyId)) return null;
    const event: WorldEvent = { id: randomUUID(), kind, galaxyId, createdAt: now, expiresAt };
    this.runtime.worldEventMap.set(event.id, event);
    this.insertWorldEvent(event);
    this.notify();
    return event.id;
  }
}
