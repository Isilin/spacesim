import {
  corpCan,
  relationKey,
  STANDING_MAX,
  STANDING_MIN,
  type Colony,
  type Corporation,
  type CorporationInvite,
  type CorporationMember,
  type CorpAction,
  type CorpRelation,
  type CorpRole,
  type RelationState,
  type Standing,
  type EmpireEventDraft,
} from "@spacesim/shared";
import { randomUUID } from "node:crypto";
import type { Empire } from "../../empire.js";
import type { GameRuntime } from "../game-runtime.js";
import type { Logger } from "../logger.js";
import { CorporationRepository } from "../repositories/corporation-repository.js";

/**
 * Corporations (chantier 32.8) : fondation, appartenance, rôles, coffre.
 *
 * Voir [ADR 0009](../../../../../docs/adr/0009-corporations-entite-de-premier-rang.md) —
 * entité de premier rang, appartenance exclusive, coffre en crédits seulement.
 *
 * Dépend d'`emit` (journal d'empire) et de `persistColony` : un changement
 * d'appartenance arrive typiquement pendant que le joueur concerné n'est pas là, et les
 * mouvements de coffre passent par les crédits d'une colonie.
 */
export class CorporationService {
  private readonly repo: CorporationRepository;

  constructor(
    private readonly runtime: GameRuntime,
    private readonly notify: () => void,
    private readonly logger: Logger,
    private readonly persistColony: (colony: Colony) => void,
    private readonly emit: (draft: EmpireEventDraft) => void,
  ) {
    this.repo = new CorporationRepository(runtime.clock.id, runtime.writeSet);
  }

  async loadCorporations(): Promise<void> {
    for (const corp of await this.repo.loadCorporations()) {
      this.runtime.corporationMap.set(corp.id, corp);
    }
    for (const member of await this.repo.loadMembers()) {
      this.runtime.corporationMemberMap.set(member.empireId, member);
    }
    for (const invite of await this.repo.loadInvites()) {
      this.runtime.corporationInviteMap.set(invite.id, invite);
    }
    for (const relation of await this.repo.loadCorpRelations()) {
      this.runtime.corpRelationMap.set(
        relationKey(relation.corpA, relation.corpB),
        relation,
      );
    }
    for (const standing of await this.repo.loadStandings()) {
      this.runtime.standingMap.set(
        `${standing.corporationId}|${standing.targetId}`,
        standing,
      );
    }
  }

  /** État entre deux corporations ; absence = neutre, comme entre empires. */
  corpRelationState(a: string, b: string): RelationState {
    if (a === b) return "alliance";
    return (
      this.runtime.corpRelationMap.get(relationKey(a, b))?.state ?? "neutral"
    );
  }

  /**
   * Guerre héritée de sa corporation (chantier 32.20). Consultée par `atWar` : un membre
   * ne peut pas s'en extraire par une paix personnelle, sinon la déclaration de guerre
   * d'une corporation ne vaudrait rien (ADR 0011).
   */
  corpsAtWar(empireA: string, empireB: string): boolean {
    const a = this.runtime.corporationMemberMap.get(empireA)?.corporationId;
    const b = this.runtime.corporationMemberMap.get(empireB)?.corporationId;
    if (!a || !b || a === b) return false;
    return this.corpRelationState(a, b) === "war";
  }

  /** Standing d'une corporation envers une cible ; absence = 0, l'indifférence. */
  standingOf(corporationId: string, targetId: string): number {
    return (
      this.runtime.standingMap.get(`${corporationId}|${targetId}`)?.value ?? 0
    );
  }

  /**
   * Standing du PROPRIÉTAIRE d'une station envers un visiteur, pour le palier `standing`.
   * Un propriétaire sans corporation n'a pas d'opinion à exprimer — le standing est un
   * objet de corporation, pas d'empire (ADR 0011).
   */
  standingTowards(ownerEmpireId: string, visitorEmpireId: string): number {
    const corporationId =
      this.runtime.corporationMemberMap.get(ownerEmpireId)?.corporationId;
    if (!corporationId) return 0;
    // La cible peut être le visiteur lui-même ou sa corporation : on retient la plus
    // favorable, sinon noter une corporation entière serait sans effet sur ses membres.
    const visitorCorp =
      this.runtime.corporationMemberMap.get(visitorEmpireId)?.corporationId;
    const direct = this.standingOf(corporationId, visitorEmpireId);
    return visitorCorp
      ? Math.max(direct, this.standingOf(corporationId, visitorCorp))
      : direct;
  }

