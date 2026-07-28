import { allBelts, allPlanets, allStations, galaxyIndexOfId } from "@spacesim/shared";
import type {
  AsteroidBelt,
  Contract,
  FactionState,
  Gateway,
  Objective,
  Planet,
  PirateLair,
  Relation,
  RelationProposal,
  Stocks,
  StoredBattle,
  TradeStation,
  Universe,
  WorldEvent,
} from "@spacesim/shared";
import type { Clock, Empire } from "../empire.js";
import { WriteSet } from "./persistence/write-set.js";

/**
 * Détient l'univers, l'horloge de ticks et les entités partagées (game-scoped, pas de
 * fog) : marchés, portails, contrats, factions, pirates, batailles, relations,
 * propositions, objectifs, événements de monde, et les empires eux-mêmes.
 *
 * `GameEngine` reste la façade publique et compose ce runtime au boot — cette classe ne
 * connaît ni Drizzle ni Fastify, seulement l'état simulé.
 */
export class GameRuntime {
  /** Non figé : `growUniverse` le remplace quand de nouvelles galaxies s'ouvrent (chantier 9). */
  universe: Universe;
  /** Horloge et identité de l'univers partagé. */
  clock: Clock;
  planetsById: Map<string, Planet>;
  stationsById: Map<string, TradeStation>;
  beltsById: Map<string, AsteroidBelt>;
  /** Index de galaxie par système — sert aux règles d'expansion (chantier 9). */
  galaxyIndexOfSystem = new Map<string, number>();
  marketMap = new Map<string, Stocks>();
  // Portails inter-galactiques : mégastructures d'univers PARTAGÉES (game-scoped, décision
  // Phase D). N'importe quel empire y contribue via `contributeGateway` ; une fois actif, le
  // portail bénéficie à tous. Pas de portail par-empire — cohérent avec les marchés/pirates PNJ.
  gatewayMap = new Map<string, Gateway>();
  /** Contrats de fourniture (chantier 14) : partagés comme les portails, pas de fog. */
  contractMap = new Map<string, Contract>();
  /** Humeur des factions (chantier 15) : partagée, pas de fog. */
  factionStateMap = new Map<string, FactionState>();
  lairMap = new Map<string, PirateLair>();
  battleLog: StoredBattle[] = [];
  /** Relations entre empires (paires canoniques `a|b`, a<b) ; absence = neutre (chantier 16). */
  relationMap = new Map<string, Relation>();
  /** Propositions de pacte en attente (chantier 16). */
  proposalMap = new Map<string, RelationProposal>();
  /** Objectifs éphémères personnels (chantier 17). */
  objectiveMap = new Map<string, Objective>();
  /** Événements de monde actifs, partagés (chantier 17). */
  worldEventMap = new Map<string, WorldEvent>();
  /** Empires partageant cet univers (chantier 7b). Un seul instancié à ce stade. */
  empires = new Map<string, Empire>();
  /** Empire propriétaire par défaut (solo). Posé par `ensureDefaultPlayer`. */
  defaultEmpire!: Empire;
  /**
   * Tampon d'écritures en attente (chantier 20.2) : partagé par tous les repositories
   * du moteur, flushé en transaction par un `Persister` unique aux frontières
   * commande WS / lot de ticks.
   */
  readonly writeSet = new WriteSet();

  /**
   * L'univers est fourni par l'appelant (chantier 18) : chargé depuis les tables
   * `universe_*` au boot, jamais régénéré ici — la DB fait autorité.
   */
  constructor(clock: Clock, universe: Universe) {
    this.clock = { ...clock };
    this.universe = universe;
    this.planetsById = new Map();
    this.stationsById = new Map();
    this.beltsById = new Map();
    this.reindexUniverse();
  }

  /** (Ré)indexe les entités d'univers — appelé à la construction et après chaque extension. */
  reindexUniverse(): void {
    this.planetsById = new Map(allPlanets(this.universe).map((p) => [p.id, p]));
    this.stationsById = new Map(allStations(this.universe).map((s) => [s.id, s]));
    this.beltsById = new Map(allBelts(this.universe).map((b) => [b.id, b]));
    // Index dérivé de l'ID de galaxie (« gal-7 » → 7), pas de la position du tableau :
    // l'ordre de chargement ne peut plus décaler les règles régionales (prix, péages).
    this.galaxyIndexOfSystem = new Map(
      this.universe.galaxies.flatMap((g) => {
        const index = galaxyIndexOfId(g.id);
        return g.systems.map((s) => [s.id, index] as const);
      }),
    );
  }
}
