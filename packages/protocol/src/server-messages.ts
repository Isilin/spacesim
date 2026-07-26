import type {
  Blueprint,
  Colony,
  Contract,
  FactionState,
  Fleet,
  ForeignColony,
  ForeignFleet,
  GameState,
  Gateway,
  LeaderboardEntry,
  MiningOutpost,
  Mission,
  Objective,
  PirateLair,
  Relation,
  RelationProposal,
  Route,
  StationMarket,
  StoredBattle,
  Territory,
  Transfer,
  Universe,
  WorldEvent,
} from "@spacesim/shared";

/** Vue redactée de l'état de jeu propre à un empire — le corps commun de `hello` et `tick`. */
export interface EmpireSnapshot {
  game: GameState;
  colonies: Colony[];
  transfers: Transfer[];
  missions: Mission[];
  exploredSystemIds: string[];
  /** Marchés des stations situées dans des systèmes explorés. */
  markets: StationMarket[];
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
  /** Événements de monde actifs (chantier 17), non brouillardés. */
  worldEvents: WorldEvent[];
}

/** Messages WebSocket serveur → client. L'univers envoyé est expurgé du non-exploré. */
export type ServerMessage =
  | ({
      type: "hello";
      /** Identité de l'empire piloté par cette connexion (jeton à persister côté client). */
      playerId: string;
      universe: Universe;
    } & EmpireSnapshot)
  | ({
      type: "tick";
      /** Présent quand l'exploration a changé depuis le dernier message. */
      universe?: Universe;
    } & EmpireSnapshot)
  | { type: "actionError"; message: string };