  /**
   * Action joueur (officier) : poser l'état que SA corporation adopte envers une autre.
   *
   * `war` et `neutral` sont unilatéraux ; `nap` et `alliance` n'entrent en vigueur que si
   * l'autre camp a déjà posé le même — la réciprocité fait l'accord, sans dupliquer tout
   * l'étage des propositions en attente (ADR 0011).
   */
  setCorpRelation(
    empire: Empire,
    targetCorporationId: string,
    state: RelationState,
  ): string | null {
    const auth = this.authorize(empire, "corp.relation.set");
    if (typeof auth === "string") return auth;
    if (targetCorporationId === auth.corp.id) return "Cible invalide";
    const target = this.runtime.corporationMap.get(targetCorporationId);
    if (!target) return "Corporation inconnue";

    const key = relationKey(auth.corp.id, targetCorporationId);
    if ((this.runtime.corpRelationMap.get(key)?.state ?? "neutral") === state)
      return null;

    if (state === "nap" || state === "alliance") {
      // Un pacte demande que l'autre camp l'ait déjà voulu ; sinon on garde l'intention
      // et on attend.
      const wanted = this.runtime.corpIntentMap.get(
        `${targetCorporationId}|${auth.corp.id}`,
      );
      if (wanted !== state) {
        this.runtime.corpIntentMap.set(
          `${auth.corp.id}|${targetCorporationId}`,
          state,
        );
        this.notify();
        return null;
      }
      this.runtime.corpIntentMap.delete(
        `${targetCorporationId}|${auth.corp.id}`,
      );
    } else {
      // Déclarer la guerre ou revenir au neutre annule toute intention en attente.
      this.runtime.corpIntentMap.delete(
        `${auth.corp.id}|${targetCorporationId}`,
      );
      this.runtime.corpIntentMap.delete(
        `${targetCorporationId}|${auth.corp.id}`,
      );
    }

    const [corpA, corpB] =
      auth.corp.id < targetCorporationId
        ? [auth.corp.id, targetCorporationId]
        : [targetCorporationId, auth.corp.id];
    const relation: CorpRelation = { corpA, corpB, state, since: Date.now() };
    this.runtime.corpRelationMap.set(key, relation);
    this.repo.saveCorpRelation(relation);
    // Tout le camp d'en face est prévenu : une guerre déclarée pendant qu'ils dorment est
    // exactement ce que le journal existe pour couvrir (ADR 0008).
    for (const member of this.membersOf(targetCorporationId)) {
      this.emit({
        empireId: member.empireId,
        kind: "corp_relation_changed",
        otherName: auth.corp.name,
        subjectId: state,
      });
    }
    this.logger.info(
      `[game] « ${auth.corp.name} » → « ${target.name} » : ${state}`,
    );
    this.notify();
    return null;
  }

  /** Action joueur (officier) : noter un empire ou une corporation. */
  setStanding(empire: Empire, targetId: string, value: number): string | null {
    const auth = this.authorize(empire, "corp.standing.set");
    if (typeof auth === "string") return auth;
    if (targetId === auth.corp.id) return "Cible invalide";
    const known =
      this.runtime.empires.has(targetId) ||
      this.runtime.corporationMap.has(targetId);
    if (!known) return "Cible inconnue";
    const clamped = Math.max(
      STANDING_MIN,
      Math.min(STANDING_MAX, Math.round(value)),
    );
    const standing: Standing = {
      corporationId: auth.corp.id,
      targetId,
      value: clamped,
      setAt: Date.now(),
    };
    this.runtime.standingMap.set(`${auth.corp.id}|${targetId}`, standing);
    this.repo.saveStanding(standing);
    this.notify();
    return null;
  }

