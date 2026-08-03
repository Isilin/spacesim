import {
  breakRelationReason,
  createRng,
  DECLARE_WAR_INFLUENCE_COST,
  declareWarReason,
  fleetPower,
  makePeaceReason,
  npcAcceptsProposal,
  proposeRelationReason,
  relationKey,
  rollWorldEvent,
  WAR_COOLDOWN_MS,
  WORLD_EVENT_DURATION_MS,
  type FactionState,
  type FleetComposition,
  type ProposalKind,
  type Relation,
  type RelationProposal,
  type RelationState,
  type WorldEvent,
  type WorldEventKind,
} from "@spacesim/shared";
import { combatDefsFromWarships } from "../content/content-service.js";
import { randomUUID } from "node:crypto";
import type { Empire } from "../../empire.js";
import type { GameRuntime } from "../game-runtime.js";
import type { Logger } from "../logger.js";
import { DiplomacyRepository } from "../repositories/diplomacy-repository.js";
import { FactionRepository } from "../repositories/faction-repository.js";
import { WorldEventRepository } from "../repositories/world-event-repository.js";

/**
 * Diplomatie (chantier 16) et événements de monde + humeur de faction (chantier 17).
 * Les objectifs éphémères vivent dans `ObjectiveService` (domaine isolé, sans
 * couplage). Événements de monde et factions restent ensemble ici : `worldEventTick`/
 * `devTriggerWorldEvent` (cas "faction_boom") appellent directement `setFactionMood`
 * — les séparer exigerait d'injecter ce callback sans bénéfice réel, le fichier
 * restant d'une taille raisonnable.
 */
export class DiplomacyService {
  private readonly relationsRepo: DiplomacyRepository;
  private readonly worldEventRepo: WorldEventRepository;
  private readonly factionRepo: FactionRepository;

  constructor(
    private readonly runtime: GameRuntime,
    private readonly notify: () => void,
    private readonly logger: Logger,
  ) {
    this.relationsRepo = new DiplomacyRepository(
      runtime.clock.id,
      runtime.writeSet,
    );
    this.worldEventRepo = new WorldEventRepository(
      runtime.clock.id,
      runtime.writeSet,
    );
    this.factionRepo = new FactionRepository(
      runtime.clock.id,
      runtime.writeSet,
    );
  }

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
  private setRelation(
    a: string,
    b: string,
    state: RelationState,
    until: number | null,
  ): void {
    const key = relationKey(a, b);
    const existed = this.runtime.relationMap.has(key);
    const [empireA, empireB] = a < b ? [a, b] : [b, a];
    const relation: Relation = {
      empireA,
      empireB,
      state,
      since: Date.now(),
      until,
    };
    this.runtime.relationMap.set(key, relation);
    if (existed) this.persistRelation(relation);
    else this.insertRelation(relation);
  }

  async loadRelations(): Promise<void> {
    for (const relation of await this.relationsRepo.loadRelations()) {
      this.runtime.relationMap.set(
        relationKey(relation.empireA, relation.empireB),
        relation,
      );
    }
  }

  private insertRelation(relation: Relation): void {
    this.relationsRepo.insertRelation(relation);
  }

  persistRelation(relation: Relation): void {
    this.relationsRepo.saveRelation(relation);
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
    this.logger.info(
      `[game] « ${empire.name} » déclare la guerre à « ${target.name} »`,
    );
    this.notify();
    return null;
  }

  /** Action joueur : faire la paix avec un empire — rouvre un cooldown avant re-déclaration. */
  makePeace(empire: Empire, targetEmpireId: string): string | null {
    if (targetEmpireId === empire.id) return "Cible invalide";
    const current = this.relationEntry(empire.id, targetEmpireId);
    const reason = makePeaceReason(current.state);
    if (reason) return reason;
    this.setRelation(
      empire.id,
      targetEmpireId,
      "neutral",
      Date.now() + WAR_COOLDOWN_MS,
    );
    this.notify();
    return null;
  }

  /** Puissance de flotte totale d'un empire (somme de toutes ses flottes). */
  private empireFleetPower(empire: Empire): number {
    const defs = combatDefsFromWarships(this.runtime.content.warships);
    let power = 0;
    for (const fleet of empire.fleetMap.values())
      power += fleetPower(fleet.ships as FleetComposition, defs);
    return power;
  }

