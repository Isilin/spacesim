import {
  EMPIRE_EVENT_KEEP,
  type EmpireEvent,
  type EmpireEventDraft,
} from "@spacesim/shared";
import { randomUUID } from "node:crypto";
import type { GameRuntime } from "../game-runtime.js";
import type { Logger } from "../logger.js";
import { EmpireEventRepository } from "../repositories/empire-event-repository.js";

/**
 * Boîte de réception d'empire (chantier 32.3) : émission, marquage lu, purge bornée.
 *
 * Domaine isolé — aucune dépendance vers les autres services. La relation est inverse :
 * ce sont eux qui reçoivent un `emit` injecté par `composeEngine`, au même titre que
 * `persistColony` ([ADR 0001](../../../../../docs/adr/0001-composition-explicite-sans-conteneur-di.md)).
 * Voir [ADR 0008](../../../../../docs/adr/0008-journal-d-evenements-d-empire.md) pour le
 * pourquoi du journal lui-même.
 */
export class InboxService {
  private readonly repo: EmpireEventRepository;

  constructor(
    private readonly runtime: GameRuntime,
    private readonly notify: () => void,
    private readonly logger: Logger,
  ) {
    this.repo = new EmpireEventRepository(runtime.clock.id, runtime.writeSet);
  }

  async loadEvents(): Promise<void> {
    for (const event of await this.repo.loadAll()) {
      this.listOf(event.empireId).push(event);
    }
    // Tri à la fin plutôt qu'à l'insertion : `loadAll` ne garantit aucun ordre, et
    // trier une fois par empire coûte moins qu'une insertion ordonnée par ligne.
    for (const list of this.runtime.eventsByEmpire.values()) {
      list.sort((a, b) => a.createdAt - b.createdAt);
    }
  }

  private listOf(empireId: string): EmpireEvent[] {
    let list = this.runtime.eventsByEmpire.get(empireId);
    if (!list) {
      list = [];
      this.runtime.eventsByEmpire.set(empireId, list);
    }
    return list;
  }

  /**
   * Ajoute une entrée au journal d'un empire.
   *
   * Ne notifie PAS : l'émission se produit au milieu d'un tick ou d'une commande, dont
   * le service appelant fait déjà le `notify` à sa frontière. Notifier ici enverrait un
   * snapshot par événement — une bataille en produit déjà deux.
   */
  emit(draft: EmpireEventDraft): EmpireEvent {
    const event: EmpireEvent = {
      id: randomUUID(),
      createdAt: Date.now(),
      readAt: null,
      ...draft,
    };
    const list = this.listOf(event.empireId);
    list.push(event);
    this.repo.insert(event);
    this.prune(list);
    return event;
  }

  /**
   * Ramène le journal d'un empire sous `EMPIRE_EVENT_KEEP` en jetant les plus anciens
   * **déjà lus**. Les non-lus survivent quel que soit leur âge : ce sont exactement ceux
   * qu'un joueur absent doit retrouver, et c'est toute la raison d'être du journal. Un
   * empire qui ne lit jamais rien garde donc un journal qui croît — c'est voulu, et
   * l'anomalie est alors dans son absence, pas dans la borne.
   */
  private prune(list: EmpireEvent[]): void {
    let excess = list.length - EMPIRE_EVENT_KEEP;
    if (excess <= 0) return;
    for (let i = 0; i < list.length && excess > 0; i++) {
      const event = list[i];
      if (!event || event.readAt === null) continue;
      this.repo.delete(event.id);
      list.splice(i, 1);
      i--;
      excess--;
    }
  }

  /** Marque une entrée lue. Silencieux si elle n'appartient pas à l'empire — un id
   *  d'événement d'autrui ne doit rien révéler, pas même son existence. */
  markRead(empireId: string, eventId: string): void {
    const list = this.runtime.eventsByEmpire.get(empireId);
    const index = list?.findIndex((e) => e.id === eventId) ?? -1;
    if (!list || index < 0) return;
    const event = list[index];
    if (!event || event.readAt !== null) return;
    const next: EmpireEvent = { ...event, readAt: Date.now() };
    list[index] = next;
    this.repo.save(next);
    this.notify();
  }

  markAllRead(empireId: string): void {
    const list = this.runtime.eventsByEmpire.get(empireId);
    if (!list) return;
    const now = Date.now();
    let changed = 0;
    for (let i = 0; i < list.length; i++) {
      const event = list[i];
      if (!event || event.readAt !== null) continue;
      const next: EmpireEvent = { ...event, readAt: now };
      list[i] = next;
      this.repo.save(next);
      changed++;
    }
    if (changed === 0) return;
    this.prune(list);
    this.logger.info(`[game] ${changed} événement(s) marqués lus`);
    this.notify();
  }
}
