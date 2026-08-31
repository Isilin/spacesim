import type { FactionId } from "../content/factions.js";
import type { StationMarketAccess } from "./industry.js";
import type { ResourceId } from "./resources.js";

export type FactionMood = "neutral" | "boom" | "shortage" | "embargo";

/**
 * État vivant d'une faction (chantier 15) : humeur temporaire, partagée comme les
 * portails ou les contrats — pas de brouillard, une faction se comporte pareil pour tous.
 */
export interface FactionState {
  factionId: string;
  mood: FactionMood;
  /** Timestamp de fin de l'humeur courante (null = neutre, pas de minuterie). */
  moodUntil: number | null;
}

export type RelationState = "neutral" | "nap" | "alliance" | "war";

/**
 * Relation entre deux empires (chantier 16). Paire canonique (`empireA` < `empireB`) :
 * une seule ligne décrit une relation symétrique. `until` est un cooldown (ex. guerre
 * interdite peu après une paix), pas une durée de pacte — NAP et alliance restent en
 * vigueur tant qu'aucune des parties ne les rompt. Visibilité : redactée par empire
 * (seules les relations qui le concernent), à la différence de contrats/factions.
 */
export interface Relation {
  empireA: string;
  empireB: string;
  state: RelationState;
  since: number;
  until: number | null;
}

export type ProposalKind = "nap" | "alliance";

/**
 * Proposition de pacte en attente d'une réponse (chantier 16) : NAP ou alliance exigent
 * le consentement de la cible, à la différence de la guerre (unilatérale).
 */
export interface RelationProposal {
  id: string;
  fromEmpireId: string;
  toEmpireId: string;
  kind: ProposalKind;
  createdAt: number;
}

export type ObjectiveKind =
  | "colonize_n_systems"
  | "hold_system"
  | "lead_population"
  | "lead_influence";
export type ObjectiveStatus = "open" | "completed" | "expired";

/**
 * Objectif éphémère (chantier 17) : but court terme personnel, tiré au sort et
 * auto-évalué contre l'état du jeu (colonies, revendications, classements) — jamais
 * plus d'un actif par empire à la fois. Redacté par empire, comme les relations.
 */
export interface Objective {
  id: string;
  empireId: string;
  kind: ObjectiveKind;
  /** colonize_n_systems : nombre de colonies visé. */
  targetCount?: number;
  /** hold_system : système à conserver revendiqué jusqu'à l'échéance. */
  targetSystemId?: string;
  reward: number;
  createdAt: number;
  deadline: number;
  status: ObjectiveStatus;
}

export type WorldEventKind =
  | "economic_crisis"
  | "gold_rush"
  | "pirate_surge"
  | "faction_boom";

/**
 * Événement de monde (chantier 17) : crise ou essor régional, vague pirate, essor de
 * faction — subi ou exploité par tous. Diffusé en entier comme les portails/contrats,
 * jamais brouillardé (un événement touche un lieu ou une faction, pas un empire).
 */
export interface WorldEvent {
  id: string;
  kind: WorldEventKind;
  /** economic_crisis / gold_rush / pirate_surge : galaxie touchée. */
  galaxyId?: string;
  /** faction_boom : faction touchée. */
  factionId?: string;
  createdAt: number;
  expiresAt: number;
}

export type ContractStatus = "open" | "fulfilled" | "expired" | "cancelled";

/**
 * Contrat de fourniture (chantier 14) : un empire promet des crédits — retenus en
 * séquestre à la publication — contre la livraison physique d'une ressource à l'une
 * de ses colonies. Diffusé en entier comme `leaderboard`/`gateways` : une offre
 * publique, pas une donnée stratégique à cacher dans le brouillard.
 */
