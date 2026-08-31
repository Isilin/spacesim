import type {
  Corporation,
  CorporationInvite,
  CorporationMember,
  CorpRole,
} from "@spacesim/shared";
import { eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import type { WriteSet } from "../persistence/write-set.js";

/**
 * Propriétaire unique des trois tables de corporation (chantier 32.7).
 *
 * Trois tables et un seul repository : elles ne vivent que les unes par les autres — une
 * appartenance sans corporation n'a pas de sens, et la cascade de suppression est déjà
 * déclarée en base. Les séparer aurait multiplié les allers-retours au boot sans rien
 * isoler.
 */
export class CorporationRepository {
  constructor(
    private readonly gameId: string,
    private readonly writeSet: WriteSet,
  ) {}

  async loadCorporations(): Promise<Corporation[]> {
    return (await db.select().from(schema.corporations)).map((row) => ({
      id: row.id,
      name: row.name,
      tag: row.tag,
      founderEmpireId: row.founderEmpireId,
      treasury: row.treasury,
      createdAt: row.createdAt,
    }));
  }

  async loadMembers(): Promise<CorporationMember[]> {
    return (await db.select().from(schema.corporationMembers)).map((row) => ({
      corporationId: row.corporationId,
      empireId: row.empireId,
      role: row.role as CorpRole,
      joinedAt: row.joinedAt,
    }));
  }

  async loadInvites(): Promise<CorporationInvite[]> {
    const rows = await db
      .select()
      .from(schema.corporationInvites)
      // Le nom de la corporation est porté par l'invitation dans le modèle mais pas en
      // base : le joindre à la lecture évite une colonne redondante qui divergerait au
      // premier renommage.
      .innerJoin(
        schema.corporations,
        eq(schema.corporationInvites.corporationId, schema.corporations.id),
      );
    return rows.map(({ corporation_invites: invite, corporations: corp }) => ({
      id: invite.id,
      corporationId: invite.corporationId,
      corporationName: corp.name,
      empireId: invite.empireId,
      invitedBy: invite.invitedBy,
      createdAt: invite.createdAt,
    }));
  }

  saveCorporation(corp: Corporation): void {
    this.writeSet.upsert("corporations", corp.id, {
      id: corp.id,
      gameId: this.gameId,
      name: corp.name,
      tag: corp.tag,
      founderEmpireId: corp.founderEmpireId,
      treasury: corp.treasury,
      createdAt: corp.createdAt,
    });
  }

  deleteCorporation(corporationId: string): void {
    this.writeSet.delete("corporations", corporationId);
  }

  saveMember(member: CorporationMember): void {
    this.writeSet.upsert("corporationMembers", member.empireId, {
      empireId: member.empireId,
      gameId: this.gameId,
      corporationId: member.corporationId,
      role: member.role,
      joinedAt: member.joinedAt,
    });
  }

  deleteMember(empireId: string): void {
    this.writeSet.delete("corporationMembers", empireId);
  }

  saveInvite(invite: CorporationInvite): void {
    this.writeSet.upsert("corporationInvites", invite.id, {
      id: invite.id,
      gameId: this.gameId,
      corporationId: invite.corporationId,
      empireId: invite.empireId,
      invitedBy: invite.invitedBy,
      createdAt: invite.createdAt,
    });
  }

  deleteInvite(inviteId: string): void {
    this.writeSet.delete("corporationInvites", inviteId);
  }
}
