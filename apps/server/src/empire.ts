import type {
  Colony,
  Fleet,
  MiningOutpost,
  Mission,
  Route,
  Transfer,
} from "@spacesim/shared";

/**
 * Un empire = l'état d'un joueur au sein d'un univers partagé (chantier 7b — moteur).
 *
 * Le `GameEngine` détient l'univers, l'horloge de ticks et les PNJ (marchés, pirates,
 * portails) ; chaque `Empire` porte ses propres entités et son état (colonies, flottes,
 * routes, influence, recherche, brouillard, réputation…). Pour l'instant un seul empire
 * est instancié — le vrai multi (N empires, identité de connexion, PvP) arrive en 7c/7d.
 *
 * À ce stade, `Empire` porte l'identité et les maps d'entités ; l'état d'empire
 * (influence, recherche, effets, brouillard, réputation) y est déplacé au sous-jalon (c).
 */
export class Empire {
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

  constructor(
    readonly id: string,
    public name: string,
    public color: string,
  ) {}
}