  /** Corporation d'un empire, ou `null` — l'appartenance est exclusive (ADR 0009). */
  corporationOf(empireId: string): Corporation | null {
    const member = this.runtime.corporationMemberMap.get(empireId);
    if (!member) return null;
    return this.runtime.corporationMap.get(member.corporationId) ?? null;
  }

  /** Deux empires sont-ils dans la même corporation ? Sert au palier d'accès `corp`. */
  sameCorporation(a: string, b: string): boolean {
    if (a === b) return true;
    const ca = this.runtime.corporationMemberMap.get(a)?.corporationId;
    const cb = this.runtime.corporationMemberMap.get(b)?.corporationId;
    return ca !== undefined && ca === cb;
  }

  membersOf(corporationId: string): CorporationMember[] {
    return [...this.runtime.corporationMemberMap.values()].filter(
      (m) => m.corporationId === corporationId,
    );
  }

  /** Invitations qui concernent un empire, reçues ou émises par sa corporation. */
  invitesFor(empireId: string): CorporationInvite[] {
    const own = this.runtime.corporationMemberMap.get(empireId)?.corporationId;
    return [...this.runtime.corporationInviteMap.values()].filter(
      (i) => i.empireId === empireId || i.corporationId === own,
    );
  }

  /**
   * Vérifie qu'un empire a le droit d'agir. Retourne le membre pour éviter au site
   * d'appel de le rechercher juste après — chaque action en a besoin.
   */
  private authorize(
    empire: Empire,
    action: CorpAction,
  ): { member: CorporationMember; corp: Corporation } | string {
    const member = this.runtime.corporationMemberMap.get(empire.id);
    if (!member) return "Vous n'appartenez à aucune corporation";
    const corp = this.runtime.corporationMap.get(member.corporationId);
    if (!corp) return "Corporation inconnue";
    if (!corpCan(member.role, action)) return "Droits insuffisants";
    return { member, corp };
  }

  /** Action joueur : fonder une corporation. Le fondateur la rejoint immédiatement. */
  foundCorporation(empire: Empire, name: string, tag: string): string | null {
    if (this.runtime.corporationMemberMap.has(empire.id))
      return "Vous appartenez déjà à une corporation";
    const upperTag = tag.toUpperCase();
    // Nom et sigle uniques : ils servent d'identité publique, deux corporations
    // homonymes rendraient la diplomatie illisible.
    for (const corp of this.runtime.corporationMap.values()) {
      if (corp.name.toLowerCase() === name.toLowerCase())
        return "Ce nom est déjà pris";
      if (corp.tag.toUpperCase() === upperTag) return "Ce sigle est déjà pris";
    }

    const corp: Corporation = {
      id: randomUUID(),
      name,
      tag: upperTag,
      founderEmpireId: empire.id,
      treasury: 0,
      createdAt: Date.now(),
    };
    this.runtime.corporationMap.set(corp.id, corp);
    this.repo.saveCorporation(corp);
    this.addMember(corp.id, empire.id, "founder");
    this.logger.info(
      `[game] corporation « ${corp.name} » [${corp.tag}] fondée par « ${empire.name} »`,
    );
    this.notify();
    return null;
  }

  private addMember(
    corporationId: string,
    empireId: string,
    role: CorpRole,
  ): void {
    const member: CorporationMember = {
      corporationId,
      empireId,
      role,
      joinedAt: Date.now(),
    };
    this.runtime.corporationMemberMap.set(empireId, member);
    this.repo.saveMember(member);
  }

