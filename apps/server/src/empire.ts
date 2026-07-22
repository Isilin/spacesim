/**
 * Un empire = l'état d'un joueur au sein d'un univers partagé (chantier 7b — moteur).
 *
 * Le `GameEngine` détient l'univers, l'horloge de ticks et les PNJ (marchés, pirates,
 * portails) ; chaque `Empire` porte ses propres entités et son état (colonies, flottes,
 * routes, influence, recherche, brouillard, réputation…). Pour l'instant un seul empire
 * est instancié — le vrai multi (N empires, identité de connexion, PvP) arrive en 7c/7d.
 *
 * À ce stade, `Empire` ne porte que l'identité ; les maps d'entités et l'état d'empire
 * y sont déplacés aux sous-jalons suivants (b/c).
 */
export class Empire {
  constructor(
    readonly id: string,
    public name: string,
    public color: string,
  ) {}
}
