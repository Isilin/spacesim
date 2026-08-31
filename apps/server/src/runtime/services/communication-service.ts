import {
  CHAT_KEEP,
  MAIL_KEEP,
  type ChatMessage,
  type ChatScope,
  type EmpireEventDraft,
  type Mail,
} from "@spacesim/shared";
import { randomUUID } from "node:crypto";
import type { Empire } from "../../empire.js";
import type { GameRuntime } from "../game-runtime.js";
import { channelsForEmpire } from "../projections.js";
import type { Logger } from "../logger.js";
import { CommunicationRepository } from "../repositories/communication-repository.js";

/**
 * Canaux de discussion et courrier (chantiers 32.14-32.15).
 *
 * Voir [ADR 0010](../../../../../docs/adr/0010-communication-canaux-bornes-et-courrier.md) :
 * l'appartenance à un canal se DÉRIVE de l'état du jeu (membres de la corporation,
 * colonies dans la galaxie) et ne s'abonne pas ; un canal est borné et jetable, alors que
 * le journal d'empire ne purge jamais un non-lu.
 *
 * Le silence est vérifié ICI, à l'envoi. Masquer le champ de saisie côté client est un
 * confort, jamais la mesure.
 */
export class CommunicationService {
  private readonly repo: CommunicationRepository;

  constructor(
    private readonly runtime: GameRuntime,
    private readonly notify: () => void,
    private readonly logger: Logger,
    private readonly emit: (draft: EmpireEventDraft) => void,
    /** Compte réduit au silence — lu depuis l'historique de sanctions (chantier 32.16). */
    private readonly isMuted: (empire: Empire) => boolean,
  ) {
    this.repo = new CommunicationRepository(runtime.clock.id, runtime.writeSet);
  }

  async loadCommunication(): Promise<void> {
    for (const message of await this.repo.loadMessages()) {
      this.channelOf(message.scope, message.scopeId).push(message);
    }
    for (const list of this.runtime.chatByChannel.values()) {
      list.sort((a, b) => a.sentAt - b.sentAt);
    }
    for (const mail of await this.repo.loadMails()) {
      this.mailboxOf(mail.toEmpireId).push(mail);
    }
    for (const list of this.runtime.mailsByEmpire.values()) {
      list.sort((a, b) => a.sentAt - b.sentAt);
    }
  }

  /** Clé de canal — le lieu, pas un abonnement. */
  private static key(scope: ChatScope, scopeId: string): string {
    return `${scope}:${scopeId}`;
  }

  private channelOf(scope: ChatScope, scopeId: string): ChatMessage[] {
    const key = CommunicationService.key(scope, scopeId);
    let list = this.runtime.chatByChannel.get(key);
    if (!list) {
      list = [];
      this.runtime.chatByChannel.set(key, list);
    }
    return list;
  }

  private mailboxOf(empireId: string): Mail[] {
    let list = this.runtime.mailsByEmpire.get(empireId);
    if (!list) {
      list = [];
      this.runtime.mailsByEmpire.set(empireId, list);
    }
    return list;
  }

  /**
   * Canaux de l'empire — délégué à la projection, qui est déjà l'endroit où le snapshot
   * pose la même question. Une seule dérivation : deux copies finiraient par diverger et
   * un joueur pourrait écrire dans un canal qu'il ne reçoit plus.
   */
  channelsOf(empire: Empire): { scope: ChatScope; scopeId: string }[] {
    return channelsForEmpire(this.runtime, empire);
  }

  private belongsTo(
    empire: Empire,
    scope: ChatScope,
    scopeId: string,
  ): boolean {
    return this.channelsOf(empire).some(
      (c) => c.scope === scope && c.scopeId === scopeId,
    );
  }

  /** Action joueur : parler dans un canal auquel on appartient. */
  sendChatMessage(
    empire: Empire,
    scope: ChatScope,
    scopeId: string,
    body: string,
  ): string | null {
    if (this.isMuted(empire)) return "Vous êtes réduit au silence";
    if (!this.belongsTo(empire, scope, scopeId))
      return "Vous n'appartenez pas à ce canal";
    const text = body.trim();
    if (!text) return "Message vide";

    const message: ChatMessage = {
      id: randomUUID(),
      scope,
      scopeId,
      authorEmpireId: empire.id,
      authorName: empire.name,
      body: text,
      sentAt: Date.now(),
    };
    const list = this.channelOf(scope, scopeId);
    list.push(message);
    this.repo.saveMessage(message);
    // Purge inconditionnelle, à la différence du journal : personne ne relit une
    // conversation vieille de deux cents messages, et rien n'y est irremplaçable.
    while (list.length > CHAT_KEEP) {
      const dropped = list.shift();
      if (dropped) this.repo.deleteMessage(dropped.id);
    }
    this.notify();
    return null;
  }

  /** Action joueur : écrire à un empire. L'arrivée est signalée par le journal. */
  sendMail(
    empire: Empire,
    toEmpireId: string,
    subject: string,
    body: string,
  ): string | null {
    if (this.isMuted(empire)) return "Vous êtes réduit au silence";
    if (toEmpireId === empire.id) return "Destinataire invalide";
    const target = this.runtime.empires.get(toEmpireId);
    if (!target) return "Empire inconnu";
    // Les PNJ n'ont personne pour lire (ADR 0010).
    if (target.kind !== "human") return "Cet empire ne reçoit pas de courrier";

    const mail: Mail = {
      id: randomUUID(),
      fromEmpireId: empire.id,
      fromName: empire.name,
      toEmpireId,
      subject: subject.trim(),
      body: body.trim(),
      sentAt: Date.now(),
      readAt: null,
    };
    const box = this.mailboxOf(toEmpireId);
    box.push(mail);
    this.repo.saveMail(mail);
    this.prune(box);
    // Une seule pastille à tenir cohérente : le journal prévient, la boîte conserve.
    this.emit({
      empireId: toEmpireId,
      kind: "mail_received",
      otherName: empire.name,
    });
    this.notify();
    return null;
  }

  /** Même règle que le journal : les plus anciens LUS partent, jamais un non-lu. */
  private prune(box: Mail[]): void {
    let excess = box.length - MAIL_KEEP;
    if (excess <= 0) return;
    for (let i = 0; i < box.length && excess > 0; i++) {
      const mail = box[i];
      if (!mail || mail.readAt === null) continue;
      this.repo.deleteMail(mail.id);
      box.splice(i, 1);
      i--;
      excess--;
    }
  }

  markMailRead(empireId: string, mailId: string): void {
    const box = this.runtime.mailsByEmpire.get(empireId);
    const index = box?.findIndex((m) => m.id === mailId) ?? -1;
    if (!box || index < 0) return;
    const mail = box[index];
    if (!mail || mail.readAt !== null) return;
    const next: Mail = { ...mail, readAt: Date.now() };
    box[index] = next;
    this.repo.saveMail(next);
    this.notify();
  }

  /** Le destinataire seul peut jeter son courrier — l'expéditeur n'en garde pas de copie. */
  deleteMail(empireId: string, mailId: string): void {
    const box = this.runtime.mailsByEmpire.get(empireId);
    const index = box?.findIndex((m) => m.id === mailId) ?? -1;
    if (!box || index < 0) return;
    box.splice(index, 1);
    this.repo.deleteMail(mailId);
    this.notify();
  }

  /** Journalise un silence appliqué — trace côté jeu d'une décision prise côté admin. */
  logMuted(empireName: string): void {
    this.logger.info(`[game] « ${empireName} » ne peut plus parler`);
  }
}
