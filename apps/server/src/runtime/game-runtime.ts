import {
  allBelts,
  allPlanets,
  allSystems,
  allTradingPosts,
  galaxyIndexOfId,
} from "@spacesim/shared";
import type {
  AsteroidBelt,
  ChatMessage,
  Contract,
  Corporation,
  CorporationInvite,
  CorporationMember,
  CorpRelation,
  EmpireEvent,
  MarketOrder,
  StationHolding,
  RelationState,
  Mail,
  Standing,
  FactionState,
  Gateway,
  Objective,
  Planet,
  PirateLair,
  Relation,
  RelationProposal,
  StarSystem,
  Stocks,
  StoredBattle,
  TradingPost,
  Universe,
  WorldEvent,
} from "@spacesim/shared";
import type { Clock, Empire } from "../empire.js";
import type { ContentBundle } from "./content/content-types.js";
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
  /** Systèmes par id — nécessaire aux positions orbitales (chantier 31.8). */
  systemsById: Map<string, StarSystem>;
  tradingPostsById: Map<string, TradingPost>;
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
  /**
   * Journal d'événements par empire (chantier 32.3), du plus ancien au plus récent.
   *
   * Indexé par empire et non par id : toutes les lectures sont « le journal de cet
   * empire », jamais « cet événement ». Un `Map<id, EmpireEvent>` global aurait imposé
   * un balayage complet à chaque snapshot de chaque joueur.
   */
  eventsByEmpire = new Map<string, EmpireEvent[]>();
  /** Corporations (chantier 32.7), partagées : leur nom est public comme un nom d'empire. */
  corporationMap = new Map<string, Corporation>();
  /**
   * Appartenance, indexée par EMPIRE et non par corporation : l'appartenance est
   * exclusive (ADR 0009), et la question posée partout est « à quelle corporation
   * appartient cet empire », jamais l'inverse.
   */
  corporationMemberMap = new Map<string, CorporationMember>();
  /** Invitations en attente (chantier 32.8). */
  corporationInviteMap = new Map<string, CorporationInvite>();
  /**
   * Messages par canal, clé `scope:scopeId` (chantier 32.14), du plus ancien au plus
   * récent. Indexé par CANAL et non par empire : un message appartient à un lieu, et
   * l'appartenance des joueurs à ce lieu se dérive de l'état du jeu (ADR 0010).
   */
  chatByChannel = new Map<string, ChatMessage[]>();
  /** Boîtes aux lettres, par empire destinataire (chantier 32.15). */
  mailsByEmpire = new Map<string, Mail[]>();
  /** Relations entre corporations (chantier 32.19), clé `a|b` canonique comme `relationMap`. */
  corpRelationMap = new Map<string, CorpRelation>();
  /** Standings, clé `corporationId|targetId`. Publics : ils servent à être lus. */
  standingMap = new Map<string, Standing>();
  /**
   * Intentions de pacte entre corporations, clé `émetteur|cible` (chantier 32.20).
   *
   * En MÉMOIRE seulement, jamais persistées : une intention non réciproquée n'est pas un
   * état du monde, seulement une main tendue. La perdre au redémarrage ne détruit rien —
   * il suffit de la reposer, et c'est un geste d'un clic.
   */
  corpIntentMap = new Map<string, RelationState>();
  /** Ordres limites au repos (chantier 32.25), tous carnets confondus. */
  orderMap = new Map<string, MarketOrder>();
  /** Avoirs déposés en station, clé `stationId|empireId`. */
  holdingMap = new Map<string, StationHolding>();
  /** Empires partageant cet univers (chantier 7b). Un seul instancié à ce stade. */
  empires = new Map<string, Empire>();
  /** Empire propriétaire par défaut (solo). Posé par `ensureDefaultPlayer`. */
  defaultEmpire!: Empire;
  /**
   * Contenu de jeu édité en admin (chantier 23.5+) — posé par `GameEngine.loadContent()`
   * au boot, remplacé en bloc (jamais muté en place) après chaque édition admin.
   */
  content!: ContentBundle;
  /**
   * Tampon d'écritures en attente (chantier 20.2) : partagé par tous les repositories
   * du moteur, flushé en transaction par un `Persister` unique aux frontières
   * commande WS / lot de ticks.
   */
  readonly writeSet = new WriteSet();

  /**
   * Chaîne des écritures d'univers en cours (chantier 37.15).
   *
   * Une galaxie neuve, c'est ~3 400 lignes ; `ensureFrontier` en ouvre jusqu'à trois d'un
   * coup, dans le tick. Passées par le `WriteSet`, le `Persister` les écrivait **une par
   * une** — un UPDATE de sonde puis un INSERT chacune, soit vingt mille allers-retours
   * mesurés à **21,5 s** pendant lesquels le serveur répondait mal. Elles passent désormais
   * par `appendGalaxies`, transactionnel et découpé en lots.
   *
   * Le `Persister` ATTEND cette chaîne avant chaque flush : `initMarkets`/`initGateways`
   * stagent, dans la foulée, des lignes dont les clés étrangères pointent vers ces
   * tables-là. Sans la barrière, le flush pourrait les écrire avant que les galaxies ne
   * soient commitées.
   */
  universeWrite: Promise<void> = Promise.resolve();

  /**
   * L'univers est fourni par l'appelant (chantier 18) : chargé depuis les tables
   * `universe_*` au boot, jamais régénéré ici — la DB fait autorité.
   */
  constructor(clock: Clock, universe: Universe) {
    this.clock = { ...clock };
    this.universe = universe;
    this.planetsById = new Map();
    this.systemsById = new Map();
    this.tradingPostsById = new Map();
    this.beltsById = new Map();
    this.reindexUniverse();
  }

  /** (Ré)indexe les entités d'univers — appelé à la construction et après chaque extension. */
  reindexUniverse(): void {
    this.planetsById = new Map(allPlanets(this.universe).map((p) => [p.id, p]));
    this.systemsById = new Map(allSystems(this.universe).map((s) => [s.id, s]));
    this.tradingPostsById = new Map(
      allTradingPosts(this.universe).map((s) => [s.id, s]),
    );
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
