import type { ChatMessage, ChatScope, Mail } from "@spacesim/shared";
import { db, schema } from "../../db/index.js";
import type { WriteSet } from "../persistence/write-set.js";

/**
 * Propriétaire unique des tables `chat_messages` et `mails` (chantier 32.13).
 *
 * Les deux vivent dans le même repository parce qu'elles servent le même service et rien
 * d'autre — les séparer aurait produit deux fichiers de dix lignes sans rien isoler.
 */
export class CommunicationRepository {
  constructor(
    private readonly gameId: string,
    private readonly writeSet: WriteSet,
  ) {}

  async loadMessages(): Promise<ChatMessage[]> {
    return (await db.select().from(schema.chatMessages)).map((row) => ({
      id: row.id,
      scope: row.scope as ChatScope,
      scopeId: row.scopeId,
      authorEmpireId: row.authorEmpireId,
      authorName: row.authorName,
      body: row.body,
      sentAt: row.sentAt,
    }));
  }

  async loadMails(): Promise<Mail[]> {
    return (await db.select().from(schema.mails)).map((row) => ({
      id: row.id,
      fromEmpireId: row.fromEmpireId,
      fromName: row.fromName,
      toEmpireId: row.toEmpireId,
      subject: row.subject,
      body: row.body,
      sentAt: row.sentAt,
      readAt: row.readAt,
    }));
  }

  saveMessage(message: ChatMessage): void {
    this.writeSet.upsert("chatMessages", message.id, {
      id: message.id,
      gameId: this.gameId,
      scope: message.scope,
      scopeId: message.scopeId,
      authorEmpireId: message.authorEmpireId,
      authorName: message.authorName,
      body: message.body,
      sentAt: message.sentAt,
    });
  }

  deleteMessage(id: string): void {
    this.writeSet.delete("chatMessages", id);
  }

  saveMail(mail: Mail): void {
    this.writeSet.upsert("mails", mail.id, {
      id: mail.id,
      gameId: this.gameId,
      fromEmpireId: mail.fromEmpireId,
      fromName: mail.fromName,
      toEmpireId: mail.toEmpireId,
      subject: mail.subject,
      body: mail.body,
      sentAt: mail.sentAt,
      readAt: mail.readAt,
    });
  }

  deleteMail(id: string): void {
    this.writeSet.delete("mails", id);
  }
}
