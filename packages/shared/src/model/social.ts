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