  /** Action joueur : inviter un empire. Il doit consentir, comme pour un pacte. */
  inviteToCorporation(empire: Empire, targetEmpireId: string): string | null {
    const auth = this.authorize(empire, "corp.invite");
    if (typeof auth === "string") return auth;
    const target = this.runtime.empires.get(targetEmpireId);
    if (!target) return "Empire inconnu";
    // Pas de corporation PNJ (ADR 0009) : rien ne les ferait jouer, et il faudrait leur
    // inventer une politique de réponse.
    if (target.kind !== "human") return "Cet empire ne peut pas être invité";
    if (this.runtime.corporationMemberMap.has(targetEmpireId))
      return "Cet empire appartient déjà à une corporation";
    const pending = [...this.runtime.corporationInviteMap.values()].some(
      (i) => i.empireId === targetEmpireId && i.corporationId === auth.corp.id,
    );
    if (pending) return "Invitation déjà en attente";

    const invite: CorporationInvite = {
      id: randomUUID(),
      corporationId: auth.corp.id,
      corporationName: auth.corp.name,
      empireId: targetEmpireId,
      invitedBy: empire.id,
      createdAt: Date.now(),
    };
    this.runtime.corporationInviteMap.set(invite.id, invite);
    this.repo.saveInvite(invite);
    // L'invité est celui qui apprend quelque chose ; l'invitant vient d'agir.
    this.emit({
      empireId: targetEmpireId,
      kind: "corp_invited",
      otherName: auth.corp.name,
    });
    this.notify();
    return null;
  }

  /** Action joueur : accepter ou refuser une invitation reçue. */
  respondCorporationInvite(
    empire: Empire,
    inviteId: string,
    accept: boolean,
  ): string | null {
    const invite = this.runtime.corporationInviteMap.get(inviteId);
    if (!invite || invite.empireId !== empire.id) return "Invitation inconnue";
    this.runtime.corporationInviteMap.delete(inviteId);
    this.repo.deleteInvite(inviteId);
    if (!accept) {
      this.notify();
      return null;
    }
    // Revérifié à l'ACCEPTATION et pas seulement à l'émission : l'empire a pu rejoindre
    // une autre corporation entre-temps, et l'exclusivité doit tenir dans tous les cas.
    if (this.runtime.corporationMemberMap.has(empire.id))
      return "Vous appartenez déjà à une corporation";
    const corp = this.runtime.corporationMap.get(invite.corporationId);
    if (!corp) return "Corporation dissoute";
    this.addMember(corp.id, empire.id, "member");
    this.logger.info(
      `[game] « ${empire.name} » rejoint la corporation « ${corp.name} »`,
    );
    this.notify();
    return null;
  }

  /** Action joueur : quitter sa corporation. Le fondateur doit la dissoudre. */
  leaveCorporation(empire: Empire): string | null {
    const member = this.runtime.corporationMemberMap.get(empire.id);
    if (!member) return "Vous n'appartenez à aucune corporation";
    if (member.role === "founder")
      return "Un fondateur ne peut que dissoudre sa corporation";
    this.removeMember(empire.id);
    this.notify();
    return null;
  }

  /** Action joueur : exclure un membre. Le fondateur est intouchable. */
  kickFromCorporation(empire: Empire, targetEmpireId: string): string | null {
    const auth = this.authorize(empire, "corp.kick");
    if (typeof auth === "string") return auth;
    if (targetEmpireId === empire.id) return "Cible invalide";
    const target = this.runtime.corporationMemberMap.get(targetEmpireId);
    if (!target || target.corporationId !== auth.corp.id)
      return "Cet empire n'est pas membre";
    if (target.role === "founder") return "Le fondateur ne peut être exclu";
    // Un officier ne peut pas exclure un autre officier : sans cette règle, deux
    // officiers pourraient s'éliminer mutuellement en course de vitesse.
    if (target.role === "officer" && auth.member.role !== "founder")
      return "Seul le fondateur peut exclure un officier";
    this.removeMember(targetEmpireId);
    this.emit({
      empireId: targetEmpireId,
      kind: "corp_left",
      otherName: auth.corp.name,
    });
    this.notify();
    return null;
  }

  private removeMember(empireId: string): void {
    this.runtime.corporationMemberMap.delete(empireId);
    this.repo.deleteMember(empireId);
  }

