import type { GameEngine } from "../game.js";

/**
 * Séquence de (re)chargement d'une partie, dans l'ordre exact observé en production —
 * contrat implicite (chantier 19.10, extrait de `GameEngine.boot()`). Contenu de jeu
 * (chantier 23.5+) amorcé/chargé en tout premier, puis empire par
 * défaut et joueurs (identité), puis les entités partagées sans fog
 * (relations, propositions, objectifs, journaux d'empire, événements de monde), puis soit la création de
 * la colonie mère (partie neuve) soit le rechargement complet des entités par-empire
 * et partagées (partie existante), enfin les plans de vaisseaux, l'équipement
 * idempotent des galaxies, la frontière glissante et le rattrapage du temps
 * hors-ligne.
 *
 * Opère sur la surface PUBLIQUE de `GameEngine` (les neuf services + `bootstrap`,
 * chantier 19.6) plutôt que sur des méthodes internes : le constructeur de
 * `GameEngine` reste privé (geste explicite via `load`/`bootstrapNewUniverse`), donc
 * cette fonction prend l'instance déjà construite.
 */
export async function bootEngine(
  engine: GameEngine,
  isNew: boolean,
): Promise<void> {
  // Contenu de jeu (chantier 23.5+) : amorcé/chargé avant tout le reste — la production
  // (buildWarship) et le combat en dépendent dès que la partie tourne.
  await engine.loadContent();
  await engine.bootstrap.ensureDefaultPlayer();
  await engine.bootstrap.loadPlayers();
  await engine.diplomacy.loadRelations();
  await engine.diplomacy.loadProposals();
  await engine.objective.loadObjectives();
  await engine.inbox.loadEvents();
  await engine.corporation.loadCorporations();
  await engine.communication.loadCommunication();
  await engine.orderBook.loadOrderBook();
  await engine.diplomacy.loadWorldEvents();
  if (isNew) {
    engine.bootstrap.createHomeColony();
  } else {
    await engine.bootstrap.loadColonies();
    await engine.station.loadStations();
    await engine.logistics.loadTransfers();
    await engine.logistics.loadMissions();
    await engine.market.loadMarkets();
    await engine.logistics.loadRoutes();
    await engine.logistics.loadOutposts();
    await engine.gateway.loadGateways();
    await engine.contract.loadContracts();
    await engine.diplomacy.loadFactionStates();
    await engine.fleetService.loadFleets();
    await engine.fleetService.loadPirates();
    await engine.fleetService.loadBattles();
  }
  // Plans de vaisseaux (chantier 13) : chargés puis amorcés pour tout empire qui n'en a
  // aucun (partie neuve, ou empire d'avant le chantier 13).
  await engine.industry.loadBlueprints();
  engine.industry.seedStarterBlueprintsForAll();
  // Équipement des galaxies (idempotent) : couvre aussi bien la partie neuve que les
  // galaxies apparues par extension.
  engine.market.initMarkets();
  engine.gateway.initGateways();
  engine.diplomacy.initFactionStates();
  // L'univers doit toujours offrir de la place devant les joueurs (chantier 9).
  engine.exploration.ensureFrontier();
  // Rattrapage du temps hors-ligne — pour une partie qui a une histoire, et elle seule
  // (chantier 44). Un univers créé il y a trois secondes n'a rien à rattraper : le seul
  // temps écoulé est celui de sa propre matérialisation, et depuis le chantier 37 elle
  // dure assez longtemps pour franchir un tick de cinq secondes sur une machine lente.
  // `bootstrapNewUniverse` pose `lastTickAt` AVANT de générer quatre galaxies et d'écrire
  // ~5 900 systèmes ; la CI franchissait le seuil là où cette machine ne le franchissait
  // pas, et une partie neuve naissait au tick 1.
  //
  // L'horloge, elle, reste où elle est : sur un serveur vivant le `Scheduler` verra ce
  // temps réel à sa première salve et l'avancera, ce qui est honnête. En test il n'y a pas
  // de `Scheduler`, donc une partie neuve reste au tick 0 — ce que son test affirme depuis
  // le Sprint 0.
  if (!isNew) engine.catchUp();
  // Un boot frais (colonie mère, marchés/portails idempotents, plans de départ) doit
  // laisser la DB cohérente avec la mémoire AVANT de servir la moindre commande —
  // `catchUp()` ne flushe que s'il a rejoué des ticks (chantier 20.2).
  await engine.flush();
}
