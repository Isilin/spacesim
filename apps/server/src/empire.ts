import {
  computeEffects,
  type ActiveResearch,
  type Colony,
  type EmpireEffects,
  type Fleet,
  type GameState,
  type MiningOutpost,
  type Mission,
  type Route,
  type TechId,
  type Transfer,
} from "@spacesim/shared";

/** Horloge et identité de l'univers partagé (détenues par le GameEngine). */
export interface Clock {
  id: string;
  seed: string;
  tick: number;
  lastTickAt: number;
  /** Galaxies générées : l'univers grandit avec le front de peuplement (chantier 9). */
  galaxyCount: number;
}

/**
 * Un empire = l'état d'un joueur au sein d'un univers partagé (chantier 7b — moteur).
 *
 * Le `GameEngine` détient l'univers, l'horloge de ticks et les PNJ (marchés, pirates,
 * portails) ; chaque `Empire` porte ses propres entités et son état (colonies, flottes,
 * routes, influence, recherche, brouillard, réputation…). Pour l'instant un seul empire
 * est instancié — le vrai multi (N empires, identité de connexion, PvP) arrive en 7c/7d.
 */
export class Empire {
  // ── Entités possédées ──────────────────────────────────────────────────
  /** Colonies possédées, indexées par id. */
  readonly colonyMap = new Map<string, Colony>();
  /** Convois cargo en vol (transferts manuels). */
  readonly transferMap = new Map<string, Transfer>();
  /** Missions en cours (sonde, colonisation, commerce, avant-poste…). */
  readonly missionMap = new Map<string, Mission>();
  /** Routes logistiques automatiques. */
  readonly routeMap = new Map<string, Route>();
  /** Avant-postes miniers. */
  readonly outpostMap = new Map<string, MiningOutpost>();
  /** Flottes militaires. */
  readonly fleetMap = new Map<string, Fleet>();

  // ── État d'empire ──────────────────────────────────────────────────────
  /** Effets cumulés des techs acquises (recomputés à chaque recherche terminée). */
  effects: EmpireEffects = computeEffects([]);
  /** Brouillard : systèmes explorés par cet empire. */
  explored = new Set<string>();
  /** Marqueur : l'exploration a changé depuis la dernière notification. */
  explorationDirty = false;
  /**
   * Marqueur : l'univers lui-même a changé (extension — chantier 9). Distinct du
   * brouillard : une galaxie neuve doit parvenir au client même s'il n'a rien exploré.
   */
  universeDirty = false;
  /** Ids des techs acquises. */
  researched: string[] = [];
  /** Recherche en cours (une seule à la fois), timer réel. */
  research: ActiveResearch | null = null;
  /** Influence de l'empire (population satisfaite + monuments). */
  influence = 0;
  /** Réputation par faction (gagnée en commerçant). */
  factionRep: Record<string, number> = {};
  /** Systèmes revendiqués (bonus locaux, entretien en influence). */
  claimedSystemIds: string[] = [];

  constructor(
    readonly id: string,
    public name: string,
    public color: string,
    /**
     * Compte propriétaire (chantier 8). null = empire non encore adopté : l'empire
     * amorcé au boot d'une partie neuve, ou un empire d'outil de dev.
     */
    public accountId: string | null = null,
  ) {}

  /** Recompose la forme externe `GameState` : horloge partagée + état de cet empire. */
  toGameState(clock: Clock): GameState {
    return {
      id: clock.id,
      seed: clock.seed,
      tick: clock.tick,
      lastTickAt: clock.lastTickAt,
      researched: this.researched,
      research: this.research,
      influence: this.influence,
      factionRep: this.factionRep,
      claimedSystemIds: this.claimedSystemIds,
    };
  }
}