  /** Action joueur (fondateur) : promouvoir ou rétrograder un membre. */
  setCorporationRole(
    empire: Empire,
    targetEmpireId: string,
    role: Exclude<CorpRole, "founder">,
  ): string | null {
    const auth = this.authorize(empire, "corp.role.set");
    if (typeof auth === "string") return auth;
    const target = this.runtime.corporationMemberMap.get(targetEmpireId);
    if (!target || target.corporationId !== auth.corp.id)
      return "Cet empire n'est pas membre";
    // Le rôle de fondateur ne se retire pas : sans lui, plus personne ne pourrait
    // dissoudre la corporation ni nommer d'officier (ADR 0009).
    if (target.role === "founder") return "Le rôle de fondateur est définitif";
    const next: CorporationMember = { ...target, role };
    this.runtime.corporationMemberMap.set(targetEmpireId, next);
    this.repo.saveMember(next);
    this.notify();
    return null;
  }

  /**
   * Action joueur (fondateur) : dissoudre. Le coffre est perdu — il n'appartient à
   * personne en particulier, et le partager demanderait une règle de répartition qui
   * serait arbitraire.
   */
  dissolveCorporation(empire: Empire): string | null {
    const auth = this.authorize(empire, "corp.dissolve");
    if (typeof auth === "string") return auth;
    for (const member of this.membersOf(auth.corp.id)) {
      this.removeMember(member.empireId);
      if (member.empireId !== empire.id) {
        this.emit({
          empireId: member.empireId,
          kind: "corp_dissolved",
          otherName: auth.corp.name,
        });
      }
    }
    for (const invite of [...this.runtime.corporationInviteMap.values()]) {
      if (invite.corporationId !== auth.corp.id) continue;
      this.runtime.corporationInviteMap.delete(invite.id);
      this.repo.deleteInvite(invite.id);
    }
    this.runtime.corporationMap.delete(auth.corp.id);
    this.repo.deleteCorporation(auth.corp.id);
    this.logger.info(`[game] corporation « ${auth.corp.name} » dissoute`);
    this.notify();
    return null;
  }

  /** Action joueur : verser des crédits d'une colonie au coffre commun (chantier 32.9). */
  depositToTreasury(
    empire: Empire,
    colonyId: string,
    amount: number,
  ): string | null {
    const member = this.runtime.corporationMemberMap.get(empire.id);
    if (!member) return "Vous n'appartenez à aucune corporation";
    const corp = this.runtime.corporationMap.get(member.corporationId);
    if (!corp) return "Corporation inconnue";
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    // Entier : les crédits sont comptés en unités partout ailleurs, accepter un flottant
    // ici ferait dériver le total du coffre par accumulation d'arrondis.
    const value = Math.floor(amount);
    if (value <= 0) return "Montant invalide";
    if (colony.resources.credits < value) return "Crédits insuffisants";

    empire.colonyMap.set(colony.id, {
      ...colony,
      resources: {
        ...colony.resources,
        credits: colony.resources.credits - value,
      },
    });
    this.persistColony(empire.colonyMap.get(colony.id)!);
    const next: Corporation = { ...corp, treasury: corp.treasury + value };
    this.runtime.corporationMap.set(corp.id, next);
    this.repo.saveCorporation(next);
    this.notify();
    return null;
  }

  /** Action joueur (officier ou fondateur) : retirer du coffre vers une colonie. */
  withdrawFromTreasury(
    empire: Empire,
    colonyId: string,
    amount: number,
  ): string | null {
    const auth = this.authorize(empire, "corp.treasury.withdraw");
    if (typeof auth === "string") return auth;
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    const value = Math.floor(amount);
    if (value <= 0) return "Montant invalide";
    if (auth.corp.treasury < value) return "Coffre insuffisant";

    const next: Corporation = {
      ...auth.corp,
      treasury: auth.corp.treasury - value,
    };
    this.runtime.corporationMap.set(next.id, next);
    this.repo.saveCorporation(next);
    empire.colonyMap.set(colony.id, {
      ...colony,
      resources: {
        ...colony.resources,
        credits: colony.resources.credits + value,
      },
    });
    this.persistColony(empire.colonyMap.get(colony.id)!);
    this.notify();
    return null;
  }
}