export interface Contract {
  id: string;
  issuerId: string;
  /** Nom figé à la publication — fiable pour un empire (nom choisi, mutable comme
   *  `Empire.name`), mais jamais pour une faction PNJ : voir `issuerFactionId`. */
  issuerName: string;
  /** Renseigné uniquement pour un contrat publié par une faction PNJ (chantier 15) —
   *  le client résout le nom d'affichage par id via `FACTION_LABELS` au rendu plutôt
   *  que de se fier à `issuerName`, figé dans la locale du serveur à la création
   *  (chantier 27.19). Absent pour un contrat publié par un empire joueur/PNJ, où
   *  `issuerName` reste la seule source (un nom d'empire n'est pas du contenu traduisible). */
  issuerFactionId?: FactionId;
  issuerColor: string;
  colonyId: string;
  colonyName: string;
  systemId: string;
  resource: ResourceId;
  quantity: number;
  /** Reste à livrer — décrémenté à l'acceptation, pas à la livraison (anti-survente). */
  remaining: number;
  pricePerUnit: number;
  createdAt: number;
  deadline: number;
  status: ContractStatus;
}

export interface ForeignColony {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerColor: string;
  name: string;
  systemId: string;
  planetId: string;
}

/** Présence étrangère redactée d'une station orbitale (chantier 24), même patron que
 *  `ForeignColony`. */
export interface ForeignStation {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerColor: string;
  name: string;
  systemId: string;
  bodyId: string;
  /** Présent seulement si la station a au moins une installation de marché
   * opérationnelle (chantier 25) — jamais le reste du stock (matériaux de
   * construction du propriétaire, non exposés aux visiteurs). */
  market?: {
    hasResourceMarket: boolean;
    hasBlueprintMarket: boolean;
    access: StationMarketAccess;
    taxRate: number;
    tradableStocks: Partial<Record<ResourceId, number>>;
  };
}

/**
 * Nature d'un événement de boîte de réception (chantier 32.1).
 *
 * Un même fait produit **deux** événements quand il oppose deux empires — `battle_won`
 * pour l'un, `battle_lost` pour l'autre : c'est ce qui permet de rédiger selon le point
 * de vue sans jamais exposer celui de l'adversaire. Voir
 * [ADR 0008](../../../../docs/adr/0008-journal-d-evenements-d-empire.md).
 */
export type EmpireEventKind =
  | "battle_won"
  | "battle_lost"
  | "colony_attacked"
  | "lair_appeared"
  | "claim_lost"
  | "contract_fulfilled"
  | "research_completed"
  | "relation_changed"
  | "objective_completed"
  | "corp_invited"
  | "corp_left"
  | "corp_dissolved";

/**
 * Entrée du journal d'un empire. Aucune phrase : le serveur n'écrit que des identifiants
 * et des nombres, le client rend dans la locale du joueur — même raison qu'au chantier
 * 27.19 pour `Contract.issuerFactionId`, un libellé figé à l'écriture resterait dans la
 * langue du serveur pour toujours, et l'univers ne se réinitialise jamais.
 *
 * Les champs optionnels dépendent du `kind` ; la table les stocke tous nullables plutôt
 * qu'en JSON, pour rester interrogeable et migrable comme le reste du schéma.
 */
export interface EmpireEvent {
  id: string;
  empireId: string;
  kind: EmpireEventKind;
  createdAt: number;
  /** `null` tant que le joueur ne l'a pas ouvert — c'est ce qui fait le digest d'absence. */
  readAt: number | null;
  /** Système concerné (bataille, claim perdu). */
  systemId?: string;
  /** Colonie concernée (attaque de colonie, contrat honoré). */
  colonyId?: string;
  /**
   * Nom d'affichage de l'autre partie, figé à l'écriture. Contrairement à un libellé
   * traduisible, un nom d'empire est choisi par un joueur : il n'existe dans aucune
   * locale et ne peut pas être résolu par id après coup si l'empire disparaît.
   */
  otherName?: string;
  /** Identifiant de contenu à traduire côté client (technologie, ressource, état de relation). */
  subjectId?: string;
  /** Quantité associée : crédits d'un contrat, récompense d'objectif, pertes d'une bataille. */
  amount?: number;
}