  /** Action joueur : proposer un pacte (NAP ou alliance) — exige le consentement de la cible. */
  proposeRelation(
    empire: Empire,
    targetEmpireId: string,
    kind: ProposalKind,
  ): string | null {
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
    if (alreadyPending)
      return "Une proposition est déjà en attente entre ces deux empires";

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
        npcAcceptsProposal(
          kind,
          this.empireFleetPower(target),
          this.empireFleetPower(empire),
        ),
      );
    }
    this.notify();
    return null;
  }

  /** Action joueur : répondre (accepter/refuser) une proposition qui lui est adressée. */
  respondRelation(
    empire: Empire,
    proposalId: string,
    accept: boolean,
  ): string | null {
    const proposal = this.runtime.proposalMap.get(proposalId);
    if (!proposal || proposal.toEmpireId !== empire.id)
      return "Proposition inconnue";
    this.resolveProposal(proposal, accept);
    this.notify();
    return null;
  }

  /** Action joueur : retirer sa propre proposition avant qu'elle ne reçoive de réponse. */
  cancelProposal(empire: Empire, proposalId: string): string | null {
    const proposal = this.runtime.proposalMap.get(proposalId);
    if (!proposal || proposal.fromEmpireId !== empire.id)
      return "Proposition inconnue";
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
    if (accept)
      this.setRelation(
        proposal.fromEmpireId,
        proposal.toEmpireId,
        proposal.kind,
        null,
      );
  }

  async loadProposals(): Promise<void> {
    for (const proposal of await this.relationsRepo.loadProposals()) {
      this.runtime.proposalMap.set(proposal.id, proposal);
    }
  }

  private insertProposal(proposal: RelationProposal): void {
    this.relationsRepo.insertProposal(proposal);
  }

  private deleteProposal(id: string): void {
    this.relationsRepo.removeProposal(id);
  }

  // ─────────────────────────── Événements de monde (chantier 17) ───────────────────────────

  async loadWorldEvents(): Promise<void> {
    for (const event of await this.worldEventRepo.loadAll()) {
      this.runtime.worldEventMap.set(event.id, event);
    }
  }

  private insertWorldEvent(event: WorldEvent): void {
    this.worldEventRepo.insert(event);
  }

  /** Mise à jour d'échéance (décalage dev-fastforward) — la table reste possédée ici. */
  persistWorldEvent(event: WorldEvent): void {
    this.worldEventRepo.save(event);
  }

  /** Retire les événements de monde expirés (pas de statut : ils disparaissent, point). */
  resolveWorldEvents(t: number): void {
    for (const [id, event] of this.runtime.worldEventMap) {
      if (t < event.expiresAt) continue;
      this.runtime.worldEventMap.delete(id);
      this.worldEventRepo.remove(id);
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
    const rng = createRng(
      `worldevent-${this.runtime.clock.seed}-${tickNumber}`,
    );
    const kind = rollWorldEvent(rng);
    if (!kind) return;

    if (kind === "faction_boom") {
      const ids = this.factionIds();
      const factionId = ids[Math.floor(rng() * ids.length)]!;
      const alreadyActive = [...this.runtime.worldEventMap.values()].some(
        (e) => e.kind === "faction_boom" && e.factionId === factionId,
      );
      if (alreadyActive) return;
      const expiresAt = now + WORLD_EVENT_DURATION_MS;
      const event: WorldEvent = {
        id: randomUUID(),
        kind,
        factionId,
        createdAt: now,
        expiresAt,
      };
      this.runtime.worldEventMap.set(event.id, event);
      this.insertWorldEvent(event);
      // Effet immédiat : force le boom, comme une pénurie de faction poste aussitôt un contrat.
      this.setFactionMood(factionId, "boom", expiresAt);
      const name = this.runtime.content.factions[factionId]?.name ?? factionId;
      this.logger.info(`[game] essor de faction : ${name}`);
      this.notify();
      return;
    }

    // Les trois autres kinds ciblent une galaxie de l'univers déjà généré.
    if (this.runtime.universe.galaxies.length === 0) return;
    const galaxy =
      this.runtime.universe.galaxies[
        Math.floor(rng() * this.runtime.universe.galaxies.length)
      ]!;
    const alreadyActive = this.worldEventKindsOnGalaxy(galaxy.id).includes(
      kind,
    );
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

  /** Ids des factions actuellement chargées (contenu DB-backed, chantier 23.6). */
  private factionIds(): string[] {
    return Object.keys(this.runtime.content.factions);
  }

  /** Dote chaque faction d'un état (chantier 15). Idempotent : rejoué sans jamais dédoubler. */
  initFactionStates(): void {
    for (const factionId of this.factionIds()) {
      if (this.runtime.factionStateMap.has(factionId)) continue;
      const state: FactionState = {
        factionId,
        mood: "neutral",
        moodUntil: null,
      };
      this.runtime.factionStateMap.set(factionId, state);
      this.insertFactionState(state);
    }
  }

  async loadFactionStates(): Promise<void> {
    for (const state of await this.factionRepo.loadAll()) {
      this.runtime.factionStateMap.set(state.factionId, state);
    }
  }

  private insertFactionState(state: FactionState): void {
    this.factionRepo.insert(state);
  }

  persistFactionState(state: FactionState): void {
    this.factionRepo.save(state);
  }

  /** Force l'humeur d'une faction — partagé entre l'outil de dev et les événements de monde. */
  private setFactionMood(
    factionId: string,
    mood: FactionState["mood"],
    until: number | null,
  ): boolean {
    if (!this.runtime.factionStateMap.has(factionId)) return false;
    const state: FactionState = {
      factionId,
      mood,
      moodUntil: mood === "neutral" ? null : until,
    };
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
    if (!this.setFactionMood(factionId, mood, Date.now() + durationMs))
      return false;
    if (mood === "shortage") onShortage(factionId);
    this.notify();
    return true;
  }

  /**
   * Outil de dev uniquement : déclenche un événement de monde (chantier 17). `target`
   * est un id de galaxie (economic_crisis/gold_rush/pirate_surge) ou de faction
   * (faction_boom) ; laissé vide, le premier de l'univers/des factions est pris.
   */
  devTriggerWorldEvent(
    kind: WorldEventKind,
    target: string,
    durationMs: number,
  ): string | null {
    const now = Date.now();
    const expiresAt = now + durationMs;
    if (kind === "faction_boom") {
      const factionId = target || this.factionIds()[0]!;
      if (!this.runtime.factionStateMap.has(factionId)) return null;
      const event: WorldEvent = {
        id: randomUUID(),
        kind,
        factionId,
        createdAt: now,
        expiresAt,
      };
      this.runtime.worldEventMap.set(event.id, event);
      this.insertWorldEvent(event);
      this.setFactionMood(factionId, "boom", expiresAt);
      this.notify();
      return event.id;
    }
    const galaxyId = target || this.runtime.universe.galaxies[0]?.id;
    if (
      !galaxyId ||
      !this.runtime.universe.galaxies.some((g) => g.id === galaxyId)
    )
      return null;
    const event: WorldEvent = {
      id: randomUUID(),
      kind,
      galaxyId,
      createdAt: now,
      expiresAt,
    };
    this.runtime.worldEventMap.set(event.id, event);
    this.insertWorldEvent(event);
    this.notify();
    return event.id;
  }

  /**
   * Outil de dev uniquement : décale les échéances de son domaine (dev-fastforward) —
   * humeur de faction, cooldown de guerre, événements de monde. Toutes ces collections
   * sont partagées (`GameRuntime`), pas de paramètre empire.
   */
  shiftTime(deltaMs: number): void {
    for (const [id, state] of this.runtime.factionStateMap) {
      if (state.moodUntil === null) continue;
      const next: FactionState = {
        ...state,
        moodUntil: state.moodUntil - deltaMs,
      };
      this.runtime.factionStateMap.set(id, next);
      this.persistFactionState(next);
    }
    for (const [id, relation] of this.runtime.relationMap) {
      if (relation.until === null) continue;
      const next: Relation = { ...relation, until: relation.until - deltaMs };
      this.runtime.relationMap.set(id, next);
      this.persistRelation(next);
    }
    for (const [id, event] of this.runtime.worldEventMap) {
      const next: WorldEvent = {
        ...event,
        expiresAt: event.expiresAt - deltaMs,
      };
      this.runtime.worldEventMap.set(id, next);
      this.persistWorldEvent(next);
    }
  }
}
