import type {
  Blueprint,
  Colony,
  ChatMessage,
  ChatScope,
  Contract,
  Corporation,
  CorporationInvite,
  CorporationMember,
  CorpRelation,
  PublicCorporation,
  EmpireEvent,
  FactionState,
  Fleet,
  ForeignColony,
  ForeignFleet,
  ForeignStation,
  GameState,
  Gateway,
  LeaderboardEntry,
  Mail,
  MarketOrder,
  StationHolding,
  Standing,
  MiningOutpost,
  Mission,
  Objective,
  PirateLair,
  Relation,
  RelationProposal,
  Route,
  Station,
  StoredBattle,
  SystemSite,
  Territory,
  TradingPostMarket,
  Transfer,
  ClientUniverse,
  WorldEvent,
} from "@spacesim/shared";

/** Vue redactée de l'état de jeu propre à un empire — le corps commun de `hello` et `tick`. */
export interface EmpireSnapshot {
  game: GameState;
  colonies: Colony[];
  /** Stations orbitales possédées (chantier 24), distinctes des colonies. */
  stations: Station[];
  transfers: Transfer[];
  missions: Mission[];
  exploredSystemIds: string[];
  /** Systèmes déjà scannés par l'empire (chantier 31.11). */
  scannedSystemIds: string[];
  /** Sites révélés par les scans — épaves, anomalies, caches dans le volume. */
  sites: SystemSite[];
  /** Marchés des comptoirs situés dans des systèmes explorés. */
  markets: TradingPostMarket[];
  routes: Route[];
  outposts: MiningOutpost[];
  gateways: Gateway[];
  fleets: Fleet[];
  /** Plans de vaisseaux de l'empire (chantier 13). */
  blueprints: Blueprint[];
  pirateLairs: PirateLair[];
  battles: StoredBattle[];
  /** Entités étrangères visibles dans le brouillard de l'empire (chantier 7d). */
  foreignFleets: ForeignFleet[];
  foreignColonies: ForeignColony[];
  foreignStations: ForeignStation[];
  /** Classement de tous les empires de la partie (chantier 7e). */
  leaderboard: LeaderboardEntry[];
  /** Systèmes revendiqués visibles, colorés par empire propriétaire (chantier 7e). */
  territories: Territory[];
  /** Contrats de fourniture actifs de toute la partie (chantier 14, non brouillardés). */
  contracts: Contract[];
  /** Humeur courante de chaque faction (chantier 15, non brouillardée). */
  factionStates: FactionState[];
  /** Relations impliquant l'empire (chantier 16) — redactées, pas de fuite vers un tiers. */
  relations: Relation[];
  /** Propositions de pacte en attente le concernant (chantier 16), émises ou reçues. */
  proposals: RelationProposal[];
  /** Objectifs éphémères de l'empire (chantier 17) — personnels, jamais visibles d'un tiers. */
  objectives: Objective[];
  /**
   * Journal d'événements de l'empire (chantier 32.3), du plus récent au plus ancien et
   * tronqué à `EMPIRE_EVENT_PAGE`. Redacté comme les objectifs.
   */
  events: EmpireEvent[];
  /** Non-lus sur le TOTAL, pas seulement sur la page transmise — c'est le digest d'absence. */
  unreadEventCount: number;
  /**
   * Corporation de l'empire (chantier 32.8), coffre compris — absente s'il n'en a pas.
   * Les autres corporations n'arrivent PAS ici : leur nom voyage avec les entités qui
   * les mentionnent (classement, présence étrangère), jamais leur coffre.
   */
  corporation?: Corporation;
  /** Membres de SA corporation, avec leurs rôles. Vide s'il n'en a pas. */
  corporationMembers: CorporationMember[];
  /** Invitations en attente le concernant (chantier 32.8), reçues ou émises. */
  corporationInvites: CorporationInvite[];
  /**
   * Annuaire public des corporations (chantier 32.20) : identité seulement. Sans lui, les
   * relations et standings ci-dessous seraient des identifiants sans nom.
   */
  publicCorporations: PublicCorporation[];
  /**
   * Relations entre corporations — TOUTES, pas seulement celles de l'empire : elles sont
   * publiques, c'est ce qui rend la carte politique lisible d'un tiers (ADR 0011).
   */
  corpRelations: CorpRelation[];
  /** Standings publics de toutes les corporations, même raison. */
  standings: Standing[];
  /**
   * Canaux auxquels l'empire appartient (chantier 32.14). Transmis EXPLICITEMENT et non
   * déduits des messages reçus : un canal encore silencieux serait sinon invisible, et
   * personne ne pourrait jamais y parler en premier.
   */
  chatChannels: { scope: ChatScope; scopeId: string }[];
  /** Messages de ces canaux, chacun tronqué à `CHAT_PAGE`. */
  chat: ChatMessage[];
  /** Boîte aux lettres de l'empire (chantier 32.15), du plus récent au plus ancien. */
  mails: Mail[];
  /**
   * Ordres au repos des stations que l'empire peut voir (chantier 32.25) — les siens et
   * ceux des carnets auxquels son palier d'accès lui donne droit. Un carnet fermé n'est
   * pas visible : la politique d'accès gouverne aussi le regard.
   */
  orders: MarketOrder[];
  /** Ses avoirs déposés en station, tous lieux confondus. */
  holdings: StationHolding[];
  /** Événements de monde actifs (chantier 17), non brouillardés. */
  worldEvents: WorldEvent[];
  /** Présent quand l'exploration ou l'univers a changé depuis le dernier message. */
  universe?: ClientUniverse;
}

/** Messages WebSocket serveur → client. L'univers envoyé est expurgé du non-exploré. */
export type ServerMessage =
  | ({
      type: "hello";
      /** Identité de l'empire piloté par cette connexion (jeton à persister côté client). */
      playerId: string;
      universe: ClientUniverse;
    } & EmpireSnapshot)
  | ({ type: "tick" } & EmpireSnapshot)
  | { type: "actionError"; message: string };