/**
 * Ce qu'un émetteur fournit : identité, horodatage et état de lecture sont posés par la
 * boîte de réception. Vit ici et non côté serveur pour que les services de domaine
 * n'aient à importer aucun type de l'`InboxService` — ils reçoivent une fonction, pas
 * une dépendance (ADR 0001).
 */
export type EmpireEventDraft = Omit<EmpireEvent, "id" | "createdAt" | "readAt">;

// ── Corporations (chantier 32.6) ─────────────────────────────────────────────

/**
 * Rôles au sein d'une corporation, du moins au plus puissant.
 *
 * Énumération DISTINCTE de celle des rôles d'administration : la forme est reprise de
 * `packages/protocol/src/admin.ts` (actions namespacées + table rôle → permissions), pas
 * le contenu. Un rôle d'admin gouverne les opérateurs du jeu, un rôle de corporation
 * gouverne une organisation de joueurs — les partager ferait fuiter `content.techs.write`
 * dans un contrôle de corporation. Voir
 * [ADR 0009](../../../../docs/adr/0009-corporations-entite-de-premier-rang.md).
 */
export const CORP_ROLES = ["member", "officer", "founder"] as const;
export type CorpRole = (typeof CORP_ROLES)[number];

/** Actions gouvernées par les rôles. Namespacées, comme les actions d'administration. */
export const CORP_ACTIONS = [
  "corp.invite",
  "corp.kick",
  "corp.treasury.withdraw",
  "corp.role.set",
  "corp.dissolve",
] as const;
export type CorpAction = (typeof CORP_ACTIONS)[number];

const OFFICER_ACTIONS: CorpAction[] = [
  "corp.invite",
  "corp.kick",
  "corp.treasury.withdraw",
];

export const CORP_ROLE_PERMISSIONS: Record<
  CorpRole,
  ReadonlySet<CorpAction>
> = {
  member: new Set(),
  officer: new Set(OFFICER_ACTIONS),
  founder: new Set(CORP_ACTIONS),
};

export function corpCan(role: CorpRole, action: CorpAction): boolean {
  return CORP_ROLE_PERMISSIONS[role].has(action);
}

/**
 * Organisation de joueurs. Ni colonie, ni flotte, ni brouillard : ce n'est pas un empire
 * (ADR 0009). Son nom et son étiquette sont publics comme un nom d'empire ; seuls le
 * solde du coffre et le détail des rôles ne partent qu'à ses membres.
 */
export interface Corporation {
  id: string;
  name: string;
  /** Sigle court affiché à côté du nom des membres, façon ticker. */
  tag: string;
  /** Empire fondateur — unique, son rôle ne se retire pas : sans lui, plus personne ne
   *  pourrait dissoudre la corporation. */
  founderEmpireId: string;
  /** Coffre commun. En CRÉDITS seulement : une ressource est toujours quelque part
   *  (ADR 0004), un coffre de matière sans lieu serait un téléporteur. */
  treasury: number;
  createdAt: number;
}

/** Appartenance d'un empire à une corporation. Exclusive : au plus une par empire. */
export interface CorporationMember {
  corporationId: string;
  empireId: string;
  role: CorpRole;
  joinedAt: number;
}

/** Invitation en attente — même patron que `RelationProposal` : rejoindre exige un
 *  consentement des deux côtés, l'invitation puis l'acceptation. */
export interface CorporationInvite {
  id: string;
  corporationId: string;
  /** Nom figé à l'émission, comme `Contract.issuerName` : un nom choisi par un joueur
   *  n'existe dans aucune locale et l'invité doit savoir qui l'invite. */
  corporationName: string;
  empireId: string;
  invitedBy: string;
  createdAt: number;
}
