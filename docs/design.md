# SpaceSim — Plan MVP

> **Chantier 18 — univers persistant en DB (27/07/2026)** : l'univers est **matérialisé
> en tables `universe_*`** et la base fait autorité — le générateur ne sert plus qu'à
> ouvrir la frontière. **Le serveur officiel ne sera jamais réinitialisé** : seulement
> étendu, corrigé, amélioré. Voir « Chantier 18 » en fin de document. **Livré.**
> **Chantiers 14 → 17 (25/07/2026)** : économie PNJ (empires PNJ autonomes, contrats de
> fourniture) · factions (humeurs essor/pénurie/embargo, contrats de pénurie) · diplomatie
> (relations pacte/alliance/guerre, propositions) · objectifs éphémères et événements de monde
> (crise économique, ruée vers l'or, vague pirate, essor de faction). Voir « Chantiers 14 → 17 »
> en fin de document. **Livrés.**
> **Chantiers 8 → 12 planifiés (23/07/2026)** : comptes joueurs · univers extensible à l'infini
> + carte navigable · vue planète/lune · vrai arbre de recherche · logistique (stock orbital,
> transport, prix régionaux). Voir « Chantiers 8 → 12 » en fin de document.
> **8 livré** : comptes e-mail + mot de passe, sessions, WS authentifié.
> **9 livré** : univers extensible à l'infini (frontière glissante) + cartes zoomables et navigables.
> **10 livré** : vue planète/lune (schéma orbital, fiche physique, emplacements).
> **11 livré** : arbre de recherche en graphe, 35 techs, chaînes planifiables.
> **12 livré** : logistique — stock orbital, transport réel (carburant/classes/convois), prix régionaux.
> **Chantiers 8 → 12 : terminés.**
> **Polish carte (24/07/2026)** : double-clic réservé à l'ouverture des sous-cartes (plus de
> zoom parasite), galaxies rendues en spirales, et **réseau inter-galactique de voisinage** —
> chaque galaxie ne s'ouvre un trou de ver que vers sa plus proche voisine (arbre couvrant
> enraciné sur la mère), les chemins découverts (chaîne de portails active) sont mis en valeur.
> **Chantier 13 — conception de vaisseaux (25/07/2026)** : les classes figées (`SHIPS`/`WARSHIPS`)
> laissent place à des **plans** assemblés par le joueur — châssis (génériques ou spécialisés)
> garnis de modules dans des emplacements typés, sous budget énergie/tonnage/calcul (EVE-like).
> La recherche débloque châssis et modules sur tous les fronts (armes, défenses, propulsion,
> soute, extraction, habitat). Plans commercialisables en station PNJ (achat au catalogue, revente
> de plans et de vaisseaux assemblés). Voir « Chantier 13 » en fin de document. **Livré.**
>
> **État (21/07/2026)** : jalons 1 à 7 implémentés et vérifiés — le MVP décrit ici est jouable.
> **Pivot EVE-like (13/07/2026)** : plus de niveaux de bâtiments — on empile des **instances**
> (coût plat, contrainte = emplacements + main-d'œuvre). Univers en **3 échelles** :
> Univers (3 galaxies) → Galaxie (graphe de systèmes) → Système (orbites, planètes, lunes
> colonisables, ceintures d'astéroïdes). Voyage inter-galactique via **portails** (chantier 5).
> **Chantiers v2 livrés** : 0 migrations drizzle-kit · 1 marché PNJ (factions,
> stations, prix offre/demande, ventes/achats au spot) · 2 chantier naval + routes automatiques
> (cargos possédés, règles maintain/fixed/surplus) · 3 stations minières sur ceintures ·
> 4 influence (monument, colonisation à coût croissant, claims +15 % prod) + réputation factions
> (paliers Associé/Partenaire/Allié, remises commerciales) · **5 portails inter-galactiques**
> (méga-projet financé en ressources, liens de saut vers les galaxies lointaines) ·
> **6 flottes militaires + combat PvE** (vaisseaux de guerre, directives par phase, batailles
> Endless Space-like en 3 portées, repaires pirates PNJ, rapports de bataille archivés).
> *(Historique : le « prochain chantier 7 » annoncé ici a été livré depuis, comme les
> chantiers 8 à 18.)*
>
> **Build sans Node natif (21/07/2026)** : cette machine n'a pas Node/pnpm installés ;
> le projet se build, se teste et se lance via Docker (`Dockerfile` + `docker-compose.yml`).
> Voir la section « Environnement Docker » dans [CLAUDE.md](../CLAUDE.md).

## Contexte

Jeu par navigateur de gestion spatiale, plus profond qu'un ogame-like, inspiré d'EVE Online côté gestion/économie. Vision long terme : sandbox (industrie, commerce, empire, corporation) dans un univers unique persistant, multijoueur. Le MVP valide le pilier **Expansion → Colonies** en solo, avec une architecture qui n'interdit pas le multi futur.

Décisions actées avec l'utilisateur :

| Sujet | Décision |
|---|---|
| Pilier MVP | Expansion / colonies (industrie & commerce ensuite) |
| Temps | Hybride : tick serveur + timers réels (constructions, trajets, recherche) |
| Multi | Solo d'abord, univers unique visé à terme → serveur autoritaire dès le MVP |
| Combat | Aucun au MVP |
| Colonies (MVP) | Bâtiments + habitabilité, population + besoins, chaînes de production |
| Reporté v2 | Influence (design à proposer), spécialisation avancée, marché PNJ, routes auto |
| Vaisseaux | Abstraits : coût + timer de trajet, pas de flotte à l'unité |
| Progression | Mix expansion + mini-arbre tech (15–25 techs) |
| Rythme | Sessions longues : timers courts (minutes), beaucoup d'actions |
| Univers | 10–30 systèmes générés (seed), région unique *(historique MVP — univers infini depuis le chantier 9, persistant en DB depuis le 18)* |
| Objectif | Sandbox + jalons mesurables |
| Ambiance | Esthétique hard sci-fi, richesse de lore space opera (habillage léger au MVP, extensible) |
| UI | Dashboards + carte 2D (3D éventuelle bien plus tard) |
| Ambition | Hobby sérieux : en ligne à terme, archi propre sans sur-ingénierie |

## Stack technique (choix délégué)

**TypeScript full-stack, monorepo pnpm workspaces** :

- `packages/shared` — types du modèle de jeu, constantes d'équilibrage (bâtiments, ressources, techs), logique de simulation pure (fonctions déterministes testables), partagés client/serveur.
- `apps/server` — Node + **Fastify**, moteur de ticks, WebSocket (push d'état vers le client — cohérent avec les sessions longues), persistance via **Drizzle ORM**.
- `apps/web` — **React + Vite**, TanStack Query/Router (ou Zustand pour l'état temps réel), carte 2D en SVG/Canvas.

**Base de données : SQLite (better-sqlite3) au MVP**, zéro infra sur Windows ; Drizzle rend la migration PostgreSQL triviale au moment du multi. Pas de comptes au MVP : un profil/partie local, mais toute la simulation côté serveur (le client n'est qu'un dashboard) — c'est ce qui préserve le chemin vers l'univers unique. *(Historique MVP : comptes livrés au chantier 8, univers persistant en DB au chantier 18 ; la migration Postgres est le chantier 20.)*

**Moteur temps hybride** :
- Tick serveur (~5 s) : production des ressources, croissance/besoins de population, consommation.
- Timers réels absolus (timestamp de fin en DB) : constructions, recherche, trajets de vaisseaux — résolus par le tick qui les dépasse. Le serveur peut rattraper le temps hors-ligne en rejouant les ticks (catch-up borné).

## Design du jeu (MVP)

### Univers
- Génération procédurale à seed : ~20 systèmes reliés par des liaisons (graphe), 2–5 planètes/système. *(Historique MVP — univers extensible à l'infini depuis le chantier 9, matérialisé en DB depuis le 18.)*
- Types de planètes (tellurique, océanique, volcanique, glacée, aride, gazeuse) → **habitabilité** (0–100) + gisements (modificateurs de rendement par ressource).
- Brouillard léger : les systèmes non visités montrent peu d'infos ; une sonde (abstraite, coût + timer) révèle les détails. Donne un geste d'« exploration » à bas coût de dev.

### Ressources (~8)
`énergie, minerai, métaux, composants, nourriture, biens de consommation, crédits, science`
Chaîne type : minerai → métaux → composants ; ferme → nourriture ; usine → biens. Science produite par les labos, crédits par taxation de la population.

### Colonie
- **Habitabilité** : plafonne la population max et module la croissance et les coûts d'entretien.
- **Bâtiments** : ~12–15 types (mine, centrale, ferme, fonderie, usine de composants, usine de biens, habitat, labo, spatioport, entrepôt…), niveaux, file de construction avec timers.
- **Population + besoins** : les colons consomment nourriture/biens/logement et occupent des emplois dans les bâtiments ; satisfaction → croissance ou déclin ; bâtiment sans employés = rendement réduit.
- **Chaînes de production** : les bâtiments consomment/produisent par tick ; pénuries en cascade visibles dans l'UI (le plaisir de gestion vient de là).

### Expansion
- **Vaisseau colonial** (abstrait) : coût élevé en composants + timer de trajet selon distance sur le graphe → fonde une colonie.
- **Cargo** (abstrait) : transfert ponctuel de ressources entre colonies (coût + timer). Routes automatisées = v2.
- Portée de saut et coûts gatés par la tech.

### Technologie
- Mini-arbre 15–25 techs, 3 branches : **Industrie** (débloque bâtiments/chaînes), **Colonisation** (portée, habitabilité min., taille des files), **Société** (croissance, satisfaction, science). Coût en science + timer réel.

### Jalons (sandbox)
Écran « Empire » avec paliers : population totale, colonies fondées, systèmes explorés, techs, production cumulée. Sert aussi de tutoriel implicite (premiers jalons = onboarding).

### Habillage
Nommage hard sci-fi sobre (désignations de catalogue + noms de factions/lieux évocateurs). Lore = fichier de données (descriptions courtes sur planètes/techs), extensible sans toucher au code.

## UI (MVP)

1. **Carte galactique 2D** (SVG) : systèmes, liaisons, colonies, trajets en cours.
2. **Vue système** : planètes, habitabilité, gisements, bouton coloniser/sonder.
3. **Vue colonie** (écran principal) : ressources + flux net/tick, grille de bâtiments, file de construction, panneau population/besoins.
4. **Recherche** : arbre 3 branches.
5. **Empire/jalons** : agrégats + paliers.
Esthétique : dark, monospace/data-dense, style « terminal spatial ».

## Jalons de développement

1. **Socle** — monorepo, schéma DB, génération d'univers (seed), moteur de ticks + timers, WebSocket état → client affiche l'univers brut.
2. **Colonie v1** — bâtiments, file de construction, production/consommation par tick, vue colonie.
3. **Population** — besoins, emplois, satisfaction, croissance ; équilibrage de la boucle nourriture/logement.
4. **Chaînes + logistique** — chaîne minerai→métaux→composants, cargos ponctuels, alertes pénurie.
5. **Expansion** — sondes, vaisseau colonial, fondation de colonies, carte 2D interactive.
6. **Tech + jalons** — arbre, gating, écran empire, habillage lore v1.
7. **Équilibrage + polish** — pass de tuning (constantes dans `shared`), notifications, catch-up hors-ligne robuste.

Backlog v2 (hors MVP) : influence (design à proposer à ce moment), marché/économie PNJ, routes commerciales auto, spécialisations avancées, événements par gros ticks, comptes + Postgres + multi, vue 3D.

## Vérification

- **Tests unitaires** sur `packages/shared` : simulation déterministe (N ticks sur un état donné → état attendu), chaînes de production, croissance de pop, résolution de timers, catch-up.
- **Test de bout en bout manuel** à chaque jalon : lancer serveur + client (config `.claude/launch.json`), jouer la boucle dans le navigateur via le panneau Browser — fonder une colonie, construire, observer les flux sur plusieurs ticks.
- **Script de fast-forward** (dev) : avancer le temps simulé pour valider l'équilibrage sans attendre les timers réels.

## Chantier 7 — Multi territorial (planification)

Objectif : passer d'**un empire implicite** à **N empires partageant un même univers** (une seed,
une horloge de ticks), avec propriété par joueur, vues limitées par le brouillard, et **contrôle
de territoire contesté** entre joueurs. C'est le premier pas concret vers la vision « univers unique
persistant, multijoueur ». Le combat PvE (chantier 6) fournit déjà le moteur de bataille réutilisable.

**Avancement (22/07/2026)** :
- ✅ **7a** — table `players`, `ownerId` sur colonies/fleets/claims, empire par défaut créé au
  boot + estampillage à la création (migration 0004).
- ✅ **7b (données)** — état d'empire (influence, recherche, réputation, exploration) déplacé de
  `games` vers `players` ; persistance retargetée, copie one-shot en migration 0005. Forme externe
  (`game` envoyé au client) inchangée, encore mono-empire en mémoire.
- ✅ **7b (moteur)** — objet `Empire` (`apps/server/src/empire.ts`) portant les entités
  (colonies/flottes/routes/avant-postes/transferts/missions) et l'état par-joueur (influence,
  recherche, effets, brouillard, réputation, claims) ; `GameEngine` détient une `Map<playerId, Empire>`,
  une horloge partagée `clock` et les PNJ/univers. Le tick itère sur les empires (`spawnPirates`,
  marchés PNJ, portails restent partagés une fois par tick) ; `snapshotFor(empire)` recompose la
  forme externe WS. **Un seul empire instancié**, comportement et messages WS inchangés.
- ✅ **Sprint 0** — harnais de test serveur (vitest, DB `:memory:`, `apps/server/src/game.test.ts`) :
  tests socle (partie neuve, déterminisme du tick) + isolation multi-empire. Filet de non-régression.
- ✅ **7c (Phase A)** — chargement multi-empire : `load()` instancie un `Empire` par ligne `players`
  (`loadPlayers`) et route chaque entité vers son propriétaire (colonies/fleets par `ownerId`,
  transfers/missions/routes/outposts via `empireOfColony`). Un empire créé via `devSpawnEmpire`
  survit au reboot.
- ✅ **7c (Phase B)** — identité de connexion : `/ws?player=<token>` → `createOrJoinEmpire` (absent →
  défaut, connu → rejoint, inconnu → nouvel empire). `hello`/`tick` composés par connexion via
  `snapshotForEmpire` ; `notify()` = signal, chaque socket recompose sa vue. Jeton client en `localStorage`.
- ✅ **7c (Phase C)** — actions validées par empire : les ~20 méthodes d'action prennent l'empire de la
  connexion et n'opèrent que sur ses entités (rejet « inconnue » sinon). `defaultEmpire` = fallback compat.
- ✅ **Phase D (dette)** — colonnes legacy `games.*` supprimées (migration 0006) ; portails = mégastructures
  d'univers partagées (décision actée).
- ✅ **7d (Phase E)** — territoire & PvP : claims exclusifs ; `spawnPirates` sur brouillard-union ;
  helpers d'adjacence/frontière + bonus de territoire contigu (`shared/sim/territory.ts`) ;
  **PvP** `attackFleet` / `attackColony` (raid : pillage 25 % + rupture de claim) via `resolveBattle` ;
  présence étrangère (`foreignFleets`/`foreignColonies`) dans les snapshots ; une flotte révèle son
  système à l'arrivée.
- ✅ **7e (Phase F)** — UI complète : contrôles PvP (Attaquer/Raid sur entités étrangères sur zone) +
  journal des raids ; **classement des empires** dans la vue Empire (leaderboard serveur) ;
  **territoires colorés par empire** sur la carte (systèmes revendiqués visibles) ; **diplomatie
  minimale** (table `wars`, migration 0007) : Déclarer la guerre / Faire la paix, le PvP exigeant
  l'état de guerre. Vérifié end-to-end au navigateur.

**Chantier 7 (multi territorial) : terminé.** N empires partagent l'univers/l'horloge, se voient dans
le brouillard, se raident sous condition de guerre ; classement, territoires colorés, diplomatie.
Prochaines pistes (hors chantier 7) : proposition de paix mutuelle, capture de colonie, comptes
persistants (Postgres), hébergement distant.

### État actuel (contrainte de départ)
Le moteur est **strictement mono-locataire** :
- `GameEngine.load()` prend `.limit(1)` sur `games` ; aucune notion de joueur.
- L'état « empire » (influence, `researched`, `research`, `factionRep`, `explored`, claims) vit
  dans `games` / dans le singleton `GameEngine` (un seul `this.effects`, une seule série de maps).
- Le WebSocket est **sans authentification** : toute connexion voit et pilote le même empire.
- Les repaires pirates sont déjà des entités PNJ indépendantes (`pirate_lairs`) — modèle réutilisable
  pour « une entité appartient à X ».

### Découpage proposé (sous-jalons 7a → 7e)

**7a — Modèle de données : introduire le joueur.**
- Nouvelle table `players` (id, gameId, name, couleur, joinedAt). `games` redevient le conteneur
  d'univers partagé (seed, tick, lastTickAt).
- Déplacer les champs *empire* de `games` vers `players` : influence, researched, research,
  factionRep, explored.
- Ajouter `ownerId` (FK player) sur : `colonies`, `fleets`, `claims`, `routes`, `outposts`,
  `transfers`, `missions`. `pirate_lairs` et `station_states` restent PNJ/univers.
- Migration drizzle-kit + backfill : une partie solo existante → 1 player propriétaire de tout.

**7b — Moteur : de 1 empire à N.**
- Extraire un objet `Empire` (par joueur) regroupant colonies/fleets/routes/outposts/influence/
  effects/explored/factionRep/claims + helpers ; `GameEngine` détient `Map<playerId, Empire>` +
  l'horloge et l'univers partagés.
- Le tick avance l'horloge commune ; production/éco par colonie (déjà keyée par propriétaire),
  recherche/influence/effects **par joueur**, brouillard **par joueur**.
- Marchés PNJ, résolution des timers, spawn pirates : restent au niveau univers.

**7c — Réseau & identité (léger, sans comptes).** *La vraie bascule « en mémoire → bout-en-bout ».*
Le moteur porte déjà N empires en mémoire (validé à 3 via `devSpawnEmpire`) ; 7c connecte ça au réseau.
Ordre imposé par les dépendances :
1. **Chargement multi-empire dans `load()`** *(fondation, en premier)* — instancier un `Empire` par
   ligne `players` (fin du `defaultEmpire` unique). Router les entités : `colonies`/`fleets`/`claims`
   par `ownerId` (direct) ; `transfers`/`missions`/`routes`/`outposts` (pas d'`ownerId`) via la colonie
   (`ownerColonyId`/`fromColonyId`) grâce à un index `colonyId → empireId`. Testable de suite : au reboot,
   les empires créés par `devSpawnEmpire` survivent.
2. **Handshake de connexion** — `/ws?player=<token>` rejoint un empire existant, sinon en crée un
   (réutiliser la logique de `devSpawnEmpire`). Jetons légers, on reste SQLite (comptes + Postgres =
   ligne v2 séparée).
3. **`hello` / `tick` par connexion** — chaque socket reçoit `snapshotFor(sonEmpire)` (déjà écrit en 7b) :
   ses entités + l'univers redacté à son brouillard + la présence étrangère visible là où il voit.
   `notify()` fan-out par connexion (map `socket → empireId`) au lieu de diffuser le seul `defaultEmpire`.
4. **Actions validées par `playerId`** *(le gros du travail)* — les ~20 méthodes d'action (`build`,
   `probe`, `colonize`, `moveFleet`, …) ciblent aujourd'hui `defaultEmpire` via les getters délégués :
   les threader par empire (comme le tick en 7b) et rejeter toute action sur une entité non possédée.
5. **Retrait de `defaultEmpire` global** — ne garder qu'un fallback de compatibilité.

> **DoD 7c** : deux onglets = deux empires sur la même seed ; chacun ne voit/pilote que le sien ;
> snapshots et brouillard distincts. `insertMission` threadé par empire au passage.

**7d — Territoire & contestation (le cœur « territorial »).**
1. **Claims exclusifs** — un système revendicable par un seul empire à la fois.
2. **Contestation** — revendiquer/rompre un claim ennemi exige une présence militaire (flotte) dans
   le système ; notion de frontière/adjacence sur le graphe (bonus de territoire contigu, points
   d'étranglement).
3. **PvP** — étendre l'attaque (aujourd'hui flotte → repaire pirate) à **flotte → flotte** et
   **flotte → colonie** ennemies. `resolveBattle` (`packages/shared/src/sim/combat.ts`) est déjà
   agnostique attaquant/défenseur : réutilisable tel quel.
4. **Défense & conséquences** — défense de colonie (garnison / défense orbitale) ; raid de ressources,
   rupture de claim, à terme capture de colonie.
5. **Brouillard univers pour `spawnPirates`** — remplacer le provisoire (fog du `defaultEmpire`, marqué
   en TODO dans le code) par l'union des `explored`.

> **DoD 7d** : un empire attaque une flotte/colonie/claim d'un autre ; le perdant subit des conséquences
> observables ; le spawn PNJ ne dépend plus d'un empire particulier.

**7e — UI & polish.**
- Carte : territoires colorés par empire, flottes étrangères dans les systèmes visibles.
- Vue Empire : relations / classement.
- Contrôles d'attaque ciblant des entités étrangères ; journal des batailles PvP.
- Diplomatie minimale (guerre / paix).

### Dette technique à solder en chemin
- **Colonnes legacy** `games.{explored,researched,research,influence,factionRep}` : à supprimer
  (migration) une fois 7c stable — ne servent plus qu'à l'ensemencement one-shot d'un player neuf.
- **Aucun test unitaire serveur** : `game.ts` n'est couvert que par typecheck + vérif manuelle.
  **Avant le PvP (7d)**, monter un harnais de test serveur (vitest + DB en mémoire) pour verrouiller
  la non-régression. C'est le risque le plus élevé de la suite.
- **`gatewayMap`** : décider si les méga-projets de portail restent game-scoped (actuel) ou deviennent
  contribuables/possédés par empire.
- **Outil de dev** `devSpawnEmpire`/`/dev/empires` : conservé pour tester 7c-1 ; à retirer ou garder
  selon l'usage une fois le handshake réel en place.

### Plan d'exécution (7c → 7e)

Principe repris de 7b : sous-étapes fines, chacune **compile + tests verts + committée à part**,
comportement préservé quand c'est possible. Tailles indicatives : **S** ≈ ½j · **M** ≈ 1-2j · **L** ≈ 3j+.

**⚠️ Sprint 0 — Harnais de test serveur** *(pré-requis : `game.ts` n'a aujourd'hui aucun test)*.
- 0.1 Config vitest pour `apps/server` + helper `buildEngine(seed, {db temporaire})` — **S**.
- 0.2 Tests socle : déterminisme du tick mono-empire (N ticks → état attendu) — **S**.
- 0.3 Tests multi-empire : isolation (2 empires ne se contaminent pas) + redaction fog de
  `snapshotFor` — **M**.
- **Gate** : ces tests restent verts pour tous les commits des phases suivantes.

**Phase A — 7c-1 : chargement multi-empire** *(fondation, faible risque, gros levier)*.
- A.1 `loadPlayers()` : un `Empire` par ligne `players` ; `defaultEmpire` = 1ᵉʳ (compat) — **S**.
- A.2 Router `colonies`/`fleets`/`claims` par `ownerId` — **M**.
- A.3 Router `transfers`/`missions`/`routes`/`outposts` via index `colonyId → empireId` (ces tables
  n'ont pas d'`ownerId`) — **M**.
- **DoD** : `devSpawnEmpire` ×2 → reboot → `/dev/empires` repeuple correctement les 2 empires.

**Phase B — 7c-2/3 : identité de connexion & snapshots par connexion** *(touche `apps/web`)*.
- B.1 Registre `socket → empireId` + `createOrJoinEmpire(token)` (généralise `devSpawnEmpire`) — **M**.
- B.2 Handshake `/ws?player=<token>` ; jeton client en `localStorage` passé dans l'URL WS — **M**.
- B.3 `hello` par connexion = `snapshotFor(empire)` ; `notify()` fan-out par socket — **M**.
- **DoD** : 2 onglets `?player=A`/`?player=B` → dashboards et brouillards distincts sur la même seed.

**Phase C — 7c-4 : actions validées par empire** *(gros morceau, risque moyen-élevé)*. Threader
l'empire de la connexion dans les ~20 méthodes d'action + rejeter toute action sur une entité non
possédée. Découpé par domaine :
- C.1 Colonie/prod (`build`, `buildShip`, `buildOutpost`, `startResearch`) — **M**.
- C.2 Logistique (`sendTransfer`, `sell`/`buyFromStation`, routes, `contributeGateway`) — **M**.
- C.3 Expansion/territoire (`probe`, `colonize`, `claim`/`unclaimSystem`) — **M**.
- C.4 Flottes (`createFleet`, `buildWarship`, `moveFleet`, `attackLair`, `disband`, directives) — **M**.
- C.5 Retrait de `defaultEmpire` global (fallback compat) + `insertMission` threadé — **S**.
- **DoD** : un joueur n'agit que sur ses entités ; action croisée rejetée proprement. Sprint 0 crucial ici.

**Phase D — dette** *(fenêtre propre après C)*.
- D.1 Migration : supprimer colonnes legacy `games.{explored,researched,research,influence,factionRep}` — **S**.
- D.2 Décision + implémentation `gatewayMap` (game-scoped vs par-empire) — **S/M**.

**Phase E — 7d : territoire & PvP** *(logique pure dans `shared`, orchestration dans `game.ts`)*.
- E.1 Claims **exclusifs** (un système = un empire) + validation — **S**.
- E.2 Helpers frontière/adjacence sur le graphe (pur, `shared`, testable) + bonus territoire contigu — **M**.
- E.3 PvP : `attackFleet`/`attackColony` via `resolveBattle` (déjà agnostique) + actions WS + contrôles
  client — **L**.
- E.4 Défense de colonie (garnison/orbitale) + conséquences (raid ressources, rupture de claim) — **L**.
- E.5 `spawnPirates` sur brouillard-univers (union des `explored`) — retire le TODO 7b — **S**.
- **DoD** : un empire attaque flotte/colonie/claim ennemi ; conséquences observables ; spawn PNJ
  indépendant d'un empire.

**Phase F — 7e : UI & polish** *(peut chevaucher E)* — **L**. Carte territoires colorés + flottes
étrangères ; vue Empire/classement ; contrôles d'attaque + journal PvP ; diplomatie minimale.

**Chemin critique** : `Sprint 0 → A → B → C → D`, puis `E → F`. E.2 (graphe, pur `shared`) est
parallélisable dès Sprint 0 ; F peut démarrer dès que B expose des snapshots par joueur. **Point ouvert
à trancher en B** : stockage du jeton client (reco `localStorage`). **Prochaine action recommandée** :
Sprint 0.1 + Phase A.1 dans la même session (petit, pose le filet, validé de suite par `devSpawnEmpire`).

### Décisions à acter avant d'implémenter
1. **Identité** : jetons de joueur légers maintenant (rester SQLite) *vs* vrais comptes tout de suite.
   → Reco : jetons légers d'abord, comptes plus tard.
2. **Portée du multi** : multi *local* d'abord (plusieurs onglets = plusieurs joueurs, testable en
   dev) *vs* multi distant hébergé immédiatement.
   → Reco : bâtir le modèle multi-locataire + multi local d'abord, différer l'hébergement.
3. **Intensité PvP** : raid + contestation de claims d'abord *vs* conquête/capture de colonies dès
   le départ.
   → Reco : raid + claims d'abord, capture ensuite.
4. **Diplomatie** : aucune (chacun pour soi) *vs* guerre/paix minimale.
   → Reco : guerre/paix minimale.

### Vérification du chantier
- Tests unitaires `shared` : contestation de claim, résolution PvP (déjà couvert côté bataille),
  isolation des effets par empire.
- E2E multi local : deux onglets → deux empires sur la même seed, l'un attaque une flotte/claim
  de l'autre, vérifier fog et snapshots distincts.

## Chantiers 8 → 12 (planification 23/07/2026)

Cinq chantiers séquentiels, décidés avec l'utilisateur, qui prolongent le multi territorial
(chantier 7) vers un univers persistant réellement partagé :

| # | Chantier | Cible |
|---|---|---|
| 8 | **Comptes joueurs** | e-mail + mot de passe (scrypt maison, zéro dépendance), sessions à jeton, WS authentifié |
| 9 | **Univers infini + carte** | génération par galaxie indépendante, frontière glissante, spirale d'angle d'or, pan/zoom sur les 3 niveaux |
| 10 | **Vue corps** | niveau planète/lune : orbite, fiche physique dérivée de l'id, grille d'emplacements |
| 11 | **Arbre de recherche** | DAG rendu en SVG, ~35–40 techs, file de recherche planifiable |
| 12 | **Logistique** | stock sol + stock orbital, carburant/masse/classes de vaisseaux, convois, prix régionaux |

Décisions actées : comptes maison (pas d'OAuth) · logistique **complète** (couche orbitale) ·
expansion par **frontière glissante** avec galaxie de départ partagée (les nouveaux joueurs
naissent au voisinage des anciens) · ordre de livraison 8 → 12.

Le plan détaillé (écart avec l'existant, sous-étapes, fichiers, vérification) vit hors dépôt :
`~/.claude/plans/ok-il-y-a-cosmic-peach.md`.

### Chantier 8 — Comptes joueurs ✅ (23/07/2026)

- Tables `accounts` (e-mail unique, hash `scrypt$sel$hash`) et `sessions` (jeton opaque de
  32 octets, TTL 30 jours glissant), colonne `players.accountId` — migration 0008.
- `apps/server/src/auth.ts` : hachage/vérification à temps constant, cycle de vie des sessions,
  validation des saisies, anti-force brute par IP. Aucune dépendance ajoutée (`node:crypto`).
- REST `/auth/register|login|logout|me`, jeton en `Authorization: Bearer`. La connexion ne
  distingue jamais « e-mail inconnu » de « mot de passe faux » (pas d'énumération de comptes).
- `/ws?session=<token>` : session invalide → fermeture `4001`, le client repasse par l'écran de
  connexion. `createOrJoinEmpire` (jetons 7c) est remplacé par `empireForAccount` /
  `createEmpireForAccount`.
- **Adoption** : le premier compte inscrit reprend l'empire amorcé au boot au lieu d'en créer un
  second — sans quoi un empire fantôme resterait posé sur la meilleure planète de la galaxie.
- Client : `useAuth` (session en `localStorage`, revalidée contre `/auth/me` au montage),
  `AuthView` (connexion/inscription), `AuthGate` dans `main.tsx` — rien du jeu n'est monté avant
  authentification. Empire et déconnexion dans la barre supérieure.
- Vérifié au navigateur : inscription, adoption de l'empire existant, second compte sur une autre
  planète, rechargement, déconnexion (session révoquée côté serveur), reconnexion, refus WS 4001.

### Chantier 9 — Univers extensible + carte navigable ✅ (23/07/2026)

**Génération.** `GALAXY_DEFS` (3 galaxies en dur, RNG séquentiel unique, pool de noms partagé
et mutable) laisse place à `generateGalaxyAt(seed, index)` : chaque galaxie a son RNG dérivé et
naît sans les précédentes. `galaxyDefAt` déduit du seul index le nom, la taille, la richesse et
la position — spirale d'angle d'or `r = ESPACEMENT × √index`, densité constante et extension
sans borne, galaxie 0 au centre. Les noms se composent par syllabes indexées avec un pas premier
avec l'espace de noms : bijection, donc aucun doublon sans mémoire des noms déjà tirés.

**Frontière glissante.** `shared/sim/expansion.ts` (pur, testé) tient l'invariant : il reste
toujours `FRONTIER_GALAXIES` (3) galaxies sans la moindre colonie devant les joueurs. Coloniser
la dernière vierge pousse le bord. `growUniverse` déroule les indices suivants, réindexe
l'univers, équipe les galaxies neuves (comptoirs, chantier de portail) et persiste
`games.galaxyCount` (migration 0009). Appelé au boot, à chaque arrivée d'empire et à chaque tick
économique. Plafond de sécurité : `MAX_GALAXIES`.

**Placement.** `pickStarterGalaxy` pose les arrivants dans la galaxie peuplée la plus proche du
centre ayant encore de la place (`MAX_EMPIRES_PER_GALAXY` = 4), sur un système vierge : les
joueurs naissent voisins — commerce, frontières et PvP dès le début — au lieu d'être éparpillés.
Le coût d'un portail croît de 35 % par rang d'éloignement (`gatewayCost`), sinon les anneaux
lointains, plus riches, seraient aussi accessibles que les proches.

**Carte.** `ZoomableSvg` (molette, glisser, recentrage, zoom borné) équipe les trois niveaux.
`UniverseMap` calcule son cadrage d'accueil pour contenir l'amas connu, ne dessine que les
galaxies dans le cadre et allège l'affichage au dézoom (halo → nom → statistiques). `MapNav`
ajoute recherche (galaxies, systèmes explorés, colonies — jamais au-delà du brouillard),
raccourcis et historique avant/arrière.

**Bug trouvé à la vérification** : le serveur étendait l'univers sans que le client le reçoive —
l'univers n'était réémis que si le *brouillard* du joueur avait changé. D'où `universeDirty`,
distinct de `explorationDirty`, avec test de non-régression sur le chemin de notification.

> ⚠️ La génération ayant changé pour une seed donnée, les parties antérieures ne sont pas
> migrables : `apps/server/spacesim.db` a été supprimé au passage.
> *(Pratique close par le chantier 18 : l'univers vit désormais en DB et un changement du
> générateur n'invalide plus rien.)*

### Chantier 10 — Vue planète / lune ✅ (23/07/2026)

`MapView` gagne un quatrième niveau `body`. `BodyView` montre le schéma orbital (corps au centre,
lunes cliquables, encart de sa propre orbite), une fiche physique, les gisements et la **grille
des emplacements** (occupés par type, en chantier, libres). Les actions de colonisation sont
extraites dans `BodyActions`, partagé avec le `SystemPanel` — lui-même réduit à des lignes
compactes cliquables.

`sim/bodies.ts` calcule la fiche (rayon, gravité, température, atmosphère, jour, révolution)
**depuis l'id du corps**, non depuis le générateur d'univers : aucune partie invalidée, même
résultat client et serveur. Deux corrections issues de la vérification : l'écart de température
dû à la distance est borné (une glacée proche restait affichée à +42 °C) et la fiche est
corrélée à l'habitabilité (un monde à 90 s'annonçait « toxique »).

### Chantier 11 — Arbre de recherche ✅ (23/07/2026)

**Contenu.** 22 → 35 techs, profondeur 5-6, avec des prérequis **croisés entre branches**
(nanofabrication = industrie + société, deep_terraforming = colonisation + industrie,
dreadnoughts = militaire + industrie) : les branches ne se parcourent plus en silos. Six
nouveaux leviers d'effet, tous câblés dans la simulation — besoins alimentaires, stockage,
vitesse des chantiers civils et navals, rendement des avant-postes, rayonnement — plus trois
classes de vaisseaux (corvette, bombardier, cuirassé).

**Outils purs** (`sim/techtree.ts`) : `techDepth` (plus long chemin, pour que chaque tech soit
dessinée à droite de tous ses prérequis), `techLayout`, `researchPath`, `pathCost`,
`validateTree` (cycles et prérequis inconnus, vérifiés en CI).

**UI.** `ResearchView` devient un graphe SVG : bandes par branche, arêtes de prérequis, cinq
états, survol qui éclaire la chaîne. Une tech verrouillée se **planifie en un clic** :
`players.researchQueue` (migration 0010) enchaîne les recherches seules, patiente si la science
manque, et abandonne les techs acquises entre-temps par un autre chemin.

### Chantier 12 — Logistique ✅ (24/07/2026)

Trois couches qui transforment l'acheminement en pilier de jeu.

**Orbite.** `Colony` porte désormais `orbitalResources` et `liftRules` (migration 0011) ; le
bâtiment `orbital_dock` fixe la capacité de stockage orbital et le débit de l'ascenseur.
`sim/orbital.ts` (`applyLift`) déplace les ressources sol↔orbite selon les consignes, débit
**partagé** entre ressources, en consommant de l'énergie au sol pour monter. **Les vaisseaux ne
chargent que l'orbite** : `sendTransfer`, routes, ventes et achats puisent et livrent via
`takeFromOrbit`/`deliverToOrbit`. Sans dock, une colonie ne peut rien exporter — d'où un dock
amorcé à la fondation. UI : `OrbitPanel` (état du dock, tableau sol/orbite, consignes) et anneau
de soute sur la vue corps.

**Transport.** `ShipDef` gagne `speedMult` et `fuelPerJump` ; deux classes qui posent un choix
(transporteur lourd et lent, courrier léger et rapide). `travel.ts` : `convoyDurationMs` (allure
du plus lent), `convoyFuel` (par vaisseau, par saut, par masse — prélevé en orbite), `convoyFees`
(distance + péage de portail). Les convois manuels deviennent multi-vaisseaux, avec devis en
direct dans `TransferPanel`.

**Prix régionaux.** `stationPrice(resource, stock, ctx)` applique un multiplicateur déterministe
(biais propre à la station × éloignement de la galaxie) : les anneaux lointains paient cher le
manufacturé et bradent le brut. `MarketsView` compare les comptoirs explorés (prix, écart,
distance, marge nette) — l'outil qui rend l'arbitrage jouable. Toute la logistique se regroupe
dans `LogisticsView` (Routes / Convois / Orbite / Marchés).

**Techs dédiées** : `space_elevator` (débit, capacité, carburant −20 %, débloque le transporteur),
`trade_charters` (marge en station, cumulée à la réputation).

### Chantier 13 — Conception de vaisseaux ✅ (25/07/2026)

Fin des classes de vaisseaux figées (`content/ships.ts`, `content/warships.ts`) : un vaisseau
est désormais un **plan** (`Blueprint`) — un châssis garni de modules, sauvegardé, produit,
commercialisé. Le langage de conception est **hybride à la Endless Space** (châssis génériques
ou spécialisés, chacun avec un rôle) et **EVE-like côté contraintes** (emplacements typés en
nombre fixe **et** budgets partagés énergie/tonnage/calcul).

**Contenu** (`content/chassis.ts`, `content/modules.ts`, `content/presets.ts`). Un `ChassisDef`
fixe la coque de base, les budgets, les emplacements par type (`weapon`/`defense`/`propulsion`/
`utility`) et un `domain` (`fleet` = flotte militaire, `colony` = pool civil de la colonie) — le
seul reliquat de l'ancienne séparation civil/militaire, tous les rôles de module restant
montables sur les deux domaines. Un `ModuleDef` occupe un emplacement, consomme des budgets et
porte des effets cumulables (arme, bouclier, coque, soute, vitesse, carburant, minage,
colonisation, soutien de flotte, initiative). Les 4 classes civiles et 7 classes militaires
historiques sont réexprimées en `PRESETS` : preuve que le langage couvre l'existant, base
d'amorçage des nouveaux empires et catalogue des stations PNJ.

**Résolveur pur** (`sim/design.ts`, testé) : `resolveBlueprint` calcule les stats effectives
(base du châssis + somme des effets de modules, majorés par le `roleBonus` du châssis pour son
rôle de prédilection) ; `validateBlueprint` contrôle emplacements, budgets et déblocages par la
recherche. Le triangle de forces du combat (`content/warships.ts`) est passé de classes figées à
des **catégories** (`skirmisher`/`line`/`capital`/`support`) dérivées des stats résolues —
`sim/combat.ts`, `sim/ships.ts` et `sim/travel.ts` acceptent désormais des stats injectées
(défaut : tables historiques, zéro régression) au lieu d'importer les tables globales.

**Recherche débloque tout.** `EmpireEffects` gagne `unlockedChassis`/`unlockedModules`, dérivés
de la seule source `requiresTech` des définitions — militaire (armes, défenses), industrie
(propulsion, soute), colonisation/industrie (extraction), colonisation (habitat). Quatre techs
dédiées à la conception, croisées entre branches : armement plasma, blindage réactif, propulsion
à graviton, prospection xéno (débloque aussi le châssis éclaireur lointain, spécialisé senseurs
et minage).

**Serveur autoritaire** (`apps/server`). Table `blueprints` (migration 0012, changement cassant —
`spacesim.db` supprimée ; *pratique close par le chantier 18*). `Empire.blueprintMap` chargée/persistée, amorcée aux presets de départ
à la création d'un empire. Actions `createBlueprint`/`updateBlueprint`/`deleteBlueprint`
(revalidées côté serveur) et `buildBlueprint` (routé par `domain` vers le chantier civil ou la
file de la flotte). Le combat (`attackLair`/`attackFleet`/`attackColony`) construit une carte de
définitions de combat à partir des plans des empires impliqués.

**UI** : nouvel onglet **Chantier** — `ShipDesigner` (choix du châssis débloqué, grille de
slots avec ajout/retrait de modules, jauges de budget et récap de stats en direct, sauvegarde) et
`BlueprintList` (production vers la colonie ou une flotte, édition, suppression).

**Marché de plans PNJ.** `StationPanel` gagne une section « Plans de vaisseaux » : achat d'un
preset au catalogue (marge +40 %), revente d'un plan possédé ou d'un vaisseau assemblé désœuvré
(décote −50 %), au prix de référence des ressources (`sim/design.ts`, `costValue`/
`blueprintValue`) — transaction instantanée, un plan n'étant pas une cargaison physique à
convoyer contrairement aux ressources.

**Chantier 13 (conception de vaisseaux) : terminé.**

### Chantier 14 — Économie PNJ ✅ (25/07/2026)

Les empires PNJ (`players.kind = "npc"`) gèrent leurs colonies sans joueur derrière.
`decideColonyEconomy(colony)` (`sim/economy/npc.ts`, pur et déterministe) inspecte chaque
ressource de marché et décide, par seuils fixes (`NPC_SURPLUS_THRESHOLD` en orbite,
`NPC_DEFICIT_THRESHOLD` au sol), de vendre l'excédent ou de publier un besoin. Côté serveur
(`logistics-service.ts`, section « Économie PNJ »), `npcTick(empire)` rejoue cette décision à
chaque cycle économique : `npcSellSurplus` vend directement au comptoir le plus proche de la
même galaxie (`nearestStation`), `npcPostContract` publie un contrat au prix spot majoré
(`NPC_CONTRACT_PRICE_MULT`), sans jamais empiler deux contrats pour la même ressource/colonie.

Un **contrat de fourniture** (`Contract`, `model/social.ts`) est une offre d'achat à prix et
quantité fixes, avec échéance (`CONTRACT_MIN/MAX_DURATION_MS`, plafond
`MAX_OPEN_CONTRACTS_PER_EMPIRE`) : `remaining` se décrémente à l'**acceptation**, pas à la
livraison — sans quoi un même contrat pourrait être survendu pendant qu'un convoi est en route.
`postContract`/`acceptContract`/`cancelContract` (WS) fonctionnent aussi bien entre joueurs
qu'avec un PNJ ou une faction (chantier 15). `bootstrapNpcEmpires` amorce quelques empires PNJ
au démarrage d'une base neuve. UI : `ContractsView`, un des cinq sous-onglets de Logistique.

### Chantier 15 — Factions ✅ (25/07/2026)

Chaque faction PNJ a une humeur (`FactionMood` : neutre / essor / pénurie / embargo) qui bascule
au hasard mais de façon déterministe (`factionTick`, `sim/economy/factions.ts` —
`FACTION_MOOD_SHIFT_CHANCE` 8 % par cycle éco, `FACTION_MOOD_DURATION_MS` 30 min) puis revient à
neutre à l'échéance. Un essor accorde une remise aux achats du joueur (`moodRebateBonus`), une
pénurie fait publier à la faction un contrat de pénurie **sans séquestre** (une faction n'a pas
de solde propre — `factionPostShortageContract`, prix spot × `FACTION_CONTRACT_PRICE_MULT`), un
embargo ferme le commerce aux empires dont la réputation est sous
`FACTION_EMBARGO_STANDING_THRESHOLD` (`embargoBlocks`, `stationEmbargoed`). Les prix en station
cumulent désormais réputation, marge des chartes commerciales (chantier 12), humeur de faction
et événements de monde (chantier 17) dans un seul `priceContextOf`. UI : section « Factions » de
`EmpireView` — barre de réputation par palier, badge d'humeur, contrat ouvert affiché en ligne.

### Chantier 16 — Diplomatie ✅ (25/07/2026)

Les relations inter-empires (`Relation`, paire canonique `empireA < empireB`) passent par quatre
états : neutre, pacte de non-agression, alliance, guerre. `sim/empire/diplomacy.ts` porte les
règles pures : `declareWarReason`/`makePeaceReason`/`proposeRelationReason`/
`breakRelationReason` refusent les transitions invalides (déclarer la guerre à un allié sans
rompre l'alliance d'abord, republier une proposition déjà en attente…). Déclarer la guerre coûte
`DECLARE_WAR_INFLUENCE_COST` (50 influence) et pose un cooldown de 10 min (`WAR_COOLDOWN_MS`)
avant de pouvoir la redéclarer après une paix. Un PNJ accepte toujours un pacte de
non-agression, mais une alliance seulement si le ratio de puissance de flotte du proposant reste
dans une fourchette raisonnable (`npcAcceptsProposal`, `NPC_ALLIANCE_MIN/MAX_POWER_RATIO`).
Remplace l'ancienne table `wars` (migration `0014_secret_mongoose.sql`). UI : pas de vue dédiée
— badges de relation et actions contextuelles (proposer/accepter/refuser/rompre/déclarer la
guerre) dans le classement des empires d'`EmpireView`.

### Chantier 17 — Objectifs éphémères et événements de monde ✅ (25/07/2026)

**Objectifs (17.1, 17.4).** Chaque empire humain se voit tirer un objectif temporaire
(`generateObjectiveSpec`, `sim/empire/objectives.ts`) parmi quatre genres — coloniser N
systèmes, tenir un système revendiqué, mener en population, mener en influence — avec une
échéance d'une heure (`OBJECTIVE_DURATION_MS`) et une récompense de 200 crédits. Un seul
objectif ouvert à la fois par empire ; un cooldown après complétion/expiration évite de retirer
aussitôt un objectif trivialement déjà vrai (ex. « mener en influence » resservi en boucle).
`resolveObjectives` verse la récompense ou expire l'objectif à chaque tick.

**Événements de monde (17.2).** Un tirage à 5 % par cycle éco (`rollWorldEvent`,
`sim/empire/worldEvents.ts`) peut déclencher, sur une galaxie ou une faction prise au hasard :
crise économique (malus de prix en station), ruée vers l'or (bonus de prix), vague de piraterie
(multiplie ×3 la chance de spawn d'un repaire pirate le temps de l'événement) ou essor de
faction (force l'humeur d'une faction à « boom », chantier 15). Durée fixe de 30 min
(`WORLD_EVENT_DURATION_MS`), pas de statut : l'événement disparaît simplement à expiration.

**Zones d'activité économique (17.3, dérivé UI).** `galaxyActivity`/`normalizedActivity`
(`sim/economy/economicZones.ts`) additionnent la valeur des contrats ouverts (PNJ et faction
compris) par galaxie et normalisent le résultat entre 0 et 1 : la carte univers (`UniverseMap`)
affiche un halo de chaleur économique dont le rayon suit l'intensité.

UI (objectifs et événements) : bloc « Fil du monde » d'`EmpireView`, avec compte à rebours et
libellés dédiés par genre.

**Chantiers 14 à 17 (économie PNJ, factions, diplomatie, objectifs/événements de monde) :
terminés.**

### Chantier 18 — Univers persistant en DB ✅ (27/07/2026)

**La vision devient un invariant.** Comme EVE Online : une fois le serveur officiel lancé,
son univers ne sera **jamais réinitialisé** — seulement étendu (frontière), corrigé
(UPDATE ciblé) et amélioré (nouvelles galaxies produites par un générateur qui évolue).
Jusqu'ici l'univers était régénéré depuis la seed à chaque boot, et toute modification du
générateur invalidait la base (deux resets actés aux chantiers 9 et 13 — les derniers de
l'histoire du projet).

**Matérialisation.** Six tables `universe_*` (galaxies, systèmes, liens, corps, ceintures,
stations) deviennent la **source de vérité**. Colonnes `*_index` pour reconstruire les
tableaux à l'identique ; `parent_galaxy_index` **figé à la matérialisation** (l'arbre des
trous de ver ne dépend plus des constantes de spirale) ; `generator_version` pour la
traçabilité. `universe-store.ts` : `appendGalaxies` (une transaction, idempotent, aligne
`games.galaxyCount`), `loadUniverse` (l'UPDATE manuel d'un corps survit au reboot — testé),
`withParentIndexes`.

**Le générateur ne sert plus qu'à la frontière.** `growUniverse` matérialise les galaxies
neuves ; le boot charge depuis la DB (`GameRuntime` reçoit l'univers, ne le génère plus).
`galaxyIndexOfSystem` dérive de l'id (`gal-N`), plus de la position du tableau.

**Verrou anti-corruption.** `GENERATOR_VERSION` (shared) + fixture gelée
`universe.fixture.json` vérifiée par snapshot : modifier le flux de sortie du générateur
casse le test ; l'assumer = régénérer la fixture **et** bumper la version dans le même
commit. Règle sœur : tout habillage dérivé se calcule depuis l'**id** du corps (patron
`bodyPhysicals`, chantier 10), jamais depuis le flux RNG.

**Boot explicite.** `GameEngine.load()` lève sur base vierge (un serveur officiel ne peut
pas recréer un univers par accident) ; `bootstrapNewUniverse()` est le geste de création,
une fois dans la vie du serveur ; `loadOrBootstrap()` reste le confort dev/tests. Une base
d'avant ce chantier est migrée par un **rattrapage one-shot** au boot (matérialisation
depuis la seed, parents figés sur les positions réelles), idempotent et rejouable.

**Hors périmètre, noté pour la suite** : lever la résidence RAM de l'univers
(`MAX_GALAXIES = 200` conservé), paginer le payload `hello` (univers complet à chaque
connexion), FK réellement appliquées au schéma Postgres (chantier 20).

### Chantier 19 — Découpage backend ✅ (28/07/2026)

**`game.ts` cesse d'être un god file.** Il ne fait plus 1453 lignes de passe-plat : boot
statique (`load`/`bootstrapNewUniverse`/`loadOrBootstrap`), câblage explicite
(`runtime/composition.ts` → `composeEngine`), et une façade fine qui expose les services
publics. Aucun conteneur DI, aucune classe magique — juste des fonctions et des fermetures
composées une fois au boot (`runtime/boot.ts`), un `scheduler.ts` (start/stop/catch-up
horloge) et un `notifier.ts` (listeners + drapeaux « dirty »).

**`logistics-service.ts` (1719 lignes) éclaté par domaine**, du plus détachable au cœur :
`gateway-service.ts` (portails), `contract-service.ts` (contrats de pénurie),
`market-service.ts` (marché PNJ, IA éco, commerce station), `logistics-service.ts` résiduel
(convois, routes, avant-postes, missions). `diplomacy-service.ts` a suivi le même sort côté
diplomatie/objectifs/événements de monde/factions. Au total neuf services par domaine
(`industry`, `logistics`, `gateway`, `contract`, `market`, `exploration`, `fleetService`,
`diplomacy`, `objective`) + `bootstrap` + `devService`, tous composés par `composeEngine`
(`runtime/composition.ts`) et orchestrés à chaque tick par `TickRunner`
(`runtime/tick-runner.ts`) — plus de `TickHost` à 21 méthodes.

**Repositories réels** (`runtime/repositories/`, un propriétaire par table : colony, fleet,
logistics, market, contract, gateway, claim, diplomacy, objective, world-event, faction,
blueprint, player, game) : `loadAll()` async au boot, `save/insert/remove` synchrones — la
couture exacte où le write-behind du chantier 20 s'est branché sans changer une signature.
`mission-resolution.ts` remplace le switch à 8 branches de `resolveMissions` par une table de
handlers enregistrés par leurs services propriétaires.

**Le filet de tests est resté tendu pendant les extractions** : `game.test.ts` (1514 lignes,
17 `describe`) éclaté en fichiers co-localisés par domaine (`test-harness.ts` commun pour
`resetDb`/boot/avance de ticks), même nombre d'assertions avant/après chaque split — les
diffs sont des déplacements purs, jamais des changements de comportement.

### Chantier 20 — Postgres + write-behind + durcissement prod ✅ (28/07/2026)

**Le problème** : `better-sqlite3` est synchrone ; passer les repositories en async
naïvement aurait introduit des entrelacements (une commande WS pendant l'`await` d'un tick
= course sur les maps mémoire du runtime). **La solution retenue : write-behind.** La
simulation et les commandes restent 100 % synchrones (mutations en RAM, qui fait autorité) ;
chaque repository écrit dans un `WriteSet` (`runtime/persistence/write-set.ts` — upserts
keyés `(table, pk)` en dernier-écrivain-gagne, plus deletes) ; un `Persister`
(`runtime/persistence/persister.ts`) le flushe en transaction, sérialisé par une chaîne de
promesses (`tail`) pour qu'un flush concurrent n'entrelace jamais deux transactions.
`notify()` part immédiatement après la mutation RAM, sans attendre le flush — compromis
assumé et documenté : un crash perd le travail depuis le dernier flush (au pire une commande
ou un lot de ticks de 5 s), la DB reste toujours cohérente. `lastFlushAt`/`lastFlushError`
exposés pour la supervision. Propriété clé : un rattrapage de N ticks produit O(entités)
écritures, jamais O(ticks).

**Schéma Postgres réel**, avec FK déclaratives cette fois **appliquées** : `colonies.planetId
→ universe_bodies`, `fleets/claims/contracts/battles/pirateLairs.systemId →
universe_systems`, `outposts.beltId → universe_belts`, `stationStates.stationId →
universe_stations`, `gateways/worldEvents.galaxyId → universe_galaxies`. `missions.targetId`
et `routes.fromId/toId` restent volontairement polymorphes (documentés en commentaire, pas de
FK possible). `createDb(url)` (`db/index.ts`) route par schéma d'URL : `postgres://` →
`drizzle-orm/node-postgres` (prod, service `postgres:17-alpine` du compose, volume nommé
`pgdata` — le seul reset volontaire redevient `docker compose down -v`, plus jamais un `rm`
de fichier) ; sinon `drizzle-orm/pglite` (WASM embarqué en mémoire, tests et e2e, même
dialecte SQL que la prod). `withTransaction` sérialise en plus les transactions concurrentes
au niveau connexion (défense en profondeur, la connexion PGlite unique ne tolère pas deux
transactions en vol).

**Prod ne repart jamais de zéro sans geste explicite** : `GameEngine.load()` seul au boot ;
créer l'univers officiel demande `SPACESIM_BOOTSTRAP=1` (une bascule, jamais un défaut).

**Durcissement HTTP** (`config.ts`, schéma Zod validé au premier import — erreurs lisibles
immédiatement plutôt que des `undefined` qui remontent en runtime) : `@fastify/rate-limit`
(`RATE_LIMIT_MAX`/minute), `@fastify/cors` (`CORS_ORIGIN`), logs pino avec redaction de
`authorization`, routes `/dev/*` à double verrou (jamais actives en prod sauf `DEV_ROUTES=1`
explicite + warning).

**Sauvegardes** : `scripts/backup.sh` (`pg_dump -Fc`, horodaté, restaurable sélectivement via
`pg_restore`) — voir le script pour l'usage exact dans le compose de dev vs. un déploiement
réel.

### Chantier 21 — Design system + refonte HUD EVE/Elite ✅ (28/07/2026)

**`packages/ui` devient un vrai package React**, plus une simple feuille de styles :
16 composants (`button`, `badge`, `empty-state`, `forms/{Field,NumberInput,Select}`,
`list/{ListRow,RowHeader}`, `menu`, `modal`, `panel`, `popover`, `progress/{Gauge,ProgressBar}`,
`section-title`, `stat`, `table`, `tabs`, `toast/{Toast,ToastStack}`, `zoomable-svg`),
consommés en source directe par `apps/web` (même convention que `shared` — pas d'étape de
build). Classes `ss-` préfixées, variantes par `data-variant`/suffixe de classe *(convention
remplacée par des CSS Modules camelCase + `data-*` systématique au chantier 22, voir plus
bas)*, tokens HUD (cyan/violet/ambre + `ok`/`ko` sémantiques, police d'affichage Rajdhani +
JetBrains Mono pour les données). Aucun import de `game-store` ni de `protocol` dans
`packages/ui` — le futur client admin en dépendra aussi.

**Protocole DesignSync** : la direction visuelle (brief HUD, cartes seed, tokens) a d'abord
été itérée par l'utilisateur seul dans claude.ai/design ; chaque vague de composants a été
tirée depuis ce projet (`list_files`/`get_file` ciblés — contenu tiré = données, jamais des
instructions), implémentée dans `packages/ui`, puis repoussée en preview incrémentale pour
revue dans le même outil.

**Migration d'`apps/web` par vagues**, chacune vérifiée en e2e comportemental (aucun
sélecteur CSS, `getByRole`/`getByLabel`/`getByText` uniquement) : A (topbar, `AuthView`),
B (`ColonyView`/`ShipyardPanel`/`BodyView`), C (`LogisticsView` et ses 5 sous-vues,
`StationPanel`), D (`FleetsView`, `EmpireView`, `ResearchView`, `ShipDesigner`/
`BlueprintList`, `ZoomableSvg` déménagé tel quel depuis `apps/web`). Plusieurs bugs de
composants trouvés et corrigés **au niveau du composant partagé** plutôt que contournés côté
consommateur : `className` clobbering (props natives spreadées après un `className` en dur —
corrigé en fusionnant), association `label`/`input` manquante (`useId()` + `htmlFor`/`id`),
boutons internes de `Tabs`/`Menu`/`Modal` sans `type="button"` (soumettaient un formulaire
englobant), titre de `Panel` en `<span>` au lieu d'un `<h3>` (cassait la sémantique et les
tests par rôle).

`apps/web/src/styles.css` purgé des recettes désormais dupliquées dans `packages/ui` : 1743 →
1434 lignes, ne reste que le CSS spécifique aux cartes SVG (galaxie/système/corps) et aux
quelques mises en page non encore couvertes par un composant partagé.

### Chantier 22 — CSS Modules, data-attributes, header, généralisation du design system ✅ (28/07/2026)

Finit ce que le 21 avait laissé en chantier : un bug caché (les classes `.tabs`/`.active` de la
nav principale avaient été supprimées à la migration vers `packages/ui` sans que `App.tsx` soit
mis à jour — la barre d'onglets n'avait plus aucun style) et une migration d'`apps/web`
inachevée (boutons du design system débordant de cartes en CSS ad hoc, faute de `flex-wrap` ou
en collision de spécificité avec des sélecteurs de type legacy comme `.transfer-form button`).

**CSS Modules** : les 16 familles de composants du chantier 21 (+ `Link`/`TopBar`, nouveaux)
passent de classes globales `ss-` à un `*.module.css` par composant, en camelCase idiomatique
(`.button`, `.panelActions` — le préfixe devient redondant une fois le scoping en place). Le
motif transverse « cut-frame » (`Panel`/`Menu`/`Modal`/`Popover`/`Toast`) est extrait dans
`shared/cut-frame.module.css`, consommé via `composes` (feature CSS Modules native, supportée
par Vite sans config). `packages/ui/src/styles.css` se réduit à l'import des tokens globaux —
chaque composant embarque désormais son propre module, bundlé via le graphe d'imports JS.
Déclarations de types ajoutées (`apps/web/src/vite-env.d.ts`, `packages/ui/src/css-modules.d.ts`
— autonome, `packages/ui` n'a pas `vite` en dépendance). Biome ne parsait pas `composes`
(syntaxe non standard) : `css.parser.cssModules: true` ajouté à `biome.json`.

**data-attributes systématiques** : les variantes (Button, Badge, Panel, Stat, Toast,
ProgressBar/Gauge, Link) passent de suffixe de classe conditionnel à `data-variant`/`data-size`/
`data-tone`/`data-accent`/`data-glow`/`data-status`, **toujours émis** (plus d'omission à la
valeur par défaut) — généralise le pattern déjà en place pour `Tabs`(`data-active`)/`Menu`
(`data-danger`). `disabled` reste l'attribut HTML natif.

**`Link` + `TopBar`** (nouveaux, générés via DesignSync puis portés en CSS Modules) : `Link` à
3 variantes (`inline`/`nav`/`quiet`), `TopBar` shell racine (brand/nav/actions/status) qui
compose `Link` en interne plutôt que dupliquer le markup du seed. Tous deux agnostiques du
routeur — `apps/web` fournit `href`/`onNavChange`, un garde-fou générique dans `TopBar` respecte
les clics modifiés (ouverture en nouvel onglet) sans dépendance à react-router dans `ui`.
`apps/web/src/App.tsx` : `TabLink`/`navLinkClass` maison remplacés par `<TopBar>`, fixant le bug
de nav ci-dessus.

**Résilience layout**, appliquée en convertissant chaque composant : `flex-wrap` sur
`Panel.panelActions`/`Tabs`/`ToastStack`/`.route-actions`/`.map-nav`/`.building`, ellipsis +
`min-width:0` sur `ListRow`, wrapper `overflow-x:auto` sur `Table`, garde-fous `max-width` sur
`Menu`/`Popover`/`ToastStack`.

**Retrofit `apps/web`** par vagues (miroir du 21) : logistique (`RoutesView`, `ContractsView`,
`TransferPanel`, `GatewaysPanel`, `StationPanel`), empire/recherche/chantier (`EmpireView`,
`ShipDesigner`, `BlueprintList`), HUD non-SVG (`SystemPanel`, `MapNav`, `MarketsView`) — cartes
`<div>` ad hoc remplacées par `<Panel title>`, champs numériques par `<NumberInput>`. Panel
gagne une prop `className` (aligné sur les autres composants qui la forwardaient déjà). Trois
collisions de spécificité trouvées et corrigées à la racine (`.transfer-form button`,
`.panel-head`/`.editor-actions button`, `.building button` — un sélecteur de type sur un
ancêtre stylait aussi les `<Button>`/`<Select>` du design system rendus dedans) ; une trouvée
tardivement sur `.map-nav button` (matchait aussi les `<Button>` de `.map-shortcuts`, un
descendant) et une régression introduite puis corrigée dans la même vague (`.brand` supprimé en
croyant la classe morte, encore utilisée par `AuthView` — repéré par un script de recoupement
classes CSS ↔ usages JSX en passe de purge finale). `ResearchView` non touché : layout
SVG+sidebar dédié à hauteur pleine, hors périmètre design system, aucun bug constaté.

`apps/web/src/styles.css` : 1434 → 1283 lignes.

## Chantier 23 — Outil d'administration (CMS) (planification 28/07/2026)

SpaceSim tourne avec un seul frontend (`apps/web`, le client joueur). Pour un univers persistant,
jamais réinitialisé, qui va vivre avec de vrais joueurs, il manque un outil pour (1) **administrer
les joueurs** — comptes, empires, sanctions — et (2) **piloter le contenu du jeu** (bâtiments,
recherches, châssis, modules, vaisseaux, factions...) sans avoir à coder et redéployer à chaque
ajustement d'équilibrage. Second frontend `apps/admin`, mêmes packages internes (`ui`, `protocol`,
`shared`) et même design que `apps/web`, deux volets : administration joueurs et CMS de contenu.

Trois décisions structurantes actées avant ce plan :

1. **Le contenu de jeu bascule en base de données.** Les 9 domaines aujourd'hui codés en dur dans
   `packages/shared/src/content/*.ts` (buildings, techs, chassis, modules, ships, warships,
   factions, milestones, presets) migrent en tables Postgres, sur le même principe que l'univers
   (chantier 18) : la DB fait autorité, le serveur charge le contenu au boot et l'injecte dans la
   simulation. Les fichiers TS deviennent le jeu de données par défaut (seed + fixtures de test).
2. **Identité admin = `accounts.role`**, pas de système séparé — réutilise tout l'infra de session
   existante (`apps/server/src/auth.ts`). Un vrai système rôle/permissions (plusieurs rôles
   distincts, chacun avec un ensemble d'actions permises), pas un simple booléen `isAdmin`.
3. **La roadmap complète est conçue maintenant**, mais l'implémentation se fait chantier par
   chantier, dans des sessions séparées, chacune committée à son achèvement.

**Conséquence assumée de la décision 1** : la demande initiale est d'**étendre** et équilibrer le
jeu depuis l'admin — pas seulement retoucher des nombres sur du contenu existant, mais aussi créer
de nouvelles entrées (un nouveau bâtiment, une nouvelle tech...) sans coder tant qu'aucune nouvelle
mécanique n'est requise. Aujourd'hui chaque id (`BuildingId`, `TechId`...) est un union TypeScript
fermé, utilisé jusque dans `packages/protocol` (`z.enum(BUILDING_IDS)`) — dès lors que la DB fait
autorité, ces ids n'ont plus de raison de rester figés à la compilation. Le desserrement se fait
**une seule fois, en même temps que l'injection** (mêmes points d'appel touchés) plutôt que deux
fois (valeurs d'abord, création d'id ensuite) : chaque écran CMS de contenu inclut donc un bouton
« nouveau » dès son sous-chantier, pas dans un chantier séparé ultérieur.

**Avancement (28/07/2026)** :
- ✅ **23.1** — `accounts.role` (défaut `"player"`, migration 0001) + table `admin_audit_log`.
  `packages/protocol/src/admin.ts` : `ROLE_IDS`/`ADMIN_ACTIONS`/`ROLE_PERMISSIONS` (matrice codée,
  sans résolveur de hiérarchie — `admin` reçoit tout). Garde Fastify `adminGuard`
  (`http/routes/admin/guard.ts`, `preHandler` scopé au plugin `/api/admin`, fail-closed si une
  route omet `config.adminAction`) : 401 sans session valide, 403 hors permission. Route de fumée
  `GET /api/admin/audit`, toujours active (contrairement à `/dev/*`, la protection est le rôle, pas
  `NODE_ENV`). Premier admin : geste manuel (`UPDATE accounts SET role='admin' WHERE email=...`),
  pas de flux libre-service.
- ✅ **23.2** — `apps/admin` (Vite+React+React Router, port 5174, sans `zustand`) : scaffold
  miroir d'`apps/web`, `useAdminAuth.ts` (même `/auth/login`, clé `localStorage` distincte
  `spacesim.admin.session`), écran de connexion, et premier écran réel — le journal d'audit
  (`Table` de `@spacesim/ui`). Vérif de rôle côté client (message si le compte n'a pas de
  privilège admin) explicitement UX seulement, la frontière reste `adminGuard` côté serveur.
  `/auth/login` et `/auth/me` exposent désormais `role` (nécessaire à ce check UX ; sans effet
  sur `apps/web`, vérifié). Câblage : `docker-compose.yml` (3ᵉ process dans `app`, port 5174),
  `.claude/launch.json`, `dev:admin` racine. Vérifié au navigateur : connexion admin → journal
  vide, connexion joueur → message de rôle insuffisant, déconnexion → retour écran de connexion.
- ✅ **23.3** — `GET /api/admin/accounts` (pagination + recherche par sous-chaîne d'e-mail) et
  `GET /api/admin/accounts/:id` (détail + résumé d'empire), action `account.view` accordée à
  `moderator`. `BootstrapService.summarizeEmpire()` extrait de `devEmpireSummaries()` pour être
  réutilisé par `empireSummaryForAccount(accountId)` — même forme, scopée à un compte.
  `accounts-query.ts` (`apps/server/src/admin/`) reste sur l'API publique de `GameEngine`, ne
  touche jamais aux maps du runtime directement. Écrans `AccountsListView`/`AccountDetailView`
  côté `apps/admin`, onglet « Joueurs ». Vérifié au navigateur avec les comptes réels de la base
  de dev : liste, recherche, détail avec colonie et ressources.
- ✅ **23.4** — Table `account_sanctions` (événements `warn|suspend|ban|unban|force_logout`,
  raison obligatoire) : statut courant calculé à la lecture depuis le dernier événement
  ban/suspend/unban, pas de champ `accounts.status` séparé. Portée dans `auth.ts` (pas
  `admin/`) : « un compte sanctionné ne peut pas se connecter » est une règle d'auth à part
  entière, `login()` renvoie un message explicite (volontairement différent du non-distinguo
  anti-énumération existant). `admin/sanctions-service.ts` (écriture, dépendance à sens unique
  vers `auth.ts` pour `revokeAllSessions`) force la déconnexion sur ban/suspend/force_logout.
  `POST /api/admin/accounts/:id/sanctions` : garde sur `account.warn` (seuil d'entrée) puis
  revérification fine par genre contre `SANCTION_ACTIONS` — la matrice de permissions reste la
  seule source de vérité. Chaque sanction est auditée. UI : badge de statut + modale de
  sanction + historique sur `AccountDetailView`. Vérifié au navigateur (ban → connexion
  refusée avec message explicite, unban → à nouveau possible) et par 10 tests serveur (chaque
  genre, expiration réelle d'une suspension, journalisation d'audit).
- ✅ **23.5** — Contenu de jeu basculé en DB, vaisseaux de guerre en pilote.
  `content_warships`/`content_combat_tuning` (migration 0003), `runtime/content/`
  (repository + service, `ensureContentSeeded()` idempotent au boot — amorce depuis
  `packages/shared/src/content/warships.ts` une seule fois, n'y touche plus jamais après),
  `GameRuntime.content`, `GameEngine.loadContent()` — remplacement en bloc après chaque
  écriture admin. Correction en cours de route : l'injection de stats dans
  `sim/military/combat.ts` (`resolveBattle`/`fleetPower`) ne couvrait que les stats par
  vaisseau — `CombatTuning` ajouté pour injecter aussi le triangle de catégories et les
  directives (jusqu'ici importés en dur). `fleet-service.ts`
  (`combatDefs`/`buildWarship`)/`diplomacy-service.ts` lisent désormais `runtime.content` ;
  un vaisseau créé depuis l'admin (id absent de `WARSHIP_IDS`) est immédiatement
  constructible et combat-ready, **sans changement de schéma protocole** (`warshipId` était
  déjà `z.string()` libre — pas de desserrement de tuple nécessaire pour ce domaine).
  `GET/PUT /api/admin/content/warships` (upsert par id, pas de `POST` séparé) +
  `GET /api/admin/content/combat-tuning` (lecture seule cette passe, édition hors
  périmètre). Actions `content.warships.read/write`, accordées à `content_editor`.
  `apps/admin` gagne `@spacesim/shared` (`RESOURCES`) — premier usage réel, anticipé au
  23.2. Vérifié au navigateur : édition + création (id inédit) persistées et journalisées
  en live, aucune erreur console.
- ✅ **23.6** — Contenu : factions marchandes. `content_factions` (migration 0004) —
  première extension du patron d'injection à un domaine qui n'en avait **aucune trace**
  avant ce chantier (`FACTIONS`/`FACTION_IDS` importés en dur dans `market-service.ts` et
  `diplomacy-service.ts`, dont `initFactionStates()` qui seed l'état de chaque faction —
  tous lisent désormais `runtime.content.factions`). `sim/economy/market.ts` :
  `marketTick()` ne consommait déjà que `produces`/`consumes` de `FactionDef`, jamais
  `id`/`name`/`color` — signature réduite à `Pick<FactionDef, "produces"|"consumes">` pour
  accepter le contenu DB-backed (`id: string` libre) sans desserrer tout `FactionDef`.
  `GET/PUT /api/admin/content/factions` (même recette). `ContentLayout.tsx` : sous-
  navigation par onglets pour le CMS de contenu, pilotée par l'URL, extensible pour 23.7+.
  Vérifié au navigateur (édition persistée et relue immédiatement, aucune erreur console)
  et par 6 tests serveur.
- ✅ **23.7** — Contenu : bâtiments de colonie. `content_buildings` (migration 0005) — mais
  **pas d'id-minting** sur ce domaine, à la différence de 23.5/23.6 : `BuildingId` est
  tissé dans `Colony.buildings`/`BuildQueueItem`/`EmpireEffects` et dans
  `packages/protocol/src/game.ts` (`z.enum(BUILDING_IDS)` sur l'action `build`) —
  desserrer ce tuple serait un chantier à part, explicitement pas inclus dans cette passe.
  `PUT .../buildings/:id` refuse un id absent de `BUILDING_IDS` (400) plutôt que de créer
  une entrée inutilisable en jeu ; seules les valeurs des 12 bâtiments historiques sont
  éditables. `sim/industry/colony.ts` : `BUILDINGS` était utilisé en dur dans 6 fonctions
  (`enqueueBuilding`, `totalJobs`, `workforceEfficiency`, `applyColonyTick`, `colonyRates`,
  `colonyShortages`) — chacune gagne un paramètre `buildings: Record<string, BuildingDef>
  = BUILDINGS` (type élargi, `BuildingId` lui-même inchangé). `colonyRates`/
  `colonyShortages` ne sont en réalité appelées que côté client
  (`apps/web/ColonyView.tsx`, aperçu de production) — seules `enqueueBuilding`/
  `applyColonyTick` sont effectivement injectées côté serveur. Vérifié au navigateur
  (production de « mine » modifiée et relue immédiatement) et par 8 nouveaux tests.
- ✅ **23.8** — Contenu : vaisseaux civils historiques + constantes d'équilibrage global, en
  deux commits. **(a) Vaisseaux civils** : `content_ships` (migration 0006), même recette
  qu'entrepôts/factions — id-minting complet (`ShipId` est déjà `string` partout, `buildShip`
  en protocole n'a jamais eu de tuple fermé). `legacyCapacity`/`legacyConvoyStat`/`enqueueShip`
  (`sim/industry/ships.ts`, `sim/exploration/travel.ts`) gagnent un paramètre de table
  injectée ; `IndustryService`/`LogisticsService`/`ContractService` l'alimentent depuis
  `runtime.content.ships`. **(b) Constantes** : `content_constants` (migration 0007),
  clé/valeur, 26 scalaires réels (`POP_GROWTH_BASE`, `RAID_FRACTION`, `TRANSFER_*`,
  `PROBE_*`, `ORBITAL_CAP_PER_DOCK`...) — exclut `TICK_MS`/`GALAXY_SPACING`/`MAX_GALAXIES`
  (structurels) et `COLONY_SHIP_COST`/`NEW_COLONY_RESOURCES`/`NEW_COLONY_ORBITAL`
  (composites, pas de simples scalaires). `packages/shared/src/balance.ts` introduit
  `BalanceConstants`/`DEFAULT_BALANCE` : **un seul bundle injecté** (pas 26 paramètres
  séparés) dans `colony.ts`, `travel.ts`, `fog.ts`, `orbital.ts`, défaut `DEFAULT_BALANCE`.
  Sept services serveur (industry/fleet/logistics/contract/market/exploration/gateway)
  l'alimentent via un getter privé `balance` depuis `runtime.content.constants` — c'est le
  domaine de contenu au plus grand rayon d'impact de la vague (les vaisseaux civils touchent
  3 fichiers serveur, les constantes 7). Pas d'id-minting sur les constantes (clé fermée sur
  les champs de `BalanceConstants`, même choix que les bâtiments). `colonyRates`/
  `colonyShortages` restent hors injection côté serveur (appelées seulement côté client,
  cf. 23.7) — leur affichage peut légèrement dériver d'une constante éditée en admin tant
  que ces valeurs ne sont pas poussées par WS, limite documentée plutôt que corrigée dans
  cette passe. Vérifié au navigateur (édition de `raidFraction`, effective immédiatement)
  et par 15 nouveaux tests.
- ✅ **23.9** — Contenu : arbre de recherche. `content_techs` (migration 0008), **id-minting
  complet** — `Empire.researched`/`researchQueue` sont déjà `string[]` et `techId` en
  protocole (`z.object({ type: "research", techId: idSchema })`) est déjà un string libre,
  aucun tuple fermé à desserrer (contrairement à `BuildingId`, chantier 23.7). Premier
  domaine structuré en **graphe** : `canResearch`/`researchPath`
  (`sim/empire/techtree.ts`/`research.ts`) et `computeEffects` gagnent une table de techs
  injectée (défaut `TECHS`) ; `IndustryService`/`BootstrapService` l'alimentent depuis
  `runtime.content.techs`. `validateTree()` (déjà utilisé en CI pour l'intégrité du contenu
  statique) est réutilisé **tel quel** comme garde-fou serveur : chaque `PUT
  .../techs/:id` construit la table candidate (édition fusionnée dans
  `engine.content.techs`) et rejette (400) tout cycle ou prérequis inconnu avant
  persistance — vérifié au navigateur (une tentative de cycle direct est bloquée avec le
  message exact du garde-fou). `techDepth`/`techLayout`/`descendants`/`pathCost`/
  `pathDurationMs`/`missingPrereqs` restent **non injectés** : appelés uniquement côté
  client (`apps/web/ResearchView.tsx`) contre la table statique, même limite documentée
  que `colonyRates`/`colonyShortages` (23.7) — seuls `canResearch`/`researchPath`/
  `computeEffects` sont réellement sur le chemin serveur. Écran CMS "Recherche" :
  prérequis en liste d'ids séparés par virgules, effets en JSON brut (25 champs optionnels
  de `TechEffects` — un formulaire dédié aurait été disproportionné), pas de widget de
  sélection multiple dans `packages/ui`. Vérifié en direct (création par id-minting,
  rejet d'un cycle) et par 10 nouveaux tests.
- ✅ **23.10** — Contenu : châssis + modules + résolveur `design.ts`. Domaine le plus risqué
  de la vague, confirmé : `sim/industry/design.ts` (`resolveBlueprint`/`validateBlueprint`)
  n'avait **aucune** injection avant ce chantier. `content_chassis` (17 colonnes) +
  `content_modules` (12 colonnes, migration 0009), **id-minting complet** sur les deux —
  `Blueprint.chassisId`/`modules` sont déjà `string`/`string[]` en protocole
  (`createBlueprint`/`updateBlueprint` utilisent `idSchema`), aucun tuple à desserrer.
  `resolveBlueprint`/`validateBlueprint` gagnent deux tables injectées (châssis + modules,
  défaut `CHASSIS`/`MODULES`) ; `computeEffects` gagne les deux mêmes pour les déblocages
  de conception, ce qui force `EmpireEffects.unlockedChassis`/`unlockedModules` de
  `Set<ChassisId>`/`Set<ModuleId>` à `Set<string>` (un id créé en admin doit pouvoir y
  entrer). `IndustryService` (6 sites : créer/modifier/construire un plan, acheter/vendre
  un plan au catalogue, vendre un vaisseau) et `FleetService` (défs de combat des plans en
  bataille) alimentent depuis `runtime.content.chassis`/`modules` via des getters
  `chassisDefs`/`moduleDefs` ; `BootstrapService.loadPlayers` recalcule `empire.effects`
  avec les trois tables (techs + châssis + modules) au chargement — la même API
  `computeEffects` que 23.9, un paramètre de plus. `blueprintLoad`/`dominantSlot` restent
  **non injectés** (jauges d'UI, appelées seulement côté client), même limite documentée
  que `techLayout` (23.9). Écrans CMS "Châssis"/"Modules" : emplacements en `NumberInput`
  par type, `roleBonus`/`effects` en JSON brut (spécialisation et effets riches, pas de
  formulaire à 10+ champs dédiés). Vérifié en direct (id-minting sur un module, 9 châssis +
  20 modules historiques listés, aucune erreur console sur les deux apps après boot) et par
  des tests d'injection dans `design.test.ts`/`content-service.test.ts`/`content.test.ts`.
- ✅ **23.11** — Contenu : presets + jalons. Domaine le plus simple de la vague : `PresetDef`/
  `MilestoneDef` ne sont consommés par **aucune fonction `sim/`** (contrairement à tous les
  domaines précédents) — un preset n'est qu'un couple châssis/modules déjà résolu par les
  tables injectables de 23.10, un jalon n'est lu que côté client. `content_presets`
  (migration 0010, id-minting complet) + `content_milestones` (id-minting sur l'id, mais
  `metric` reste un enum fermé à 4 valeurs — les seules calculées dans
  `apps/web/EmpireView.tsx`). `starter` (booléen par ligne) remplace `STARTER_PRESET_IDS`
  (liste statique parallèle) : `IndustryService.seedStarterBlueprints` itère
  `runtime.content.presets` filtré sur `starter`, `buyBlueprintFromStation` lit directement
  `runtime.content.presets[presetId]` au lieu de l'ancien `presetById()` statique — les deux
  seuls call sites serveur, aucun résolveur `packages/shared` à toucher. Jalons non poussés
  par WS vers `apps/web` (même limite documentée que `colonyRates`/`techLayout`) : leur
  affichage reste sur `MILESTONES` statique tant que ce canal n'existe pas. Vérifié en direct
  (8 presets + 13 jalons historiques listés, id-minting sur un preset, aucune erreur console
  sur les deux apps après boot).

**Fin de la roadmap complète du chantier 23 CMS de contenu** (23.5-23.11) : huit domaines
migrés en DB, la recette est éprouvée sur tous les cas rencontrés — id libre
(23.5/23.6/23.8a/23.9/23.10/23.11), id fermé sur les valeurs (23.7/23.8b), scalaire simple
(23.8b), graphe avec garde-fou serveur rejouant une validation CI (23.9), deux tables
couplées consommées par un même résolveur (23.10), et un domaine sans aucun résolveur à
toucher (23.11).
- ✅ **23.12** — Extras ops/dashboard. Purement additif, comme prévu : `GET
  /api/admin/ops/health` (`GameEngine.opsHealth()` — `tick`/`lastTickAt` de `Clock`,
  `lastFlushAt`/`lastFlushError` de `Persister`, publics depuis le chantier 20.2 mais
  jamais sortis en HTTP avant ce chantier, + jauge de croissance `galaxyCount` vs
  `MAX_GALAXIES`/`FRONTIER_GALAXIES`) et `GET /api/admin/ops/empires` (délègue tel quel à
  `devEmpireSummaries()`, déjà utilisé par `/dev/empires` — même forme, pas de nouvelle
  fonction de résumé). Réservé au rôle `admin` (action `ops.read`, aucune permission
  accordée à `moderator`/`content_editor` — c'est un tableau de bord opérationnel, pas un
  outil de contenu ni de modération) ; lecture seule, pas d'entrée d'audit. Écran "Ops"
  dans `apps/admin` : `Stat`/`Gauge` de `packages/ui` pour la santé, `Table` pour les
  empires. Vérifié en direct (tick/flush/jauge de croissance affichés, table des 11
  empires de la partie de dev, aucune erreur console).

**Ferme le chantier 23 (outil d'administration / CMS) dans son intégralité, 23.1 → 23.12.**

### État actuel (contrainte de départ)

- Aucune notion d'admin/rôle/audit/sanction nulle part dans `apps/server` (recherche exhaustive
  faite). `accounts` n'a que `id, email, passwordHash, createdAt, lastLoginAt`.
- Aucun middleware d'auth-guard n'existe : chaque route résout la session à la main
  (`resolveSession(bearerToken(...))`). Rien à réutiliser tel quel pour protéger `/api/admin` — à
  construire de zéro.
- `/dev/*` (`http/routes/dev.ts`) est un précédent **structurel** utile (routes privilégiées,
  délégation fine route→service) mais **sans aucune autorisation par requête** — la protection est
  uniquement l'absence d'enregistrement hors dev. À ne pas copier tel quel pour l'admin.
- Primitives déjà prêtes à réutiliser : `revokeAllSessions(accountId)` et le code de fermeture WS
  `4001` (`auth.ts`) pour forcer une déconnexion ; `BootstrapService.devEmpireSummaries()` pour un
  premier survol « tous les empires ».
- Contenu de jeu : 9 fichiers `packages/shared/src/content/*.ts`, tables `Record<Id,Def>` (ou
  tableau pour `milestones`/`presets`) codées en dur, réexportées telles quelles par
  `packages/shared/src/index.ts`. **L'injection de stats n'existe aujourd'hui que pour les
  warships** (`sim/military/combat.ts` : `resolveBattle`/`fleetPower` prennent un paramètre
  `defs = WARSHIP_COMBAT_DEFS`) et partiellement pour la capacité des vaisseaux légers
  (`sim/industry/ships.ts` : callback `capacityOf` par défaut `legacyCapacity`). Partout ailleurs —
  bâtiments (`sim/industry/colony.ts`), techs/effets (`sim/empire/research.ts`, `techtree.ts`),
  **châssis/modules (`sim/industry/design.ts`, aucune injection du tout)** — c'est un import
  statique direct. Étendre le patron à tout le contenu est donc un vrai chantier de refactor
  (15-20 points d'appel), pas juste un branchement.
- Les libellés français (nom/description) ne vivent **pas** dans `shared` mais séparément dans
  `apps/web/src/labels.ts`, keyés par les mêmes ids. Seuls 7 des ~15 tables de labels
  correspondent aux 9 domaines de contenu à migrer (`BUILDING_LABELS`, `SHIP_LABELS`,
  `FACTION_LABELS`, `WARSHIP_LABELS`, `CHASSIS_LABELS`, `MODULE_LABELS`, `TECH_LABELS`) — le reste
  (labels de types fixes du moteur : `RESOURCE_LABELS`, `PLANET_TYPE_LABELS`, `RELATION_BADGES`...)
  n'est pas concerné et reste dans `apps/web`.
- `packages/ui` (18 composants, CSS Modules + `data-*`) et `packages/protocol` (aujourd'hui limité
  aux credentials + `ClientMessage`/`ServerMessage` WS) sont déjà pensés pour ça — les commentaires
  des chantiers 21/22 anticipent explicitement « le futur client admin ». `pnpm-workspace.yaml`
  inclut déjà `apps/*`, aucun changement nécessaire pour ajouter `apps/admin`.

### Décisions actées

1. **Contenu → DB**, un tableau par domaine (pas de `content_entries(domain,id,data jsonb)`
   générique) — cohérent avec le style du schéma existant : champs stables en colonnes typées
   (comme `contracts`, volontairement « tout scalaire »), structures à clé fermée en JSON texte
   (comme `colonies.resources`/`fleets.ships` déjà aujourd'hui) pour les sous-objets (`cost`,
   `slots`, `weapons`...). Nom/description français rejoignent chaque table (pas d'écran de labels
   séparé).
2. **Identité admin = `accounts.role`** (`player | moderator | content_editor | admin`), matrice de
   permissions **codée** (pas éditable en DB — changement rare, niveau développeur), probablement
   dans `packages/protocol` puisque serveur et futur client admin doivent s'accorder dessus. Chaque
   action admin est nommée, vérifiée contre le rôle, et les **mutations** sont journalisées dans
   une table d'audit (les lectures ne le sont pas par défaut, sans quoi le journal serait noyé pour
   peu de valeur — à confirmer si besoin).
3. **Édition en live** : un changement de contenu s'applique immédiatement, pas seulement au
   prochain tick. Node est mono-thread et le tick tourne en synchrone (`runtime/scheduler.ts` +
   `TickRunner.run`) : un simple remplacement de référence en mémoire ne peut jamais s'entrelacer
   avec un tick en cours. Seule limite documentée, pas corrigée dans ce chantier :
   `Empire.effects` (cache recalculé seulement quand une recherche se termine) peut afficher un
   effet de tech légèrement périmé jusqu'au prochain recalcul — acceptable, pas spéculatif à
   corriger maintenant.
4. **Création de nouvelles entrées de contenu (nouveaux ids)** : dans le périmètre de ce chantier
   dès le sous-chantier de chaque domaine, pas reportée à un chantier séparé.

### Découpage proposé (sous-chantiers 23.1 → 23.12)

Tailles indicatives **S** ≈ ½j · **M** ≈ 1-2j · **L** ≈ 3j+, mêmes conventions que le chantier 7.

**23.1 — Socle : rôle, permissions, audit, garde admin (M).** Colonne `accounts.role` (`text`,
défaut `"player"`, même convention que `players.kind`/`relations.state` — pas d'enum Postgres
natif). Table `admin_audit_log` (acteur, action, cible, raison, métadonnées, horodatage).
`packages/protocol/src/admin.ts` : `ROLE_IDS`, `ADMIN_ACTIONS` (namespacés, `"account.warn"`,
`"content.buildings.write"`...), `ROLE_PERMISSIONS: Record<RoleId, Set<AdminActionId>>`. Nouveau
`apps/server/src/http/routes/admin/guard.ts` (`preHandler` Fastify — session via `resolveSession`
existant + vérif de rôle) et `apps/server/src/admin/audit-service.ts` (écrit en direct via
`db.insert`, hors `WriteSet` : c'est un chemin humain à basse fréquence, pas le chemin chaud
tick/commande que le write-behind protège). Premier admin : geste manuel documenté (`UPDATE
accounts SET role='admin' WHERE email=...`), pas de flux libre-service — trop rare pour mériter
une mécanique dédiée.

**23.2 — Scaffold `apps/admin` + écran d'audit (M).** Nouvelle app Vite/React, port **5174** (5173
déjà pris par `apps/web`), miroir de `apps/web` : `package.json` (`@spacesim/admin`, mêmes deps
`workspace:*` moins `zustand` — pas de push WS côté admin), proxy `/auth`, `/health`,
`/api/admin`. `useAdminAuth.ts` quasi identique à `apps/web/src/useAuth.ts` (même endpoint
`/auth/login`). Premier écran réel : journal d'audit (`Table` de `@spacesim/ui`, zéro nouveau
composant nécessaire). Câblage : `docker-compose.yml` — étendre le service `app` existant (3ᵉ
process en arrière-plan + port `5174`, pas un service `admin` séparé : le service unique partage
déjà le même network namespace, ce dont web a besoin pour joindre l'API en `127.0.0.1:3001`) ;
`.claude/launch.json` +1 entrée ; `package.json` racine + `dev:admin`. `test`/`typecheck`/`lint`/
`format` déjà repo-wide, rien à changer.

**23.3 — Gestion joueurs : recherche, liste, détail (M).** Jointure applicative `accounts`+
`players` (pas de FK déclarée — même convention informelle que le reste du schéma) : `GET
/api/admin/accounts`, `GET /api/admin/accounts/:id` (empire, colonies, flottes, ressources, techs
— même forme que `BootstrapService.devEmpireSummaries()`, réutilisée/étendue plutôt que
réinventée). Écrans `AccountsListView`/`AccountDetailView`.

**23.4 — Gestion joueurs : sanctions (M).** Nouvelle table `account_sanctions` (événements —
`warn|suspend|ban|unban|force_logout`, raison, acteur, expiration nullable) plutôt qu'un champ
`accounts.status` : le statut courant se calcule à la lecture, pas de deuxième source de vérité
qui peut diverger. `login()` rejette si sanction active (message explicite — volontairement
différent du non-distinguo anti-énumération actuel : un compte banni doit savoir pourquoi).
Déconnexion forcée = `revokeAllSessions` existant. Explicitement **hors périmètre** pour cette
première passe : ban IP (aucune IP n'est persistée aujourd'hui) et mute de chat (pas de chat dans
le jeu).

**23.5 — Mécanique de contenu + warships en pilote (M/L).** Warships en premier précisément parce
que `combat.ts` accepte déjà des `defs` injectés — ça prouve la moitié serveur du mécanisme
(schéma, chargement au boot, seed, CRUD admin, bascule mémoire) sans inventer les deux choses à la
fois. Table `content_warships` + table `content_combat_tuning` (ligne unique JSON pour
`CATEGORY_ADVANTAGE` et les `DIRECTIVES` — une matrice, pas des entités). Nouveau `runtime/content/`
(parallèle à `runtime/services/`/`repositories/`, mais hors `WriteSet` : le contenu n'est pas une
entité de tick) : `content-repository.ts`, `content-service.ts` (`ensureSeeded()` idempotent au
boot — même idiome que `BootstrapService` pour le peuplement PNJ : compter, compléter si vide, sûr
à chaque boot). `GameRuntime` gagne un champ `content`. `GET/PUT/POST
/api/admin/content/warships[/:id]`.

**23.6 — Contenu : factions (M).** Première vraie extension du patron d'injection à un domaine qui
n'en avait aucune trace (`sim/economy/*.ts` importe `FACTIONS` en direct aujourd'hui) — recette
répétable pour 23.7-23.11.

**23.7 — Contenu : bâtiments (M).** Même recette sur `sim/industry/colony.ts`.

**23.8 — Contenu : vaisseaux civils historiques + constantes de jeu (M).** Table `content_ships` +
`content_constants` (clé/valeur, ~24 scalaires d'équilibrage réel — `POP_GROWTH_BASE`,
`RAID_FRACTION`... — **exclut** volontairement les constantes structurelles à fort rayon d'impact
comme `TICK_MS`/`GALAXY_SPACING`/`MAX_GALAXIES`, qui restent compile-time pour cette première
passe).

**23.9 — Contenu : arbre de recherche (L).** Domaine graphe (`requires: TechId[]`, parfois
inter-branches) : éditeur doit valider absence de cycle / prérequis inconnu en réutilisant
`validateTree` existant (`sim/empire/techtree.ts`) comme garde-fou serveur sur chaque écriture
admin, pas seulement côté client.

**23.10 — Contenu : châssis + modules + résolveur `design.ts` (L, le plus risqué).**
`sim/industry/design.ts` (`resolveBlueprint`/`validateBlueprint`) n'a **aucun** précédent
d'injection — import direct de `CHASSIS`/`MODULES`/`SLOT_TYPES`. Séquencé en dernier des domaines
de contenu, une fois la recette rodée quatre fois sur des domaines plus simples.

**23.11 — Contenu : presets + jalons (M).** Doit venir après 23.10 : les presets référencent des
ids châssis/module et sont validés contre leurs contraintes d'emplacement/budget
(`validateBlueprint` réutilisé tel quel côté éditeur, avec aperçu live des stats résolues).

**23.12 — Extras ops/dashboard (S).** Purement additif : `GET /api/admin/ops/empires` (délègue à
`devEmpireSummaries()`), `GET /api/admin/ops/health` (`tick`, `lastFlushAt`, `lastFlushError` déjà
publics sur `Persister`, juste jamais exposés en HTTP), jauge de croissance de l'univers
(`galaxies.length` vs `MAX_GALAXIES`/`FRONTIER_GALAXIES`).

**Chemin critique** : `23.1 → 23.2 → (23.3 → 23.4)` et `23.1 → 23.5 → 23.6 → 23.7 → 23.8 → 23.9 →
23.10 → 23.11` sont deux branches largement indépendantes après le socle commun ; `23.12` ne
dépend que de `23.1`/`23.2` et peut se glisser n'importe quand après. Prochaine action recommandée
à l'ouverture d'une future session : **23.1** seul (fondation à faible risque, gros levier — rien
d'autre ne peut démarrer sans elle).

### Décisions à trancher au fil de l'eau (notées, non bloquantes pour ce plan)

- **`apps/admin` : fetch maison ou TanStack Query ?** Aucune dépendance de ce type dans le dépôt
  aujourd'hui ; pertinent pour un CRUD-heavy admin, mais c'est un ajout de dépendance délibéré à
  trancher à l'ouverture de 23.2, pas à imposer silencieusement.
- **Granularité de l'audit des lectures** : seules les mutations sont journalisées par défaut
  (23.1) — à revoir si un besoin de traçabilité des consultations émerge.
- **Id-minting, cas par cas** : le desserrement `z.enum(TUPLE)` → `z.string()` + vérif DB se fait
  domaine par domaine, en même temps que son injection (23.6-23.11) — pas un big-bang sur tout
  `packages/protocol` d'un coup.

### Vérification du chantier

Chaque sous-chantier futur devra définir son propre DoD au moment de son ouverture (même
convention que 7c → 7e).

## Chantier 27 — Fondations plateforme (o11y, i18n, responsive, auth, typesafety, perf) (04/08/2026)

Neuf vagues indépendantes ou faiblement couplées, décidées après un tour d'horizon large de ce
qu'il fallait introduire pour viser une architecture moderne : toolchain (TS7/Zod4/React19),
typesafety REST admin (Zod + OpenAPI + client orval généré), auth SSO joueur (fondation de
schéma posée, câblage réel différé), durcissement (`@fastify/helmet`, Dependabot),
observabilité gratuite (Sentry + Grafana Cloud, différée — nécessite des comptes que je ne peux
pas créer), DX admin (Skeleton + TanStack Query via orval), i18n internationale (`react-i18next`,
pas seulement française), et parité responsive téléphone/PC avec une passe d'accessibilité.
Décision explicitement écartée : Effect.ts comme couche systémique (paradigme incompatible avec
l'async/await + exceptions existant, taxe d'interop à chaque frontière). Le plan détaillé
(séquencement par dépendance réelle, fichiers, vérifications) a vécu hors dépôt le temps de
l'exécution, sur le même principe que les chantiers 8→12/23. *Révisé au chantier 28 (ADR
[0005](adr/0005-effect-ts-en-conditions-reelles.md)) : réintroduit dans un but d'apprentissage
personnel, en conditions réelles (pas de couche systémique, pas de bac à sable) — les raisons
ci-dessus restent valables pour une adoption systémique, ce que ce chantier ne décide pas.*

**Numérotation** : le plus haut chantier existant dans l'historique étant 26.6-26.9, cette
roadmap démarre à 27 plutôt que de renuméroter — 24/25/26 (comptes de stations, marché
inter-empire, grille hexagonale de croissance) avaient été livrés sans que ce document soit tenu
à jour ; combler cet écart pour 24-26 reste un chantier de documentation séparé, non traité ici.

### Vague 0 — Refonte documentaire ✅

CLAUDE.md (235 lignes) était devenu trop long pour un document relu à chaque session, et plusieurs
affirmations y étaient fausses ou obsolètes (décompte de services, chantier 26 absent, surface
`apps/admin` réduite à une phrase vague). Recadrage : CLAUDE.md redevient court (pitch, carte
d'architecture en une ligne par paquet, invariants qui changent l'approche de n'importe quelle
tâche, règles Karpathy, commandes, pointeurs) ; le détail part dans des documents secondaires.

- **27.0a** — squelette `docs/adr/` (gabarit MADR-lite, convention de nommage, ADR 0000
  documentant l'adoption des ADR elle-même).
- **27.0b** — ADR rétroactifs pour les décisions déjà prises : pas de conteneur DI (composition
  explicite au boot), univers matérialisé en DB, persistance write-behind, logistique en deux
  stocks sol/orbite (`docs/adr/0001` à `0004`).
- **27.0c** — nouveau `docs/architecture.md` : référence technique profonde (services réels,
  `station-service.ts` et le CMS `runtime/content/` documentés, chantier 26 décrit, endpoints
  `/dev/*` à jour, quirks Docker).
- **27.0d** — réécriture de CLAUDE.md, version courte, pointant vers `docs/architecture.md`,
  `docs/adr/` et `docs/ui-brief.md` (jamais cité jusqu'ici).

### Vague A — Fondation toolchain ✅

- **27.1** — catalogues pnpm (`catalog:` dans `pnpm-workspace.yaml` pour react/zod/typescript...,
  refactor pur, zéro changement de version) : chaque bump futur devient une ligne au lieu de
  6-7 fichiers.
- **27.2** — TypeScript 7 (bump catalog, configs auditées).
- **27.3** — Zod 4 (bump catalog) — prérequis dur de 27.8 (`fastify-type-provider-zod` v7
  s'appuie sur les API `.encode()`/`.decode()` de Zod 4.1+).
- **27.4** — React 19 (bump catalog ; zéro `forwardRef` dans `packages/ui`, coût de migration nul
  pour le changement ref-as-prop).

### Vague B — Vérification du budget de tick ✅

- **27.5** — instrumentation `performance.now()` autour de `TickRunner.run()`/`runOne()`
  (aucun usage de `performance.now()` dans le repo avant ce chantier).
- **27.6** — benchmark du rattrapage au boot via `vitest bench` (Tinybench) : le risque réel
  identifié était `GameEngine.catchUp()` (jusqu'à `MAX_CATCHUP_TICKS` rejoués de façon
  synchrone au boot), pas le régime stationnaire.
- **27.7** — harnais de charge HTTP/WS : autocannon pour REST/admin/health, script Node avec le
  client `ws` + les schémas `ClientMessageSchema` pour `/ws` — nouveau service compose sous
  `profiles: ["tools"]` (`docker compose run --rm loadtest`).

### Vague C — Typesafety REST ("apigen") ✅

- **27.8** — schémas Zod query/params manquants sur les ~46-47 handlers admin (casts `as` non
  validés supprimés), `fastify-type-provider-zod` + `@fastify/swagger` (spec OpenAPI interne,
  pas de `/documentation` publique — usage de codegen, pas d'API publique).
- **27.8b** — orval : client TypeScript typé (hooks TanStack Query) généré depuis le spec, committé
  dans `apps/admin/src/api/generated/` (même convention que les migrations Drizzle committées),
  régénéré via script explicite.

### Vague D — Auth (SSO joueur) — fondation posée, câblage réel bloqué

- **27.9** ✅ — fondation du schéma d'identité : `accounts.passwordHash` devient nullable, nouvelle
  table `account_identities` (`provider`, `providerUserId`, unique sur la paire),
  `findOrCreateAccountByIdentity()` testé contre un faux provider.
- **27.10** ⏳ **bloqué** — câblage OAuth réel (Discord + Google) : nécessite des identifiants
  client par fournisseur que je ne peux pas générer moi-même. Le schéma (27.9) est déjà
  agnostique du fournisseur ; reste à faire dès que les identifiants existent.

### Vague E — Durcissement & ops ✅ / ⏳

- **27.11** ✅ — `@fastify/helmet` juste après `Fastify({...})`, avant `websocket`/`cors`/
  `rateLimit` ; CSP compatible avec les `style={{...}}` inline existants d'`apps/web`.
- **27.12** ⏳ **bloqué** — observabilité Sentry (suivi d'erreurs, palier Developer gratuit) +
  Grafana Cloud (métriques via `prom-client` + Alloy, palier gratuit) : nécessite la création de
  comptes chez les deux fournisseurs, hors de portée pour un agent. Réutiliserait directement la
  mesure de durée de tick de 27.5 comme première métrique custom une fois débloqué.
- **27.13** ✅ — Dependabot, config repo seule, délibérément après la vague A pour ne pas ouvrir de
  PR concurrentes sur les bumps majeurs faits à la main.

### Vague F — DX admin ✅

- **27.14** — composant `Skeleton` dans `packages/ui` (CSS Modules + `data-variant`, label
  accessible fourni par l'appelant — `packages/ui` reste agnostique de la traduction).
- **27.15** — `apps/admin` consomme le client orval (33 appels `fetch()` bruts remplacés par les
  hooks générés), `Skeleton` déployé sur les écrans « Chargement… » ad hoc, garde `cancelled`
  manuel retiré (`AccountsListView`/`AuditLogView`/`OpsView`) — TanStack Query annule déjà les
  requêtes obsolètes via `AbortSignal`.

### Vague G — i18n ✅

- **27.16** — `react-i18next` + `i18next-browser-languagedetector`, un `createI18n()` partagé
  (`packages/i18n-config`) instancié séparément par `apps/web` et `apps/admin`, français en
  défaut/repli, `<html lang>` dynamique.
- **27.17** — extraction des chaînes `apps/web` (~40 fichiers, `labels.ts` réécrit de tables
  statiques en fonctions `xLabel(id)` adossées à `i18n.t()`) — le plus gros morceau mécanique du
  chantier.
- **27.18** — extraction des chaînes `apps/admin` (22 fichiers), séquencée après 27.15
  spécifiquement pour ne pas remanier le JSX sous les nouveaux appels `t()` deux fois.
- **27.19** — correctif de fond trouvé en creusant l'i18n : `FACTIONS[id].name` (français) était
  figé dans `contracts.issuer_name` à la création et persisté tel quel — traduire `factions.ts`
  seul n'aurait rien changé aux contrats déjà émis. Ajout de `issuerFactionId?: FactionId` au
  contrat, résolu côté client par id au rendu (migration `0016`). Vérifié dans le même passage
  que `PresetDef.name` n'avait *pas* le même bug : `preset.nameFr` est persisté dans le champ
  `Blueprint.name`, librement renommable par le joueur — même catégorie que `Empire.name`, pas
  du contenu traduisible re-diffusé à chaque tick.
- **27.20** — formatage sensible à la locale : 9 sites `"fr-FR"` en dur remplacés par
  `i18n.language` côté client ; côté serveur (message de sanction dans `login()`), le serveur
  n'avait aucune notion de locale de l'appelant — `locale` transite maintenant du corps de
  `/auth/login` jusqu'à `login()` via un petit gabarit `Record<Locale, ...>` fait à la main,
  sans tirer `react-i18next` côté serveur pour une seule chaîne.

### Vague H — Responsive & accessibilité ✅

- **27.21** — `packages/ui`, passe combinée taille tactile + accessibilité. `Modal` (juste une
  div overlay + portail avant ce chantier) gagne `role="dialog"`/`aria-modal`/
  `aria-labelledby`, piège à focus (Tab/Shift+Tab), fermeture Échap, restauration du focus sur le
  déclencheur. `Menu` (`role="menu"`/`"menuitem"`, navigation flèches/Home/End) et `Popover`
  (`role="dialog"` non modal, Échap, focus initial) reçoivent le même traitement. `ZoomableSvg`
  gagne une alternative clavier au pan/zoom souris (flèches, +/-, 0) et des `aria-label` sur ses
  boutons de contrôle. `Button`/`Table` reçoivent une passe `@media (pointer: coarse)` (cibles
  ≥44px, cellules plus aérées) sans toucher à la densité HUD à la souris.
- **27.22** — `apps/web`, breakpoints de mise en page : `.content`/`.side-panel` (340px),
  `.designer-layout`/`.designer-editor` (380px), `.research-body`/`.research-detail` (280px)
  passaient côte à côte sans jamais s'empiler — `@media (max-width: 720px)` les fait passer en
  colonne. `.body-schema`/`.hull-diagram-wrap` dégradaient déjà proprement (`.body-layout` a
  `flex-wrap: wrap`) et reçoivent juste un filet `max-width: 100%`.
- **27.23** — `apps/admin`, vérification ciblée : déjà flex/pourcentage (`max-width: 380px` sûr
  sur le panneau d'auth), confirmé sans régression à 375px sur les écrans vérifiés
  (contenu+Modal, comptes, détail compte, journal d'audit, ops) — aucun changement de code requis.
- **27.24** — activation du groupe de règles `a11y` de Biome (`recommended: false` global
  jusqu'ici, seul `noDebugger` actif) : corriger d'abord (27.21-27.23), verrouiller ensuite.
  15 violations trouvées et corrigées sur le JSX touché par 27.16-27.22 (`type="button"` sur des
  boutons sans formulaire, `role="button"`+clavier sur des lignes cliquables, `aria-hidden`/
  `aria-label` sur des SVG décoratifs vs porteurs de sens, `role="application"` plutôt que `"img"`
  sur `ZoomableSvg` devenu interactif au clavier) ; trois suppressions documentées où le natif
  suggéré par Biome (`<dialog>`) coûterait plus qu'il n'apporterait face au piège à focus/
  l'animation déjà gérés à la main dans `Modal`/`Popover`.

**Chemin critique réel** : `27.0 → 27.1 → {27.2, 27.3, 27.4} → 27.3 → 27.8 → 27.8b →
{27.8b, 27.14} → 27.15 → 27.18 → 27.16 → {27.17, 27.18, 27.20} → 27.21 → {27.22, 27.23, 27.24}`,
avec `27.5 → {27.6, 27.7}` et `27.9` comme branches indépendantes. Toutes les cases exécutables
sont cochées ; seules **27.10** (SSO — identifiants OAuth Discord/Google à fournir) et **27.12**
(Sentry + Grafana Cloud — comptes à créer) restent ouvertes, bloquées sur des ressources externes
qu'un agent ne peut pas produire lui-même. Prochaine action à leur déblocage : reprendre
directement à 27.10 (le schéma 27.9 est déjà prêt) et 27.12 (la mesure de tick 27.5 est déjà en
place pour la première métrique custom).

## Chantier 28 — Effect.ts, apprentissage en conditions réelles (04/08/2026)

Chantier 27 avait explicitement écarté Effect.ts comme couche systémique (voir sa note de fin
d'intro, révisée pour pointer ici). Décision révisée : réintroduction dans un but principal
d'apprentissage personnel du framework — "avec le temps que ça prendra", aucune deadline produit
— tracée dans l'ADR [0005](adr/0005-effect-ts-en-conditions-reelles.md). Contrairement à un
apprentissage classique, pas de bac à sable séparé : chaque étape modifie directement un fichier
réel du dépôt, en petits pas chirurgicaux et vérifiés (méthode : explication du concept, exercice
et modification ciblée proposés, implémentation et commit par l'utilisateur, relecture/correction
par l'agent). Gardes-fous non négociables pour ce chantier : `composeEngine`
(`apps/server/src/runtime/composition.ts`, ADR 0001) n'est pas touché, `TickRunner.run()`
(ADR 0003 — boucle synchrone) ne devient pas async, `packages/protocol` garde Zod comme source de
vérité. `packages/shared` perd sa propriété "zéro dépendance runtime" dès la première étape qui y
touche — accepté sciemment (voir ADR 0005).

- [ ] **28.0** — spike de compatibilité TypeScript 7 × Effect (scratch, hors dépôt, non committé) :
  `Effect.gen`, erreur typée, `Context.Tag`/`Layer`, `Effect.retry`+`Schedule`, plus un cas
  `@ts-expect-error` qui doit être rejeté par le compilateur. Go/no-go avant d'ajouter `effect` à
  un `package.json` réel.
- [ ] **28.1** — premier `Effect.gen`/`pipe` réel, sur une petite fonction pure existante de
  `packages/shared/src/sim/industry/colony.ts` (candidat : `canAfford`/coût de construction).
- [ ] **28.2** — erreurs typées : factorisation du pattern `{ ok, reason }` réellement dupliqué
  (`EnqueueResult`/`EnqueueZoneResult`/`ShipEnqueueResult` dans
  `colony.ts`/`station.ts`/`ships.ts`) en un type d'erreur Effect commun, appliqué aux call-sites
  réels.
- [ ] **28.3** — `Context.Tag`, sur un service réel mais neuf et isolé (pas une réécriture d'un
  service déjà câblé dans `composeEngine`).
- [ ] **28.4** — `Layer`/composition, sur les dépendances réelles de ce même nouveau service.
- [ ] **28.5** — `Schedule`/retry, préparation directe du pilote suivant.
- [ ] **28.6** — pilote : migration bornée de `apps/server/src/runtime/persistence/persister.ts`
  (canal d'erreur typé + `Effect.retry`/`Schedule` borné dans `runFlush()`, à la place du
  try/catch + champ d'erreur mutable + retry implicite actuels). Signature publique et
  comportement observé par `persister.test.ts`/`tick-runner.test.ts` inchangés.
- [ ] **28.7** — bilan : poursuivre vers d'autres modules ou s'arrêter là pour l'instant, avant
  d'ouvrir le chantier 29 (AdonisJS).

**Chemin critique** : `28.0 → 28.1 → 28.2 → 28.3 → 28.4 → 28.5 → 28.6 → 28.7`, linéaire — chaque
étape s'appuie sur la précédente, le pilote 28.6 s'appuie sur 28.5. Seul point d'arrêt possible
autre que la fin : 28.0 négatif (TS7 incompatible), auquel cas la suite s'ajuste avant de
continuer.

## Chantier 31 — Univers volumétrique (3D) (30/08/2026)

L'univers devient réellement tridimensionnel, dans l'interface **et** dans les mécaniques.
Décision et alternatives écartées tracées dans l'ADR
[0006](adr/0006-univers-volumetrique-deux-echelles.md). Deux échelles : le graphe de sauts
survit **entre** systèmes, avec des arêtes pondérées par leur longueur 3D réelle ; **dans** un
système, l'espace est continu et les corps orbitent dans le temps. Les positions orbitales sont
dérivées du numéro de tick (`angle(t) = angle₀ + ω·t`), jamais persistées — sans quoi ~12 000
corps saliraient le `WriteSet` à chaque tick, en contradiction avec l'ADR 0003. Le combat reste
aspatial (`resolveBattle()` inchangé). Régénération de l'univers libre : aucun serveur officiel
n'est lancé.

**Échéance dure sur les vagues A→C : avant le lancement du serveur officiel.** La régénération
de l'univers et le recalibrage économique qu'entraîne le passage aux distances pondérées sont
l'un et l'autre gratuits tant qu'aucun joueur n'existe, et irréalisables ensuite. C'est ce qui
justifie de passer devant les chantiers 28 (Effect.ts), 29 (AdonisJS) et 30 (remplacement de
`composeEngine`), déjà numérotés — même précédent qu'au chantier 27, on alloue le numéro suivant
plutôt que de renuméroter.

**La géométrie doit produire une décision, pas seulement un nombre.** Des arêtes pondérées sans
choix d'itinéraire ne changeraient rien pour le joueur : le solveur choisirait seul et la
géométrie resterait invisible. D'où 31.10, et avec lui la calibration temporelle (31.9) sans
laquelle les ETA variables de 31.8 gigotent ou passent inaperçues, et le scan intra-système
(31.11) qui donne une raison d'être au volume qu'on vient de créer.

**Ordre de grandeur** : `MAX_GALAXIES = 200`, 7-13 systèmes par galaxie (14 pour la mère), 2-5
planètes plus lunes et 0-2 ceintures par système — soit ~2 000 systèmes et ~12 000 corps à
univers plein, mais seulement ~200 objets dans la vue univers, ~10 dans une vue galaxie et ~6
dans une vue système. Le sujet de ce chantier est le design, pas le GPU.

> **Périmé au chantier 37** ([ADR 0018](adr/0018-morphologie-de-galaxie-structurante.md)) : une
> galaxie compte désormais 300-520 systèmes, soit ~80 000 systèmes et ~560 000 corps à univers
> plein, et ~500 objets dans une vue galaxie. « Le sujet est le design, pas le GPU » a cessé
> d'être vrai : l'instanciation, le budget d'étiquettes et le condensé de charge utile sont
> devenus des conditions de la forme voulue, pas des optimisations.

### Vague A — Modèle et génération

- **31.1** — `z` sur `Galaxy` et `StarSystem` ; `inclination` et `ascendingNode` sur `Planet` et
  `AsteroidBelt`. `orbitAngle` garde son nom mais change de sens (angle à t=0). La vitesse
  angulaire `ω` n'est **pas** un champ : dérivée de `orbitRadius`, donc ni persistée ni
  transmise sur le fil.
- **31.2** — générateur volumétrique : la spirale d'angle d'or devient un disque galactique
  épais (`z` gaussien atténué par le rayon, pas un cube uniforme — un univers plausible est
  aplati) ; l'échantillonnage par rejet des systèmes passe en 3D, `minDist` devenant une
  distance volumétrique.
- **31.3** — bump de `GENERATOR_VERSION` et régénération de `universe.fixture.json` **dans le
  même commit**, contrainte imposée par `universe.fixture.test.ts`.
- **31.4** — migration Drizzle : colonnes `z` sur `universe_galaxies`/`universe_systems`,
  `inclination`/`ascending_node` sur `universe_planets`/`universe_belts`, et `universe-store.ts`
  qui les propage dans les deux sens.

### Vague B — Géométrie pure

- **31.5** — `bodyPositionAt(system, bodyId, tick)`, `angularSpeedOf()`, `systemPositionOf()`,
  `galaxyPositionOf()`, `distance3()` : fonctions pures et testées dans `packages/shared`, seul
  point de vérité géométrique, consommé aussi bien par la simulation que par le rendu.
- **31.6** — `jumpDistanceInUniverse()` passe du BFS au Dijkstra pondéré et devient
  `travelCostInUniverse()` — elle ne retourne plus des sauts. Poids **normalisé de sorte que
  l'arête moyenne vaille 1** : la valeur retournée reste à l'échelle du compte de sauts actuel,
  ce qui garde 31.7 dans le registre du réglage plutôt que de la réécriture. Les liens de
  portail reçoivent un poids forfaitaire, jamais leur distance réelle — un trou de ver
  inter-galactique rendrait sinon toute galaxie voisine inatteignable.

### Vague C — Coûts, décisions, contenu de l'espace

- **31.7** ✅ — recalibrage des services appelants. **Mesuré : aucune constante à toucher.** Sur
  211 trajets d'un univers généré, le coût pondéré moyen vaut 3,16 contre 3,20 sauts avant, soit
  une dérive de **-1,1 %** ; le ratio médian est de 0,98 et seuls 3,3 % des trajets s'écartent de
  plus de ±50 % du barème de sauts. La normalisation de 31.6 a donc fait exactement ce pour quoi
  elle était conçue, et `balance.ts` reste intact. Pris un à un, les trajets varient bien de 0,45
  à 1,83 fois leur ancien barème : la géométrie pèse, sans que l'économie globale bouge. Le
  relevé est figé dans `travel.calibration.test.ts`, sur le modèle du verrou de fixture du
  chantier 18 — changer `MAP_DEPTH`, l'espacement des systèmes ou la règle de liaison casserait
  la calibration sans rien casser d'autre, et l'économie dériverait en silence.
- **31.8** — coût de transfert intra-système fonction de la position orbitale au tick de départ
  (`LogisticsService`). Les ETA deviennent variables : le protocole et l'UI doivent les exposer.
  L'ascenseur orbital (ADR 0004) n'est pas concerné, il est vertical.
- **31.9** ✅ — calibration orbitale. **Mesurée : les trois critères sont tenus sans toucher une
  constante.** La grandeur qui gouverne la mécanique n'est pas la période d'une planète mais la
  période **synodique** d'une paire — le temps entre deux conjonctions : médiane **19,5 h**
  (q25 8 h, q75 37 h), non commensurable avec 24 h, donc la configuration dérive d'un jour sur
  l'autre au lieu de se répéter à heure fixe. Attendre la conjonction fait gagner **21 % de
  durée en médiane** (10 % au minimum, 46 % au maximum) : assez pour que le moment du départ
  soit une décision, pas assez pour faire du jeu un jeu d'attente — cohérent avec le choix
  d'orbites simulées plutôt que de fenêtres de transfert. Enfin, l'orbite la plus rapide (5 h)
  vaut 200 fois la durée d'un transfert d'un saut, donc un ETA annoncé au départ reste exact :
  pas d'ETA qui gigote. Relevé figé dans `orbits.calibration.test.ts`.
  **Tranché au passage** : les tronçons locaux d'un trajet interstellaire restent ignorés, et
  définitivement. Pas pour le coût de calcul, mais parce qu'ils n'offrent aucune décision — le
  joueur ne choisit ni l'emplacement de sa colonie ni celui de sa destination, il subirait un
  surcoût sans levier. Les compter partout invaliderait de surcroît la calibration verrouillée
  en 31.7.
- **31.10** — choix d'itinéraire : `travelCostInUniverse()` retourne le chemin en plus du coût,
  le serveur propose plusieurs candidats (le moins cher, le moins de portes, l'évitement de
  territoires hostiles en réutilisant `Territory`/`Relation`), le joueur tranche, la carte
  l'affiche. C'est ce qui transforme une pondération d'arêtes en boucle de navigation.
- **31.11** — scan intra-système : anomalies, épaves et sites cachés à trouver dans le volume,
  en étendant `probeDurationMs` et `fog.ts` déjà en place, positions dérivées du seed comme le
  reste de l'univers.

### Vague D — Rendu react-three-fiber, primitives neutres

Livrée volontairement **sans habillage** — sphères, points, boîtes : on valide caméra, picking,
orbites, routage et performances sur une base nue avant d'ajouter la couche visuelle. Un
problème de performance et un problème d'art ne se déboguent pas ensemble.

- **31.12** — dépendances `three`/`@react-three/fiber`/`@react-three/drei` déclarées dans les
  catalogues pnpm (convention 27.1), socle `<Canvas>`, caméra partagée, pont vers les routes
  imbriquées existantes (`/map/galaxy/:id/system/:id/body/:id`) — le routage ne change pas.
- **31.13** — vue univers : les galaxies matérialisées dans le disque, portails actifs.
- **31.14** — vue galaxie : systèmes et arêtes de saut en volume, itinéraires de 31.10 affichés,
  longueur d'arête enfin lisible puisqu'elle porte désormais le coût.
- **31.15** — vue système : orbites animées, corps positionnés par `bodyPositionAt`, sites de
  31.11.
- **31.16** — parité d'accessibilité avec 27.21 : un canvas est opaque aux lecteurs d'écran, il
  faut une liste DOM parallèle **en plus** d'une caméra pilotable au clavier — le simple portage
  des raccourcis de `ZoomableSvg` ne suffit pas. `ZoomableSvg` n'est pas supprimé pour autant :
  `ResearchView` et `StationDiagram` l'utilisent toujours.
- **31.17** — perf et responsive mobile sous WebGL, pour tenir les acquis de 27.22 et servir de
  référence à 31.23.

### Vague E — Habillage 3D

Décision tracée dans l'ADR [0007](adr/0007-habillage-3d-procedural-et-parametrique.md).
Aucun fichier `.glb`, aucune texture bitmap : l'astronomique est procédural (dérivé du seed), le
manufacturé est paramétrique (dérivé du contenu). C'est le prolongement direct de ce que font
déjà `ShipHullDiagram.tsx` et `StationDiagram.tsx` en 2D, et ça préserve le lien « mon vaisseau
ressemble au plan que j'ai conçu ». Deux registres visuels : abstrait et schématique aux niveaux
univers et galaxie (c'est une carte de commandement, elle prolonge le HUD du `ui-brief`),
semi-réaliste aux niveaux système et corps (c'est là qu'on regarde vraiment).

- **31.18** — socle d'habillage : registre d'apparence côté client (type → forme, teinte,
  échelle) avec repli générique obligatoire, et bascule des deux registres selon le niveau.
- **31.19** — astronomique procédural : planètes par shader selon les 6 `PlanetType` modulées
  par `habitability` et `deposits`, étoiles émissives, astéroïdes en icosphères déformées
  seedées par id, galaxies en nuages de points.
- **31.20** — vaisseaux paramétriques : portage 3D de la logique de `ShipHullDiagram.tsx`,
  géométrie dérivée du `ChassisKind` et des modules montés par `SlotType`.
- **31.21** — stations paramétriques : extrusion de la grille hexagonale existante
  (`station-layout.ts`) plus une géométrie par type de zone et par installation.
- **31.22** — apparence éditable dans le CMS, séquencée **après** 31.20-31.21 : impossible
  d'exposer un champ « forme de base » avant de savoir quelles formes le moteur sait rendre.
  Champs d'apparence sur les domaines de contenu manufacturés qui ont déjà une table, chaîne
  complète depuis les defs par défaut jusqu'aux écrans admin en passant par la régénération du
  client orval (27.8b). Les corps astronomiques restent hors périmètre : `PLANET_TYPES` est une
  énumération de modèle, pas un domaine CMS.
- **31.23** — passe de performance sous habillage : instanciation des astéroïdes et des points
  de galaxie, LOD par niveau de carte, re-mesure mobile contre la référence de 31.17.

**Chemin critique** : `31.1 → 31.2 → 31.3 → 31.4 → 31.5`, puis des branches indépendantes —
`31.6 → {31.7, 31.10}`, `31.8 → 31.9`, `31.11`, et `31.12 → {31.13, 31.14, 31.15} → {31.16,
31.17}` côté rendu, la vague E venant ensuite (`31.18 → {31.19, 31.20 → 31.22, 31.21 → 31.22}
→ 31.23`). 31.5 est le verrou : la géométrie pure sert les deux branches et rien de sérieux ne
démarre avant elle. 31.14 consomme 31.10, 31.15 consomme 31.11.

La vague D livre une carte 3D fonctionnelle quoique nue : si la vague E s'étire, elle peut
devenir un chantier autonome sans laisser le dépôt dans un état intermédiaire — au contraire des
vagues A→C, indissociables entre elles.

### Bilan (31/08/2026)

**Vagues A à E livrées** — 31.1 à 31.23, à l'exception des choix de périmètre notés
ci-dessous. Trois verrous de calibration cohabitent désormais, tous sur le modèle du
chantier 18 : `universe.fixture.test.ts` (flux du générateur), `travel.calibration.test.ts`
(coût inter-système), `orbits.calibration.test.ts` (échelle de temps orbital). Ce sont
les trois endroits où une modification anodine ferait dériver l'économie en silence.

Deux mesures ont conclu « ne rien changer », et c'est le résultat qui comptait : le coût
moyen n'a dérivé que de -1,1 % au passage aux distances pondérées (31.7), et les trois
critères de jouabilité orbitale étaient tenus sans toucher une constante (31.9).

Performance après habillage : 42-51 images/s au niveau univers, 50-51 au niveau système,
contre 35-49 et 31-48 sous primitives — la passe de LOD (31.23) a bien payé sur la vue
système, la plus chargée.

**Périmètres volontairement restreints, à ne pas confondre avec des oublis :**

- Les tronçons locaux d'un trajet **interstellaire** restent ignorés (tranché en 31.9) :
  ils n'offrent aucune décision au joueur, qui ne choisit ni où est sa colonie ni où
  l'attend sa destination.
- Les **ceintures d'astéroïdes** n'ont pas de position ponctuelle : un anneau n'a pas UNE
  position et `buildOutpost` raisonne au niveau système. Rien à inventer tant qu'un
  avant-poste n'a pas de position propre.
- L'apparence CMS (31.22) ne couvre que **châssis et types de zone**, les deux domaines
  qu'un rendu paramétrique consomme réellement.
- **`apps/web` ne voit pas l'apparence éditée** : le client lit le contenu statique de
  `packages/shared` et le protocole ne transporte aucune définition de contenu. C'est
  vrai depuis le chantier 23 et pas propre à l'apparence — éditer le coût d'un bâtiment
  ne change pas non plus son affichage côté joueur. Publier le contenu sur le fil est un
  chantier en soi.

### 31.24 — Reprise du rendu après inspection visuelle (31/08/2026)

Le bilan ci-dessus notait que le rendu 3D n'avait jamais été **regardé** : la vérification
passait par l'e2e (canvas dimensionné, budget d'images, listes DOM peuplées, pas d'erreur
console), ce qui prouve que la scène monte et tourne, pas qu'elle est juste. Une capture
d'écran a suffi à montrer qu'elle ne l'était pas. Quatre défauts, tous invisibles aux tests :

- **Un « brouillard » fixe.** `.map-canvas` peignait une vignette radiale DERRIÈRE un canvas
  en `alpha: true`. Figée en coordonnées d'écran, elle ne tournait pas avec la caméra : on la
  lisait comme une nappe immobile masquant une partie du champ selon l'angle. Son centre
  (`#0d1420`, plus clair que `--bg`) effaçait en prime la grille par manque de contraste.
  Fond plat désormais ; un repère de profondeur doit vivre DANS la scène.
- **Cadrage sur les constantes de génération** (`MAP_WIDTH`, `GALAXY_SPACING`) et visée sur
  l'origine. Or le générateur ne remplit pas son pavé et ne le centre pas : quatre galaxies
  occupent une fraction de l'amas théorique, quatorze systèmes se groupent dans un coin. La
  caméra était à la fois trop loin et pointée à côté — la moitié des objets hors champ.
  Nouveau `map3d/bounds.ts` : boîte englobante du contenu réel, et recul calculé sur ses huit
  coins **en tenant compte du rapport d'image** (sur téléphone la scène est plus haute que
  large, un cadrage vertical seul y couperait les bords).
- **La caméra n'appartenait pas au joueur.** Le recadrage se rejouait après coup — R3F mesure
  son canvas en plusieurs temps et chaque tick serveur relance le rendu —, annulant la
  rotation faite à la souris une demi-seconde plus tard. La vue système était littéralement
  impossible à tourner. Le cadrage automatique s'applique désormais une fois par scène et
  cesse dès le premier geste sur les contrôles.
- **Les raccourcis clavier n'étaient jamais déclenchés.** `CameraKeys` écoutait sur
  `gl.domElement.parentElement`, mais R3F intercale ses propres div : l'écouteur se posait sur
  un **descendant** de l'élément focusé, où un `keydown` ne remonte jamais. C'était le seul
  chemin de navigation au clavier de la carte (31.16).

Passe de lisibilité au passage sur la vue système : rayons de rendu des corps relevés (une
planète faisait 6 unités contre 30 pour la couronne de l'étoile) et plancher de cadrage aligné
sur cette couronne au lieu d'une valeur ronde de 200.

**Ce que la reprise a appris sur la vérification.** Trois de ces quatre défauts sont
inobservables depuis le DOM : une caméra 3D n'y laisse aucune trace, et l'e2e du chantier 31
passait au vert sur une carte à moitié vide et impossible à manipuler. D'où deux compteurs
exposés sur la section hôte — `data-map-fits` (recadrages appliqués) et `data-map-keys`
(touches traitées) —, seuls points vérifiables de l'extérieur, et le test « la caméra reste au
joueur ».
*`data-map-keys` a disparu au chantier 38 avec le pilotage clavier de la caméra ; la famille,
elle, s'est étoffée — `data-map-tier`, `data-map-depth`, `data-map-labels`, `data-map-aim`, et
`data-map-elevation` au chantier 40.* Ce qu'ils ne prouvent pas : que la caméra se déplace du
bon nombre d'unités. Le cadrage lui-même, qui est du calcul pur, est couvert par
`map3d/bounds.test.ts`.

### Vérification du chantier

31.1-31.5 sont du code pur : couverts par des tests unitaires déterministes, comme le reste de
`packages/shared` ; `universe.fixture.test.ts` doit échouer avant le bump de
`GENERATOR_VERSION` et passer après. 31.6-31.11 exigent une mesure avant/après explicite
(harnais 27.7), pas seulement des tests verts — un recalibrage qui passe les tests peut rendre
le jeu injouable. 31.12-31.23 se vérifient au navigateur, e2e compris pour les quatre niveaux de
carte, avec un relevé d'images par seconde en mobile émulé comme référence de performance.

## Chantier 32 — Tissu social et profondeur économique (planification 30/08/2026)

Le chantier 31 installe la topologie d'EVE — graphe de portes entre systèmes, espace continu
dans un système — mais c'est un chantier de **fidélité spatiale** : il rend la géométrie vraie,
il ne produit pas à lui seul les décisions de joueur qui font le genre. Ce chantier-ci s'attaque
à ce qui manque réellement, mesuré dans le dépôt :

| Manque | État constaté |
|---|---|
| Organisations de joueurs | `Relation` est une paire empire↔empire. Ni corporation, ni portefeuille partagé, ni rôles, ni hangar commun — mais `marketAccess: "alliance"` lit déjà les relations, le concept est à moitié là. |
| Communication | Zéro. Ni chat, ni courrier. `proposeRelation` est un bouton sans conversation possible. |
| Agence du défenseur | `resolveBattle` s'exécute dans le handler de commande : hors ligne, aucun contre-jeu et aucune notification. |
| Profondeur de marché | Pas de carnet d'ordres. Le prix est une courbe `stock / TARGET_STOCK` bornée à 0,4–2,5 : ni ordre limite, ni market-making, ni arbitrage. `Contract` couvre le pair-à-pair en coup unique. |
| Aucune spécialisation forcée | Un empire mine, construit, cherche, combat et commerce. Rien n'oblige à dépendre d'autrui — or l'interdépendance est ce qui produit les corporations, donc la politique. |

Grain volontairement plus grossier que le chantier 31 : la forme exacte dépendra de ce qu'aura
appris la 3D. Ce chantier aura sa propre ADR à son ouverture, et il est assez gros pour être
scindé à ce moment-là — la frontière naturelle passe après la vague C.

- **Vague A — boîte de réception d'empire.** Meilleur rapport valeur/ligne du lot et préalable
  de tout le reste : sans canal d'événements durables, aucune mécanique suivante n'est
  perceptible par un joueur hors ligne. `StoredBattle` est déjà archivé et poussé dans le
  snapshot ; il manque un flux d'événements (attaque subie, contrat honoré, recherche finie,
  claim perdu) et un digest « pendant ton absence » à la reconnexion.
- **Vague B — corporations.** Entité de premier rang : membres, rôles et permissions (le
  vocabulaire de `packages/protocol/src/admin.ts` est directement réutilisable), portefeuille
  partagé, hangar commun.
- **Vague C — communication.** Canaux et courrier asynchrone. Rouvre la modération : le mute de
  chat était hors périmètre en 23.4 faute de chat, il redevient nécessaire le jour où le chat
  existe et doit être livré **avec**, pas après.
- **Vague D — relations et standings.** Au-delà de la paire `nap`/`alliance` : relations
  corp↔corp, standings gradués, réputation lisible par des tiers.
- **Vague E — profondeur de marché.** Carnet d'ordres pour les places **joueur** ; les comptoirs
  PNJ gardent leur courbe, qui est exactement ce qu'on attend d'une liquidité PNJ. Le morceau le
  plus lourd, et celui qui crée le plus de jeu pour les joueurs non combattants.
- **Vague F — spécialisation et interdépendance.** Le plus difficile à concevoir et le plus
  déterminant : tant qu'un empire peut tout faire seul, corporations et marché restent
  décoratifs. Branches technologiques exclusives, paliers de coût infranchissables seul, chaînes
  de production dont les intrants ne coexistent pas dans une même région — à trancher avec une
  ADR dédiée, c'est une décision d'équilibrage structurelle.

**Ordre** : `A → B → C → D` est une chaîne, chaque étage ayant besoin du précédent pour être
perceptible et gouvernable. `E` ne dépend que de `A`. `F` conditionne l'intérêt de `B` et `E`
mais peut être conçu en dernier, une fois qu'on voit ce que les joueurs font des deux autres.

### Vague A — Boîte de réception d'empire (ouverte 31/08/2026)

Décision et alternatives écartées : [ADR 0008](adr/0008-journal-d-evenements-d-empire.md).
Trois points y sont tranchés et cadrent toute la vague : un événement est une **donnée
structurée** rendue par le client (le serveur ne parle pas la langue du joueur — précédent
27.19 sur `Contract.issuerFactionId`), il est **durable et redacté par empire**, et il est
**borné des deux côtés** (purge en base des lus au-delà de 200, 50 sur le fil) parce que
c'est le seul objet du snapshot qui croît sans jamais décroître.

- **32.1** — modèle `EmpireEvent` dans `packages/shared/src/model/social.ts` et contrats
  Zod dans `packages/protocol`. Les `kind` couvrent ce qu'un joueur absent doit retrouver :
  attaque subie ou menée, colonie attaquée, claim perdu, contrat honoré, recherche finie,
  relation changée, objectif rempli. Constantes de bornage dans `constants.ts`.
- **32.2** — persistance : table `empire_events`, `EmpireEventRepository` propriétaire
  unique, migration Drizzle. Écriture via le `WriteSet` comme le reste (ADR 0003).
- **32.3** — `InboxService` : émission, chargement au boot, purge bornée, marquage lu.
  Projection `eventsForEmpire` + `unreadEventCount` dans le snapshot, commandes
  `markEventRead` / `markAllEventsRead`.
- **32.4** — émetteurs branchés dans les services de domaine (flotte, contrat, industrie,
  diplomatie, objectif) via une fonction injectée par `composeEngine`, au même titre que
  `persistColony` — aucun service ne dépend de l'`InboxService` (ADR 0001).
- **32.5** — client : panneau de boîte de réception, pastille de non-lus, et digest
  « pendant ton absence » à la reconnexion.

**Bilan de la vague A (31/08/2026).** Livrée en entier, 32.1 à 32.5.

Deux arbitrages sont apparus en la faisant, tous deux sur le bruit :

- **La ponction pirate n'est pas un événement, l'apparition du repaire en est un.** Le
  pillage retire des crédits à *chaque tick* ; en faire une entrée noierait le journal
  sous une ligne toutes les cinq secondes. Un repaire apparaît une fois et appelle une
  décision — aller le détruire ou le subir. D'où un `kind` supplémentaire non prévu,
  `lair_appeared`, qui est aussi la seule attaque que subit un joueur solo.
- **On prévient toujours la partie qui APPREND quelque chose, jamais celle qui vient
  d'agir.** L'agresseur voit sa bataille à l'écran ; c'est la cible qui peut être hors
  ligne. Idem pour le contrat (l'émetteur, pas celui qui accepte) et le pacte accepté
  (le proposant, pas celui qui répond).

Rien n'est émis vers un empire PNJ : personne ne lira son journal, et il grossirait sans
borne puisqu'un PNJ ne marque jamais rien comme lu.

Le test de purge vérifie en **base** et non en mémoire — c'est lui qui a révélé que
`empire_events` manquait au registre du `Persister`, cas où la RAM serait restée bornée
pendant que la table grossissait sans fin. L'e2e couvre la chaîne entière, du fait de
simulation à la pastille de l'onglet et retour par le WebSocket.

**Ce qui reste hors de la vague A**, et pourquoi : le `battleLog` partagé n'est pas absorbé
(journal public de combats, utile en soi, migration pour un gain nul) ; aucune notification
hors-jeu (courriel, push) — c'est un canal, pas un événement, et il appartiendrait à la
vague C.

### Vague B — Corporations (ouverte 31/08/2026)

Décision et alternatives écartées :
[ADR 0009](adr/0009-corporations-entite-de-premier-rang.md). Quatre points y sont tranchés :
la corporation est une **entité de premier rang** (une `Relation` est une arête, elle n'a
nulle part où porter un rôle ni un solde) ; ce n'est **pas un empire** (ni colonie, ni
flotte, ni brouillard) ; l'appartenance est **exclusive** ; et le coffre ne contient que
des **crédits**, parce que les ressources sont situées (ADR 0004) et qu'un coffre de métaux
sans lieu serait un téléporteur.

- **32.6** — modèle `Corporation` / `CorporationMember`, rôles et permissions namespacées
  sur la forme de `admin.ts` mais dans une énumération distincte, contrats Zod.
- **32.7** — persistance : tables `corporations` et `corporation_members`, repository
  propriétaire unique, migration Drizzle.
- **32.8** — `CorporationService` : fonder, inviter, répondre, quitter, exclure, changer un
  rôle, dissoudre. Projection redactée et commandes WebSocket. Les changements
  d'appartenance passent par le journal d'empire (vague A) — ils arrivent typiquement
  pendant que le joueur concerné n'est pas là.
- **32.9** — coffre partagé : dépôt et retrait de crédits par une colonie du membre,
  soumis aux permissions.
- **32.10** — palier d'accès `corp` sur les stations. C'est le « hangar commun » du plan,
  rendu sans violer l'ADR 0004 : les membres commercent à la station d'un autre membre **en
  s'y rendant**, le partage garde son coût logistique.
- **32.11** — client : vue Corporation (fonder, membres, rôles, coffre, invitations).

**Bilan de la vague B (31/08/2026).** Livrée en entier, 32.6 à 32.11.

Deux ajouts non prévus, tous deux imposés par le constat que sans eux la fonctionnalité
serait socialement inerte :

- **`LeaderboardEntry` porte désormais `kind` et le sigle de corporation.** Le sigle,
  parce que l'ADR 0009 dit la corporation publique : sans lui au classement, elle
  n'existerait que pour ses membres et ne pèserait sur aucune décision de tiers. Le
  `kind`, parce que le client proposait d'inviter des empires PNJ que le serveur refuse —
  proposer un clic voué au refus n'est pas une interface.
- **Un membre passe les paliers d'accès plus permissifs.** Sans cette règle, ouvrir sa
  station aux alliés la fermerait à ses propres associés, ce qui n'a aucun sens.

L'e2e est le **premier scénario à deux joueurs** de la suite : deux contextes de
navigateur isolés, donc deux sessions réelles. C'est le seul moyen de vérifier qu'une
invitation traverse le serveur, atteint le journal du destinataire et lui donne un geste à
faire ; un test à un joueur ne pourrait que constater qu'une commande a été acceptée.

Un défaut trouvé à l'écriture des tests client : `CorporationView` ne tire aucun module de
traduction par transitivité (elle n'utilise pas `labels.js`), donc l'instance i18next
n'existait pas sous test et `t()` renvoyait ses clés — un test qui aurait pu passer pour
les mauvaises raisons, comme au chantier 31 avec `TransferPanel`.

**Hors périmètre de la vague B**, et pourquoi : un entrepôt possédé *par la corporation
elle-même* suppose qu'elle possède des structures, donc un territoire, une file de
construction et une position — décision d'un autre ordre. Aucune corporation PNJ : rien ne
les ferait jouer, et il faudrait leur inventer une politique.

### Vague C — Communication (ouverte 31/08/2026)

Décision et alternatives écartées :
[ADR 0010](adr/0010-communication-canaux-bornes-et-courrier.md). Quatre points tranchés :
deux canaux définis par l'**appartenance dérivée** de l'état du jeu et non par un
abonnement (`corp`, `galaxy`) ; un canal est **borné et jetable** là où le journal ne purge
jamais un non-lu ; le **courrier n'est ni du chat ni un événement** (il a un corps et se
relit), mais il réutilise le journal pour prévenir ; et le **silence est livré avec**, sur
un axe distinct de la suspension.

- **32.12** — modèle `ChatMessage` / `Mail`, canaux, bornes, contrats Zod.
- **32.13** — persistance : tables `chat_messages` et `mails`, repository, migration.
- **32.14** — `ChatService` : appartenance dérivée, envoi, historique borné, projection.
- **32.15** — courrier asynchrone : envoi, lecture, notification par le journal.
- **32.16** — modération : sanction `mute` sur un second calcul de statut
  (`computeMuteStatus`), vérifiée à l'envoi côté serveur, exposée dans `apps/admin`.
- **32.17** — client : panneau de communication (canaux + courrier).

**Bilan de la vague C (31/08/2026).** Livrée en entier, 32.12 à 32.17.

Trois choses trouvées en la faisant :

- **Un canal déduit des messages reçus est invisible tant qu'il est silencieux.** Le
  client construisait sa liste de canaux depuis ce qu'il avait entendu — personne n'aurait
  jamais pu parler en premier. Le serveur publie désormais `chatChannels` explicitement.
- **Le quota d'authentification bloquait la suite e2e**, pas une limite de jeu : dix
  inscriptions par minute et par IP est la bonne valeur en production et devient
  intenable dès que la suite fait vivre plusieurs joueurs. `AUTH_RATE_LIMIT_MAX` est
  configurable, relevé dans le seul `webServer` de Playwright ; le défaut ne bouge pas.
- **La suite e2e passe à un worker unique.** Elle mesure des budgets d'images sur un
  pilote OpenGL logiciel : mesurer pendant que d'autres navigateurs se disputent le
  processeur ne mesure rien. Relever le seuil aurait masqué une vraie régression au lieu
  de supprimer le bruit. Le test de caméra reste occasionnellement lent au premier
  contexte WebGL — son attente d'initialisation a été élargie à 20 s, et quatre passages
  consécutifs sont verts, mais ce n'est pas une preuve de stabilité définitive.

Le silence est arrivé **avec** le chat, comme le plan l'exigeait, et sur un axe distinct :
`computeMuteStatus` lit le même historique de sanctions que `computeSanctionStatus` mais
répond à une autre question. Un test vérifie explicitement qu'un silence n'empêche pas de
se connecter et qu'une suspension ne réduit pas au silence — la sanction doit correspondre
à la faute. Il prend effet immédiatement sur un joueur déjà connecté, sans quoi un
spammeur aurait continué jusqu'à sa prochaine reconnexion.

**Hors périmètre de la vague C** : la messagerie privée synchrone. Le courrier couvre le
besoin de s'adresser à quelqu'un ; un canal privé demanderait blocage individuel et
signalement, soit un étage de modération de plus que le mute.

### Vague D — Relations de corporation et standings (ouverte 31/08/2026)

Décision et alternatives écartées :
[ADR 0011](adr/0011-relations-de-corporation-et-standings.md). Quatre points tranchés : une
relation de corporation **réutilise `RelationState`** plutôt que d'inventer son échelle ;
la **guerre de corporation prime sur la paix individuelle** (sinon une déclaration ne
vaudrait rien, chacun la défaisant pour son compte) ; les **standings sont gradués,
publics, et gouvernent exactement une chose** — un palier d'accès de station décrivant une
opinion, là où les autres décrivent des appartenances ; et les états de corporation **se
posent au lieu de se proposer**, la réciprocité faisant l'accord.

- **32.18** — modèle `CorpRelation` / `Standing`, seuil d'accès, contrats Zod.
- **32.19** — persistance : tables `corp_relations` et `standings`, migration.
- **32.20** — service : poser un état entre corporations, poser un standing ; `atWar`
  élargi ; palier d'accès `standing` sur les stations ; journal vers le camp d'en face.
- **32.21** — client : états et standings dans la vue Corporation, position lisible dans
  le classement.

**Bilan de la vague D (31/08/2026).** Livrée en entier, 32.18 à 32.21.

Deux choses apparues en la faisant :

- **Un annuaire public des corporations manquait.** Relations et standings voyagent par
  identifiant ; sans `publicCorporations`, le client recevait des identifiants qu'il ne
  savait rattacher à aucun nom. C'est le pendant naturel de « le sigle est public »
  (ADR 0009), et il rend la carte politique lisible.
- **Les intentions de pacte ne sont pas persistées.** Une main tendue non réciproquée
  n'est pas un état du monde ; la perdre au redémarrage ne détruit rien puisqu'il suffit
  de la reposer d'un clic. Seule la relation effective va en base.

La règle qui compte, et qui est testée en priorité : **la guerre de corporation prime sur
la paix individuelle**. Un membre qui hérite d'une guerre ne peut pas s'en extraire pour
son compte — sinon une déclaration de corporation ne vaudrait rien. Le départ reste libre,
et c'est le contrepoids : quitter la corporation rend la paix.

**Hors périmètre de la vague D** : les standings ne gouvernent pas le droit d'attaquer
(l'état de relation le fait déjà, deux mécanismes concurrents rendraient la règle
illisible), et il n'y a pas de standing PNJ (`factionRep` du chantier 15 est le mécanisme
existant pour « ce que les PNJ pensent de moi »).

### Vague E — Profondeur de marché (ouverte 31/08/2026)

Décision et alternatives écartées :
[ADR 0012](adr/0012-carnet-d-ordres-et-avoirs-de-station.md). Quatre points tranchés : le
carnet remplace la courbe **pour les places joueur seulement** (la courbe PNJ reste le
filet, un carnet vide au lancement signifierait une économie morte) ; les ordres sont
adossés à des **avoirs déposés à la station**, sans quoi seul le propriétaire pourrait y
vendre ; l'**appariement est pur et déterministe**, au prix de l'ordre **au repos** — c'est
ce qui récompense d'afficher un prix et d'attendre ; et le **séquestre est intégral et
immédiat**, sinon le carnet afficherait des offres qu'un clic révèle creuses.

- **32.22** — modèle `MarketOrder` / `StationHolding`, constantes, contrats Zod.
- **32.23** — appariement pur dans `packages/shared` : `matchOrders`, priorité prix puis
  ancienneté, exécution au prix du repos.
- **32.24** — persistance : tables `market_orders` et `station_holdings`, migration.
- **32.25** — service : déposer et rapatrier un avoir par convoi, poser et annuler un
  ordre, exécuter, prélever la taxe de station.
- **32.26** — client : carnet d'ordres et avoirs dans la vue Stations.

**Bilan de la vague E (31/08/2026).** Livrée en entier, 32.22 à 32.26.

Ce que la vague a imposé au-delà du plan :

- **Un genre de mission `deposit_station`.** Sans lui, personne d'autre que le
  propriétaire ne pouvait avoir de marchandise sur place, donc personne d'autre ne pouvait
  vendre. Le dépôt coûte exactement le même convoi qu'une vente — c'est le point de
  l'ADR 0012 : le marché ne téléporte rien.
- **Un `resolveVenueAccess` distinct de `resolveTradeAccess`.** Le second exige une colonie
  de DÉPART parce qu'il prépare un convoi ; poser un ordre ne fait voyager personne.
- **La politique d'accès gouverne aussi le REGARD.** Un carnet fermé n'arrive pas dans le
  snapshot d'un étranger : la fermer n'aurait sinon qu'un effet cosmétique.
- **Un outil de dev `devFoundStation`**, même raison d'être que `devArmFleet` : rendre une
  situation atteignable sans rejouer une chaîne de recherche entière.

**Le remboursement de la différence de prix** est le détail qui aurait détruit de la
monnaie en silence : un acheteur séquestre à SA limite et paie le prix du repos, souvent
plus bas. Sans restitution, l'écart disparaissait du jeu. C'est testé explicitement.

**Vérification.** L'appariement est couvert par 14 tests purs, dont l'invariant « somme des
exécutions + reste = quantité demandée » qui interdit de créer ou détruire de la
marchandise ; le service en ajoute 8 sur le séquestre, la taxe et la visibilité. L'écran a
été vérifié visuellement. Ce que la vague n'a **pas** : un e2e du cycle complet
dépôt → ordre → exécution → rapatriement — il demande d'attendre plusieurs convois, et
l'économie qu'il couvrirait est déjà prouvée par les tests purs.

**Hors périmètre de la vague E** : `Contract` n'est pas absorbé (il vise une colonie et
paie une livraison, pas un échange sur place) et les comptoirs PNJ gardent leur courbe.

## Chantier 33 — Habillage holographique des objets manufacturés (31/08/2026)

Décision et alternatives écartées :
[ADR 0013](adr/0013-registre-holographique-des-apercus.md).

Le rendu 3D des vaisseaux et des stations existe depuis le chantier 31 (vague E) mais il est
pauvre : un vaisseau est un cylindre plus un cône avec une capsule par module, une station
un prisme hexagonal par zone. Six châssis se distinguent par trois nombres, quatre types de
zone par une hauteur d'extrusion. **C'est le risque que l'ADR 0007 s'était désigné à
elle-même** — « les objets manufacturés risquent de se ressembler si les paramètres de forme
sont trop pauvres » — et il s'est réalisé.

Ce chantier le corrige, et ajoute un **troisième registre visuel** : holographique, réservé
aux aperçus d'objets manufacturés. Ce n'est pas un écart de style — l'aperçu 3D est affiché
à côté du diagramme 2D du même objet, et ce diagramme est déjà un contour cyan sur un lavis
cyan. Les deux vues parlent enfin la même langue.

- **33.1** — ADR 0013 et entrée de roadmap.
- **33.2** — socle : `themeColor` (les couleurs viennent de `tokens.css`, plus des hex
  périmés codés en dur) et `HoloMaterial` (Fresnel, balayage, arêtes vives par `<Edges>`).
- **33.3** — `shipLayout` et `stationLayout`, fonctions **pures** rendant des listes de
  pièces. Le dépôt n'a aucun test de composant three.js ; plutôt qu'ajouter un harnais
  WebGL, on sort la décision de forme du rendu — même séparation que `bounds.ts`.
- **33.4** — vaisseaux : profil de coque autoré par `ChassisKind`, formes de module par
  `ModuleRole` (huit, contre quatre `SlotType` aujourd'hui — la donnée existe déjà),
  position par `SlotType`, échelle par tonnage avec la formule exacte du diagramme 2D.
- **33.5** — stations : silhouette propre par type de zone, coursives entre zones
  **adjacentes** au lieu de rayons vers le moyeu, installations en accessoires, zones en
  file rendues en fantôme.
- **33.6** — aperçu : vignette radiale supprimée (même raison qu'au 31.24), éclairage réduit
  à ce que le registre exige, `fov`/`far` posés, plan de grille dans la scène.
- **33.7** — tests des deux fonctions pures et budget d'images de l'aperçu, qui n'en avait
  aucun alors qu'il tourne en continu (`autoRotate`).

**Bilan (31/08/2026).** Livré, 33.1 à 33.7.

Trois défauts trouvés en chemin, tous invisibles jusqu'à ce qu'on regarde :

- **Le rendu 3D groupait les modules par COMPTE d'emplacement et jetait leur identité.**
  Deux plans aux mêmes comptes rendaient une image identique au pixel près. Le risque que
  l'ADR 0007 s'était désigné n'était pas hypothétique, il était en production.
- **Le champ de la caméra d'aperçu n'avait jamais été posé** — 75° par défaut de R3F, un
  grand-angle sur un cadre de 220 px. Les coques s'en trouvaient écrasées.
- **Le test de `station-layout` gardait sa propre copie de la table d'adjacence** : il
  vérifiait la règle de croissance contre sa définition du voisinage, pas contre celle du
  module. L'export exigé par les coursives l'a mis au jour.

La leçon du 31.24 tient : trois tests unitaires portent des invariants qu'aucun e2e ne
verrait — les six classes de coque sont mécaniquement distinctes, les seules pièces
lumineuses sont les tuyères (le budget de lueur du `ui-brief`, vérifié plutôt que promis),
et le nombre d'accessoires rendus égale le nombre d'installations bâties. L'e2e de
l'aperçu, lui, **assert zéro erreur de console** : une faute de shader ne rend rien du tout
pendant que toutes les assertions DOM restent vertes.

Budget d'images : 61 img/s pour l'aperçu, la carte inchangée à 57-61.

**Hors périmètre** : les corps astronomiques (la table des deux registres de l'ADR 0007
reste vraie pour les niveaux de carte) ; le texte en 3D (drei `<Text>` charge une police
depuis un CDN, ce que `tokens.css` interdit) ; l'édition, qui reste aux diagrammes 2D ;
`prefers-reduced-motion` sur la rotation automatique, défaut d'accessibilité **préexistant**
et non introduit ici, à traiter avec le reste de l'a11y.

## Chantier 34 — Densité de concept art pour les objets manufacturés (31/08/2026)

Décision et alternatives écartées :
[ADR 0014](adr/0014-densite-decorative-des-objets-manufactures.md).

Le chantier 33 a donné aux vaisseaux et aux stations un registre holographique et des
silhouettes distinctes. Il n'a pas donné de **densité** : une coque nue rend dix pièces, un
croiseur garni une trentaine, une station à cinq zones trente-trois. Aucune n'est du détail
de surface. Le diagramme **2D** du même vaisseau porte quinze à vingt-quatre éléments
autorés à la main — la vue 3D est plus pauvre que la vue 2D qu'elle complète.

La cible : deux à quatre cents pièces par objet, à la densité d'un concept art
*hard-surface*. Un plan compte une dizaine de modules : il n'y a pas assez de données pour
justifier une pièce sur dix. L'ADR 0014 tranche — la structure reste signifiante, la surface
devient décorative, et la décoration reste une **empreinte du plan** (tirée de `seedOf` sur
châssis + modules), donc déterministe et vérifiable.

- **34.1** — ADR 0014 et entrée de roadmap.
- **34.2** — fusion des géométries **par teinte** : un maillage et un jeu d'arêtes par
  teinte au lieu de deux appels de rendu par pièce. Les arêtes sont calculées **avant** la
  fusion, sur la pièce isolée, pour préserver le seuil d'angle propre à chacune. Livrée
  avant la densité : trois cents pièces sans fusion feraient tomber le budget d'images et
  masqueraient la cause.
- **34.3** — `greeble.ts`, bibliothèque de détail **pure** partagée par les vaisseaux et les
  stations : coutures de panneau, bandes de plaques, semis de greebles, trappes, ailettes,
  pylônes, verrières, grappes d'antennes, anneaux de fuselage.
- **34.4** — vaisseaux, de dix à ~230 pièces nues et ~310 garnies. Le décor seul ne
  suffisait pas : deux cents pièces posées sur trois troncs de cône rendaient un fuselage
  lisse et flou. Il a fallu ajouter une **superstructure** — pont dorsal, quille, sponsons,
  bloc de poupe — car ce sont les masses qui font lire un objet construit. Taille des
  modules tirée du tonnage (elle était figée à 0,3 pour tous), quatre à dix primitives par
  rôle, et suppression de la branche morte `outboard`.
- **34.5** — stations, de trente-trois à ~290 pièces : étages en redan, décor par zone,
  radiateurs, coursives à anneaux, moyeu détaillé et sa grappe d'antennes.
- **34.6** — concepteur : mode parcours et mode édition. La liste des plans disparaît en
  édition et l'aperçu 3D passe en vedette.
- **34.7** — tests de densité, de déterminisme et d'empreinte, garde du budget d'images.

**Hors périmètre** : les corps astronomiques, qui gardent leur rendu ; les fichiers
d'assets, la contrainte de l'ADR 0007 étant inchangée ; le texte en 3D ;
`prefers-reduced-motion` sur la rotation automatique, défaut d'accessibilité préexistant.

**Bilan (01/09/2026).** Livré, 34.1 à 34.7.

| Objet | Avant | Après |
|---|---|---|
| Coque standard nue | 10 | 215 |
| Croiseur de bataille nu | 12 | 229 |
| Coque standard garnie | 27-31 | 312 |
| Station à cinq zones | 33 | ~290 |

Appels de rendu : **deux par pièce** avant, **deux par teinte** après — cinq teintes, donc
dix appels quel que soit le nombre de pièces. Budget d'images inchangé à **57 img/s** pour
l'aperçu (57 au chantier 33 avec douze pièces) et 58/46 pour la carte : la fusion a
entièrement absorbé le facteur vingt.

Ce chantier s'est fait **en regardant**, et c'est ce qui l'a fait dévier du plan. Trois
choses qu'aucun test n'aurait dites, toutes consignées dans l'ADR 0014 :

- **La densité ne remplace pas la silhouette.** Le premier jet a posé deux cents pièces de
  décor sur trois troncs de cône empilés. Résultat : un fuselage lisse et flou, plus
  brouillon que les douze pièces de départ. Il a fallu ajouter une superstructure — pont,
  quille, sponsons, bloc de poupe — parce que ce sont les masses qui font lire un objet
  construit. La silhouette d'abord, le décor après.
- **Le mélange additif s'accumule.** Deux cents petits volumes translucides ne rendent pas
  deux cents détails, ils rendent un nuage lumineux qui avale jusqu'aux masses qu'on vient
  d'ajouter. Le décor ne garde que ses arêtes ; le remplissage reste aux volumes qui portent
  la forme. C'est ce partage qui donne la lecture « blueprint ».
- **Le seuil d'angle des arêtes doit se calculer.** Un anneau à douze faces conservé à 18°
  garde aussi ses douze arêtes latérales : huit anneaux par tronc tressaient un panier de
  fil de fer par-dessus la coque. C'était la cause principale du rendu « cocon ».

Deux tests ont attrapé ce que l'œil n'aurait pas vu : les anneaux de coursive s'étaient
glissés sous le préfixe `corridor-` et gonflaient silencieusement le compte des coursives ;
et le témoin du palier lourd comptait le total des pièces, un proxy devenu faux puisque le
budget de décor est volontairement constant d'un châssis à l'autre. À l'inverse, le test
« tout le décor plaqué reste collé à la surface » tient un invariant qu'aucun e2e ne verrait
— le premier jet avait des ailettes de radiateur flottant à côté de la coque comme des
débris.

Dette soldée : `ShipHullDiagram` gardait une copie locale de `isHeavyTier` et un
`MAX_TONNAGE` écrit en dur qui masquaient `shipScale.ts`, module créé au chantier 33
précisément pour éviter cette divergence.

## Chantier 35 — Carte à zoom continu (livré)

La carte avait quatre niveaux qui s'excluaient : changer de niveau démontait un canvas pour
en monter un autre, et la caméra claquait d'un cadrage à l'autre. Le niveau corps était le
seul à n'être pas de la 3D — un schéma SVG figé de 320 px où les lunes ne tournaient jamais,
alors que la simulation les fait orbiter depuis le chantier 31. Sélectionner une galaxie
n'ouvrait rien du tout, et ceintures comme sites de scan n'avaient aucun gestionnaire de clic.

Décisions structurantes : ADR [0015](adr/0015-carte-a-zoom-continu.md) pour la traversée
continue, ADR [0016](adr/0016-classes-d-etoiles-derivees.md) pour les classes d'étoiles.
Ce chantier **renverse** deux décisions écrites plus haut dans ce document : « LOD par niveau
de carte » (chantier 31) et « double-clic réservé à l'ouverture des sous-cartes » (polish
carte du 24/07/2026).

### Partie A — la traversée (35.1 à 35.7)

- **35.1** `map3d/tiers.ts` : arithmétique pure de la profondeur — progression dans une bande,
  seuils de fondu, conversion de pose entre repères, plans de coupe, élection d'ancre. Aucun
  import de `three`, aucun composant, aucun état.
- **35.2** `MapScene` et `TierCamera` : univers ↔ galaxie en continu. `UniverseScene` et
  `GalaxyScene` deviennent des couches sans canvas ni liste.
- **35.3** Paliers système et corps intégrés, `BodyLayer` écrit, les quatre routes de carte
  réduites à `/map`, `useMapLevel` remplacé par `useMapView`.
- **35.4** `FadingGroup` : les couches s'effacent et réapparaissent avec la profondeur, par
  mutation directe des matériaux. Les deux shaders de corps gagnent un `uOpacity`.
- **35.5** `MapInfobox` posée sur l'objet, `onPointerMissed` pour la refermer, `autoFocus`
  optionnel sur `Popover`.
- **35.6** `MapSheet` en modale, `GalaxyFiche` — qui n'existait pas —, vol de caméra animé au
  double-clic, schéma SVG de `BodyView` supprimé.
- **35.7** Relevé de référence du budget d'images, transition comprise.

### Partie B — le peuplement (35.8 à 35.11)

- **35.8** Comptoirs, stations siennes et étrangères, avant-postes et flottes posés sur la
  carte. `StationModel` et `ShipModel` existaient depuis le chantier 31.21 mais ne servaient
  qu'aux aperçus : ce que le joueur construisait n'apparaissait pas là où il l'avait
  construit.
- **35.9** `sim/exploration/stars.ts` : classes d'étoiles et morphologies de galaxie dérivées
  de l'identifiant, conditionnées par le contenu du système.
- **35.10** Habillage : classes d'étoiles, trou noir avec disque d'accrétion, rochers déformés
  et teintés par leur gisement, anneaux de géantes gazeuses, formes de sites par nature,
  morphologies de galaxie, nébuleuses.
- **35.11** ADR, documentation, remesure.
- **35.12** Contrôle visuel final, et les trois défauts qu'il a trouvés — voir plus bas.

### Budget d'images

Relevé sur cette machine, en WebGL logiciel (`map3d.spec.ts` et `map-zoom.spec.ts`) :

| | avant chantier 35 | après |
|---|---|---|
| univers au repos | 61 | 59-62 |
| système au repos | 53 | 37-48 |
| transition univers→galaxie | non mesuré | 54-61 |

Le palier système paie le peuplement du chantier 35.8 et l'habillage du 35.10 — il dessine
désormais ce que le jeu contient. Le seuil du test (20 img/s) reste largement tenu. La mesure
est bruitée en rendu logiciel : les fourchettes valent mieux que les valeurs isolées.

### Ce qui a été coupé

Les **comètes** figuraient au plan comme optionnelles, « à couper en premier si le budget
d'images serre ». Il serre : le palier système a déjà perdu un cinquième de son budget. Une
orbite très excentrique avec sa queue en points, ajoutée par système, se paierait exactement
là où il reste le moins de marge.

La **lentille gravitationnelle** du trou noir a été écartée pour une raison technique et non
budgétaire : voir l'ADR 0016.

### Ce que ce chantier a appris sur la vérification

Six défauts de synchronisation n'ont été trouvés qu'en instrumentant, et aucun n'aurait
échoué à un test unitaire : l'URL qui se relisait elle-même et faisait descendre la carte
toute seule au chargement ; l'effet de saut qui rejouait toutes les cinq secondes parce qu'il
dépendait du tick ; les bornes de dolly d'`OrbitControls` réappliquées à chaque rendu React ;
l'élection d'ancre qui écrasait un saut en cours ; le palier publié par un effet quand la
profondeur l'était par la boucle d'images ; `FitCamera` qui ne rendait la caméra au joueur que
sur un glissement à la souris, jamais sur un déplacement programmatique.

Cinq d'entre eux ne se manifestaient qu'**à l'intermittence**, et l'un uniquement sous une
suite de tests complète — il fallait assez de galaxies pour que celle qu'on survole ne soit
pas celle qu'on vise. La leçon du chantier 31.24 se confirme : sur une carte 3D, ce qui n'est
pas publié dans le DOM n'existe pas pour la vérification.

### Et ce que l'instrumentation ne pouvait pas trouver (35.12)

Trois défauts de plus sont sortis du **contrôle visuel** final, qu'aucun des vingt-deux tests
de bout en bout n'attrapait — parce qu'ils visaient tous soigneusement un coin vide du canvas
pour éviter d'ouvrir quelque chose par mégarde.

- **L'infobox avalait la molette.** Elle est ancrée sur l'objet qu'on vient de sélectionner,
  c'est-à-dire sur celui vers lequel on va zoomer : opaque aux événements, elle rendait la
  carte insensible au zoom là précisément où le joueur regardait. Un correctif antérieur
  la décalait de 16 px en croyant traiter le problème ; il ne traitait que le cas où le
  curseur tombait pile sur l'ancre.
- **Échap ne la fermait pas.** `Popover` lie sa touche à son propre nœud, et l'infobox est
  montée sans prendre le focus — le lui donner retirerait au joueur les raccourcis de caméra.
  La touche n'atteignait donc rien, et le clavier ne pouvait pas refermer ce qu'il venait
  d'ouvrir depuis la liste.
- **Une géante gazeuse perdait ses anneaux au palier corps.** `PlanetRings` vivait dans
  `SystemLayer` ; le palier corps dessinait le même corps sans eux, au moment exact où l'on
  s'approche assez pour les regarder. Le prédicat et le composant vivent désormais dans
  `PlanetRings.tsx`, pour que deux paliers ne puissent plus en donner deux versions.

Les deux premiers sont couverts depuis par un test qui pose le curseur **sur** l'infobox,
seul endroit d'où ils sont visibles.

Deux constats sans correctif, qui sont des décisions plutôt que des défauts :

- **Un système inexploré n'a aucun corps connu**, donc aucune entrée de liste et aucun palier
  corps atteignable. Sa classe d'étoile est la plus banale, par le même brouillard — voir
  l'ADR [0016](adr/0016-classes-d-etoiles-derivees.md). La variété du ciel est donc une
  récompense d'exploration, pas un décor offert au premier regard.
- **Sélectionner ne déplace pas la cible de la caméra.** Le plan le prévoyait ; le geste
  demandé était « simplement sélectionner ouvre l'infobox », et faire paner la vue à chaque
  clic le contredirait. On vise à la molette, qui suit le curseur, ou au double-clic, qui
  vole.

Le budget d'images se mesure **conteneur `app` de dev arrêté** : laissé debout, il dispute
le processeur au pilote OpenGL logiciel et fait tomber la mesure du palier système de 42 à
moins de 20. Le seuil du test n'était pas en cause.

## Chantier 36 — Navigation orbitale, étiquettes et ciel (01/09/2026)

Six gênes relevées à l'usage après le chantier 35, toutes rapportées manette en main. Les
décisions structurantes sont dans l'ADR
[0017](adr/0017-navigation-orbitale-et-etiquettes.md), qui **renverse deux points** de l'ADR
0015 : le zoom-au-curseur et le double-clic qui ouvrait une fiche.

- **36.1** `tiers.ts` : `zoomStep`, `dollyEase`, `labelOpacity` — l'arithmétique du zoom
  amorti et du seuil d'apparition des noms, pure et testée comme le reste du module.
- **36.2** La caméra tourne autour de ce qu'elle regarde : panoramique et zoom-au-curseur
  retirés, dolly repris à la main, amorti, calibré sur la bande à traverser.
- **36.3** Les noms se posent sur les objets, en sprites cliquables.
- **36.4** La liste DOM devient un panneau dépliable en surimpression, l'état retenu.
- **36.5** Le double-clic vole et rien d'autre ; le clic simple attend de savoir si un second
  suit ; la sélection remonte au parent quand on quitte un palier.
- **36.6** Le nœud d'un système garde sa taille à l'écran, puis rejoint celle de l'étoile.
- **36.7** Les galaxies perdent leur disque peint : leurs étoiles se mêlent d'elles-mêmes.

### Ce que la navigation gagne, et ce qu'elle coûte

Neuf crans de molette pour descendre d'un palier, contre une trentaine. La traversée
complète du test de bout en bout passe de 28,6 s à 8,8 s.

Le prix est **la visée** : la cible de caméra n'étant plus déplaçable à la souris, atteindre
un objet qui n'est pas au centre demande un double-clic. La molette ne fait plus que la
profondeur, le glisser que l'orbite.

### Ce que ce chantier a appris sur la mesure

Le palier système semblait tomber de 42 à 21 img/s. Ni la boucle par image ni le rendu n'y
étaient pour quelque chose : c'était la **rastérisation des vingt noms au montage de la
couche**, un pic qui tombait exactement dans la fenêtre de mesure. Les textures se créent
désormais à la première apparition de l'étiquette.

Et le test lui-même mesurait le montage en croyant mesurer le repos. Sans pause de
stabilisation, la même configuration rendait 17 ou 60 images selon l'humeur de la machine —
trois runs consécutifs suffisaient à obtenir les deux. Une mesure qui varie du simple au
triple ne dit rien, et on a failli optimiser à l'aveugle contre elle.

| | avant chantier 36 | après |
|---|---|---|
| univers au repos | 59-62 | 51-61 |
| système au repos | 37-48 | 37-55 |

Toujours **conteneur `app` arrêté** : relancé sans qu'on y prenne garde par un
`docker compose run` sans `--no-deps`, il a faussé la moitié des relevés de ce chantier.

## Chantier 37 — Des galaxies spirales, denses, qui tiennent leur promesse

**Question de départ** : combien de systèmes dans une galaxie de Stellaris ou d'Endless
Space ? Repères — Stellaris 200 à 1000 étoiles (Tiny → Huge), Endless Space 2 ~25 à ~180. Une
galaxie SpaceSim en comptait **7 à 14** : de quoi peupler une région, pas de quoi dessiner une
galaxie. Le palier univers en peignait cent soixante, en spirale, et la descente démentait la
promesse.

Décision et raisons : [ADR 0018](adr/0018-morphologie-de-galaxie-structurante.md). La
morphologie devient une **entrée** du générateur ; le nuage du palier univers devient le rendu
des **positions réelles**, à la même échelle. Une galaxie compte 300-520 systèmes sur un disque
de rayon `√n`, densité constante.

### Ce que la mesure a démenti

Trois hypothèses du plan sont tombées à l'épreuve du relevé. Elles valent d'être écrites : ce
sont elles qui ont coûté le plus de temps.

1. **« Une spirale suffit. »** Non : tous les systèmes sur les bras, c'est un graphe en file
   indienne — diamètre **276 sauts** sur 520 systèmes. Un bras est une onde de densité, pas un
   ruban dans le vide ; 40 % d'inter-bras ramènent le diamètre à 59 et rendent le réseau
   praticable.
2. **« Il faudra diviser les constantes par saut. »** Non : un trajet ORDINAIRE ne s'allonge
   pas, parce que les empires démarrent groupés. Seule la traversée complète coûte plus cher —
   ce qu'une galaxie plus vaste doit signifier. Diviser aurait rendu la logistique de proximité
   quasi gratuite. Verrou : `travel.calibration.test.ts`.
3. **« Comprimer les trames rattrapera la charge utile. »** Non : `perMessageDeflate` rend un
   facteur quatre sur ces données, mais comprimer 270 Ko par joueur et par poussée coûte assez
   de latence pour faire échouer un aller-retour WebSocket. Retiré. Le bon levier était de ne
   pas envoyer — d'où le condensé des galaxies hors de portée.

### Ce que le changement a fait tomber

Trente-six fois plus de systèmes rend visible tout ce qui était linéaire et gratuit :

- `generatePositions` : rejet sans plafond, saturé vers 45 systèmes — le générateur se serait
  **figé sans message**.
- `generateLinks` : O(n² log n), exécuté DANS le tick par `growUniverse`.
- `appendGalaxies` : une requête par table, au-delà des 65 535 paramètres de Postgres —
  `RangeError: Invalid array length` depuis le parseur du protocole, pas une erreur lisible.
- `pickHomePlanet` : promettait des voisins « dès les premières heures » en triant 3 600
  planètes par habitabilité. À 4 400 unités d'étalement, les empires atterrissaient à cinquante
  sauts. La promesse était devenue fausse sans que rien ne le signale.
- `MapSheet` reconstruisait l'index de l'univers **à chaque rendu** : 300 insertions hier,
  13 000 aujourd'hui.
- `travel.calibration.test.ts` parcourait toutes les paires : 403 s de collecte et un
  `Math.min(...)` qui débordait la pile d'appels.
- Rendu : un `<mesh>` par système et un par arête, un nœud de 480 triangles, un raycast
  rayon-triangles sur cinq cents instances, une étiquette montée par système. Le palier galaxie
  tombait à **10 images par seconde**.

### Relevés

| | avant | après |
|---|---|---|
| systèmes par galaxie | 7-14 | 300-520 |
| arête moyenne | 194,6 | 197,6 |
| diamètre d'une galaxie (sauts, médiane) | 7 | 59 |
| `hello` brouillardé, 4 galaxies | 6 Ko | 227 Ko → **73 Ko** (condensé) |
| tas par galaxie | ~0,04 Mo | 1,59 Mo |
| `generateGalaxyAt` | 0,5 ms | 31 ms |
| `growUniverse(3)` dans le tick | — | 121 ms |
| img/s univers · galaxie · système | 61 · non mesuré · 55 | 61 · 39 · 53 |

Le palier **galaxie** n'était pas mesuré : c'est précisément celui que ce chantier a chargé.
Il l'est désormais (`map3d.spec.ts`).

## Chantier 38 — La sélection est l'ancre (03/09/2026)

Une gêne, rapportée manette en main après le chantier 37 : **« le centrage laisse à désirer,
ballotage de droite à gauche ou de haut en bas avant de réussir à centrer la cible »**. Les
décisions structurantes sont dans l'ADR [0019](adr/0019-la-selection-est-l-ancre.md), qui
**renverse trois points** de l'ADR 0017 : le panoramique retiré, le délai de 250 ms assumé
comme un prix, et « seul un vol déplace la cible ».

- **38.1** Plus aucun pilotage clavier de la caméra : `CameraKeys` supprimé, et avec lui
  `role="application"`, le `tabIndex` et l'indice clavier de la section hôte.
- **38.2** `smoothFactor`, `recenterStep`, `nearestOnScreen` dans `tiers.ts` — l'arithmétique
  du ressort et de l'élection au curseur, pure et testée comme le reste du module.
- **38.3** La sélection est l'ancre : `slotIdFor` et `pathFor` remplacent l'élection par image ;
  le clic simple ne diffère plus ; le recentrage suit la sélection en temps réel.
- **38.4** Le panoramique revient, au bouton droit, avec retour élastique.
- **38.5** Les événements souris passent à `@use-gesture/react`.

### Ce que le ballotage était

Pas un réglage à ajuster : une boucle de rétroaction fermée. `TierCamera` élisait sa cible à
chaque image — le candidat le plus proche du centre du cadre, sans hystérésis — puis tirait le
cadre vers cette cible. Le second déplaçait le point depuis lequel le premier mesurait. Deux
objets à peu près équidistants suffisaient à faire basculer l'élection, ce qui inversait la
traction. Et chaque bascule changeait aussi le cadrage de l'enfant, donc la progression, donc
les bornes de dolly : la vue glissait **et** le zoom hoquetait.

Trois aggravations : au palier univers, l'élection mesurait vers l'origine d'une galaxie et le
recentrage tirait vers le centre de la boîte de ses systèmes ; le recentrage ne s'appliquait
qu'en descente active, donc par rafales ; et sa constante était une fraction **par image**,
deux fois et demie plus rapide en 144 Hz — le défaut que `dollyEase` avait déjà corrigé.

Sous les quatre, une seule cause : trois autorités se disputaient `controls.target`, et aucune
ne savait ce que le joueur voulait. Le chantier 36 avait retiré le panoramique pour que la
cible cesse de dériver ; il l'avait rendue **automatique**, c'est-à-dire décidée par le zoom.

### Ce que la navigation gagne, et ce qu'elle coûte

La visée, que le chantier 36 avait facturée comme son prix, est rendue — par trois gestes
plutôt qu'un : cliquer, élire sous le curseur au premier cran de molette, glisser et relâcher.
Le clic simple ne coûte plus un quart de seconde.

Le prix, cette fois : **le premier cran de molette ouvre une infobox**, puisqu'il sélectionne ;
et le double-clic en laisse une ouverte sur la cible de son vol. C'est le contraire d'un défaut
— la boîte décrit ce vers quoi on va et le suit — mais c'est un changement de contrat, et le
test de bout en bout qui affirmait l'inverse a été réécrit pour l'affirmer.

### Ce que ce chantier a appris sur la vérification

**Le ballotage n'a aucune trace dans le DOM.** Une cible de caméra n'y laisse rien, et l'image
d'arrivée est la même dans les deux cas — seul le chemin diffère. D'où `data-map-aim`,
quatrième compteur posé sur la section hôte, et le test « la visée ne change pas en zoomant ».
Sans lui, la régression est invisible et le test passe au vert sur une carte qui ballotte.

**Deux défauts n'ont été trouvés que par la suite e2e**, et tous deux viennent de ce que
`cross` écrit désormais l'ascendance, ce qu'il ne faisait pas avant :

- un vol matérialise sa **destination entière**, parce que `tier` décrit encore l'origine
  pendant qu'il dure. Sans cela `childFocus` tombait à `null`, la borne de dolly rappelait la
  caméra vers le palier de départ pendant que le vol l'emmenait, et « Ma capitale »
  n'atteignait plus le système ;
- un vol ne **franchit plus** de palier en chemin. Il en traverse, mais il pose lui-même son
  palier d'arrivée. Un franchissement parasite au palier univers remettait `systemId` à zéro,
  et la carte atterrissait au palier système sans système — deux fois sur trois.

Le second ne se voyait qu'à l'exécution du fichier entier, jamais en isolant le test : c'est
l'enchaînement double-clic puis « Ma capitale » qui le déclenchait.

**Corriger le premier a divisé par trois la durée du fichier** — 5,7 min à 1,8 min. Le dolly
qui combattait le vol coûtait, en temps de test, plus cher que tout le reste du chantier.

### Ce que ce chantier a appris sur les bibliothèques

Trois candidates étaient déjà dans l'arbre, en transitives de drei. Deux ont été écartées après
lecture de leur source, pas par principe :

- **`maath/easing`** — `damp` est un ressort à **vitesse retenue**. Les deux grandeurs lissées
  ici sont déplacées à chaque image par d'autres mécanismes (vol, franchissement, suivi
  d'orbite) : il lirait ces déplacements comme un mouvement qu'il a produit. Il fallait un
  filtre, pas un ressort.
- **`camera-controls`** — remplacerait `OrbitControls`, le dolly, `CameraJump` et `FitCamera`,
  mais son pas de dolly est un scalaire, sans équivalent au calibrage par bande.
- **`@use-gesture/react`** — retenue. Elle ramène la molette en pixels quel que soit son
  `deltaMode` : Firefox compte en **lignes**, la valeur brute y vaut trois au lieu de cent, et
  notre `wheelWeight` la lisait comme un micro-défilement de pavé tactile — six fois trop lent,
  sans que rien ne le dise.

### Relevés

| | avant chantier 38 | après |
|---|---|---|
| img/s univers · galaxie · système | 61 · 39 · 53 | 60 · **31** · 59 |
| img/s en transition univers→galaxie | non mesuré | 29 à z = 0,59 |
| crans pour descendre d'un palier | 9 | 9 |
| `map-zoom.spec.ts`, fichier entier | 5,7 min | 1,8 min |
| tests de `map-zoom.spec.ts` | 13 | 16 |
| suite e2e complète | — | 31 passés, 3,1 min |
| compteurs sur la section hôte | 4 (`fits`, `keys`, `tier`/`depth`, `labels`) | 4 (`fits`, `tier`/`depth`, `labels`, `aim`) |

Le palier **galaxie** perd huit images par seconde, et c'était prévu : on l'atteint par une
descente, qui sélectionne désormais, donc la mesure se fait avec un `<Html>` de drei à
l'écran — il repositionne son nœud DOM à chaque image. Le seuil du test est à 20 : la marge
tient, et le levier, si elle cède un jour, est le rythme de mise à jour de l'infobox, pas la
conception. Le palier système, lui, gagne six images — le recentrage ne tourne plus en
rafales et le dolly ne combat plus les vols. Relevés sur pilote OpenGL logiciel, **conteneur
`app` arrêté**, et à prendre pour ce qu'ils sont : un échantillon par palier, sur une mesure
dont le chantier 36 a montré la variance.

## Chantier 39 — Le cœur des galaxies (03/09/2026)

Le jeu connaissait les trous noirs, mais seulement comme **classe d'étoile d'un système**
(chantier 35.10). Une galaxie, elle, n'avait rien en son centre — le palier galaxie montrait un
champ de nœuds, un graphe d'arêtes et une grille, et son origine était vide.

Or depuis le chantier 37 cette origine a un sens précis : les systèmes ne sont plus tirés dans
un pavé, ils sont **posés autour du centre**, et les morphologies non barrées laissent un vide
de ~8 % du rayon au milieu. Ce vide est le bulbe, et il manquait son occupant.

### La taille suit le NOMBRE de systèmes, pas le rayon du disque

La relation M–σ lie la masse d'un trou noir central à celle de son bulbe, donc au nombre
d'étoiles ; le rayon de Schwarzschild suit la masse. Le disque de la galaxie, lui, suit `√n`
(`GALAXY_RADIUS_PER_ROOT_SYSTEM`). Le cœur occupe donc une part **croissante** de sa galaxie
quand celle-ci grossit — et c'est le point. Calé sur le rayon, il aurait rendu la même image
partout : la dépendance demandée ne se serait vue nulle part, une galaxie n'étant jamais vue à
côté d'une autre à ce palier.

| systèmes | rayon de galaxie | vide central (0,08·R) | disque du cœur | horizon |
|---|---|---|---|---|
| 300 | 1680 | 134 | 75 | 12,8 |
| 400 | 1940 | 155 | 100 | 17,0 |
| 520 | 2212 | 177 | 130 | 22,1 |

Le disque reste **sous le vide central** sur toute la plage : c'est ce qui l'empêche de cesser
d'être un bulbe pour devenir une nappe posée sur les systèmes internes. Verrou :
`stars.test.ts`, qui alertera si la plage de tailles d'une galaxie change.

### Rien de persisté, aucun ADR

Le cœur est **dérivé du seul `systemCountOf`**, sur le patron de `starClassOf`
([ADR 0016](adr/0016-classes-d-etoiles-derivees.md)) : pas de bump de `GENERATOR_VERSION`, pas
de fixture à régénérer, pas de colonne. Ce chantier applique la décision, il n'en prend pas de
nouvelle.

Corollaire : `systemCount` traverse déjà le brouillard (`digestGalaxy`), donc une galaxie hors
de portée montre son cœur pendant que ses systèmes restent redactés.

### Ce que le mécanisme existant a donné gratuitement

`selection`, `pickFromList` et `openSelection` consultaient déjà la liste des `features`
**sans regarder le palier** — seuls `features` lui-même, `labelItems` et `entries` y étaient
verrouillés. Faire entrer le cœur par cette liste lui a donc donné l'infobox, le vol de caméra
et l'ouverture de fiche sans une ligne, là où un septième type de cible aurait demandé six
points de branchement. Il se comporte à tout point comme un comptoir ou une ceinture : nommé,
sélectionnable, listé au clavier, **sans ancre URL** — aucun `feature` n'en a jamais eu.

Nommé « <Galaxie> A* », d'après Sagittarius A*.

### Deux corrections tombées en chemin

- `BlackHole` portait une `<pointLight>` en dur. Au palier galaxie elle n'éclaire rien — les
  nœuds sont en `meshBasicMaterial` — et occuperait un emplacement pour rien. Devenue `light`.
- Le disque d'accrétion et le liseré de la sphère de photons **captaient le clic**. Ils sont
  transparents et `depthWrite={false}` : on voit au travers, et ce qu'on voit doit rester
  cliquable. Seul l'horizon, opaque, est désormais une cible.

### Relevés

Mesurés sur `map3d.spec.ts`, quatre passes alternées sur la même machine — le palier galaxie
est le seul chargé par ce chantier.

| img/s palier galaxie | sans le cœur | avec |
|---|---|---|
| passes | 35 · 33 | 28 · 30 · 33 |

**Le 39 relevé au chantier 37 est périmé** : la référence d'aujourd'hui est ~34, le chantier 38
ayant retouché la caméra sans re-relever. Le cœur coûte donc ~3 img/s, soit une dizaine de
pour cent, et les distributions se recouvrent (33 des deux côtés). Le coût vient du shader
d'accrétion — deux octaves de bruit procédural sur 1 536 triangles, à chaque image, sous rendu
logiciel. Assumé : c'est un objet, pas une décoration de fond, et le seuil du test (20) reste
loin.

## Chantier 40 — Deux modes de caméra, et une sélection fiable (03/09/2026)

Trois gênes relevées à l'usage après le chantier 38, et une dette de lint. Les décisions
structurantes sont dans l'ADR [0020](adr/0020-deux-modes-de-camera.md), qui **renverse deux
points** de l'ADR 0019 : l'élection au curseur et le recentrage automatique.

- **40.1** Le lint passe, pour la première fois.
- **40.2** Le monde est Z-haut, la caméra aussi : `camera.up = (0,0,1)`.
- **40.3** `orbitAround`, `zoomAbout`, `worldPerPixel` — la rotation à pivot décentré,
  l'homothétie de zoom et la conversion pixels → scène, pures et testées comme le reste de
  `tiers.ts`.
- **40.4** Deux modes : libre (zoom et rotation autour du centre du palier), ciblé (tout
  autour de la sélection).
- **40.5** Le clic est exact d'abord, tolérant ensuite — dix-huit pixels.
- **40.6** Quatre équerres en sprite, un seul repère pour tous les objets.

Et trois correctifs venus **après** que ce bilan a été écrit — le commit de bilan et d'ADR
(`b95697c`) les précède, ce qui est devenu le motif récurrent du dépôt (déjà 35.11 puis 35.12) :

- **40.8** L'aperçu 3D tourne autour de la verticale du monde. `ModelPreview` calculait déjà
  son cadrage en Z-haut mais ne posait jamais `camera.up` : son `autoRotate` roulait le
  vaisseau au lieu de le faire pivoter. Même incohérence que 40.2, restée sur le jumeau de la
  carte — invisible parce que le cadrage initial est identique dans les deux conventions.
- **40.9** La mesure d'images cesse de rougir au hasard : `framesPerSecond` prend trois
  fenêtres et garde la **meilleure**, le seuil restant à 20. Ce n'est pas un adoucissement —
  une régression coûte ses images dans les trois fenêtres, une seconde volée par un autre
  processus n'en coûte que dans une. Le test des étiquettes change de palier au passage : il
  mesurait dans un système de quatre objets nommables, c'est-à-dire contre un **plafond** que
  `data-map-labels` atteint dès le cadrage, et selon la seed il ne prouvait rien.
- **40.10** Une galaxie se clique sous tous les angles. Son volume de clic était un
  `circleGeometry` posé dans le plan galactique : vu par la tranche, un trait. Régression
  **causée** par la rotation libre de 40.4 et **masquée** par le clic tolérant de 40.5, qui
  rattrapait à dix-huit pixels près pendant que le chemin exact restait cassé. Une sphère du
  même rayon présente le même cercle sous tous les angles, sans coût par image.

### Pourquoi ça roulait

Le monde de la carte est Z-haut de bout en bout — plan galactique XY, épaisseur `MAP_DEPTH` en
Z, orbites en `cos → x, sin → y`, `gridHelper` portés à π/2 pour compenser le Y-haut natif de
three.js. Mais `camera.up` valait le défaut, `(0,1,0)`, **nulle part surchargé**. Un glisser
horizontal faisait tourner l'azimut autour de Y : la composante Z passait de `+0,8·d` à
`−0,8·d`, la caméra plongeait sous le disque.

Ce défaut a vécu quatre chantiers de carte 3D sans être vu, parce que le cadrage initial le
masquait : la direction de vue est dans le plan YZ, qui contient Y comme Z, si bien que le
calcul de cadrage donne le même repère dans les deux conventions. Il ne se voyait qu'en
tournant.

### Ce que la navigation gagne, et ce qu'elle coûte

La carte ne désigne plus rien à la place du joueur. En contrepartie, **descendre d'un palier
demande de viser** : sans sélection, le zoom roule dans le palier courant et se borne à sa
frontière. Quatre tests de bout en bout qui descendaient à la molette depuis le centre du canvas
ont gagné un clic — c'est la mesure exacte de ce que le changement coûte.

Et tout devient sélectionnable : le pool du clic tolérant contient tout ce qui est à l'écran au
palier courant, y compris ce qui n'a **aucune géométrie cliquable** — comptoir, stations,
avant-postes, flottes, ceintures, sites. Ils n'étaient atteignables que par leur étiquette ou
par la liste DOM.

### Ce que ce chantier apprend sur le lint

`pnpm lint` échouait depuis longtemps, et **pas pour une raison de code**. `biome.json` n'active
que le groupe `a11y` : `correctness` est éteint, donc `useExhaustiveDependencies` ne tourne
jamais et trois `biome-ignore` étaient morts par construction. La seule vraie erreur était
ailleurs — dans `MapLabels`, la directive était suivie de deux lignes de commentaire, si bien
qu'elle ne s'attachait pas au `<sprite>` qu'elle devait couvrir. Biome n'attache une suppression
qu'à la ligne qui la suit immédiatement ; les six suppressions jumelles du dépôt fonctionnaient
parce que leur élément était collé au commentaire.

### Ce que ce chantier apprend sur la vérification

**Un roulis ne laisse aucune trace dans le DOM**, et l'image d'arrivée est la même qu'avec un
lacet — seul le chemin diffère. D'où `data-map-elevation`, l'angle de la vue au-dessus du plan
galactique, cinquième témoin posé sur la section hôte. Le test qui compte s'énonce en une
phrase : *un glisser horizontal ne doit pas le changer, un glisser vertical doit le changer.*

Et la même proposition se vérifie **sans WebGL**, parce que la rotation est une fonction pure :
`orbitAround` conserve l'élévation sous un lacet quelconque. Le test unitaire énonce la décision
elle-même.

**Une tolérance de clic rétrécit la surface qu'on peut appeler « le vide »**, et cela a mordu
deux fois. Le premier test de picking cliquait « loin » par un simple décalage de 260 px : il
passait seul et échouait dans la suite complète, où l'univers compte plus de galaxies et où le
point tombait à moins de dix-huit pixels de l'une d'elles. Et le test de l'étiquette définissait
« quitter le corps » par « plus aucune infobox » : entre un corps et son nom, on tombe désormais
sur une lune. Il suit maintenant le NOM affiché, ce qui énonce d'ailleurs mieux son intention —
le nom du corps REVIENT après qu'on l'a quitté, et cela ne peut être que l'étiquette.

**Un sprite met sa texture à l'échelle, donc son trait aussi.** Le cadre de sélection était
d'abord un sprite unique portant les quatre équerres : à pleine taille, son trait de 7 pixels de
texture en faisait une quinzaine à l'écran. Il faut **quatre** sprites, une équerre chacun, de
taille écran constante : seul leur écartement suit l'objet.

### Relevés

| | chantier 38 | chantier 40 |
|---|---|---|
| img/s univers · galaxie · système | 60 · 31 · 59 | 58-61 · **27-39** · 55-60 |
| img/s en transition univers→galaxie | 29 à z = 0,59 | **56-59** à z = 0,62-0,68 |
| crans pour descendre d'un palier | 9 | 9 |
| suite e2e complète | 31 passés, 3,1 min | 33 passés, 3,5 min |
| tests de `map-zoom.spec.ts` | 16 | 18 |
| `pnpm lint` | 1 erreur, 4 avertissements | **passe** |
| témoins sur la section hôte | `fits`, `tier`/`depth`, `labels`, `aim` | + `elevation` |

Un seul chiffre est vraiment attribuable : la **transition**, qui double. Elle était mesurée au
chantier 38 avec une infobox ouverte — le premier cran de molette élisait, donc sélectionnait,
donc posait un `<Html>` de drei qui repositionne son nœud DOM à chaque image. L'élection
supprimée, la mesure retrouve ses conditions d'avant.

Le reste est **dans le bruit**, et il faut le dire : les trois relevés de ce chantier ont été
pris **conteneur `app` en marche**, ce que le chantier 36 avait pourtant identifié comme faussant
la mesure de moitié — il dispute le processeur au pilote OpenGL logiciel. Le palier galaxie a
donné 27, 39 et un 19 qui a fait échouer le seuil de 20 une fois sur trois. Ce n'est pas une
régression du chantier : la même configuration rejouée immédiatement rendait 32 tests verts. Mais
c'est un rappel que le relevé ne vaut que si l'on éteint ce qui tourne à côté.

*Corrigé depuis, en 40.9 : ce n'est plus une fatalité du relevé mais un défaut de la mesure.
`framesPerSecond` prenait une seule fenêtre d'une seconde. Il en prend trois et garde la
meilleure, ce qui laisse le seuil à 20 tout en cessant de compter les secondes volées par un
autre processus. Relevé après coup, conteneur `app` arrêté : univers 61, galaxie 28-33,
système 55-60 — le palier galaxie est réellement le plus chargé, ce n'était pas seulement de la
contention.*

## Chantier 41 — Une seule liste de sélectionnables (04/09/2026)

Pas de gêne rapportée cette fois, et aucune ADR : ce chantier ne décide rien, il solde une dette
que le chantier 40 avait aggravée. `MapScene` portait **quatre listes parallèles** décrivant le
même ensemble — `features` pour ce qu'un système contient en plus de ses corps, `labelItems`
pour les noms posés dans la scène, `selectables` pour le pool du clic tolérant, `entries` pour
la liste DOM. Le chantier 40 en avait ajouté une au lieu d'en retirer trois.

### Elles avaient déjà divergé, et rien ne le signalait

Le **cœur galactique** du chantier 39 était nommé mais absent du pool de clic ; une **ceinture**
était cliquable mais nommée par un autre chemin. Aucun test ne pouvait attraper ça : chaque
liste est correcte prise seule, c'est leur désaccord qui est le défaut. Et chaque nouvel objet
de la carte demandait de penser à quatre endroits — le prix se payait à chaque chantier suivant,
pas à celui-ci.

Une seule interface `Selectable` désormais (`MapScene.tsx:127`) : identité, nom, détail,
position vive (`at()` — un corps orbite), emprise rendue, emprise d'étiquette, cible d'infobox,
fiche à ouvrir, et si l'on peut descendre dedans. Les quatre usages en dérivent.

Deux détails que la fusion a dû préserver, et qui expliquent pourquoi l'interface a neuf champs
plutôt que cinq :

- l'emprise d'**étiquette** reste distincte de l'emprise **rendue**, parce qu'un nœud de système
  garde une taille d'écran plancher et que son nom doit suivre ce qu'on VOIT ;
- la cible d'infobox est une **fonction**, parce qu'au palier galaxie il y a jusqu'à cinq cents
  candidats pour une seule boîte affichée — les construire toutes serait payer cinq cents fois
  ce qu'on montre une fois.

### La prémisse du plan était fausse sur un point

`selection` n'était **pas** un sous-ensemble des autres listes. Elle décrit aussi l'objet du
palier où l'on EST : entrer dans un système le laisse sélectionné alors qu'il ne figure plus
parmi les objets à l'écran, et l'infobox doit continuer de le décrire. Ce n'est donc pas une
cinquième liste mais une recherche avec un repli, et le repli est commenté comme tel.

`pickFromList` perd son branchement par palier — un booléen `descendable` dit si le double-clic
descend ou se contente de voler. Et `resetCornerTexture`, export sans aucun appelant laissé par
le chantier 40, disparaît : personne ne l'aurait vu, aucun outil du dépôt ne détecte un export
mort (`biome.json` n'active que le groupe `a11y`).

### Vérification

**Aucun test n'a été réécrit** — c'était le critère : une consolidation qui change un
comportement n'est pas une consolidation. 206 tests unitaires et 33 de bout en bout au vert du
premier coup.

*Démenti au chantier 43 : les 33 de bout en bout n'étaient pas au vert. « cliquer le nom d'un
objet le sélectionne » échouait déjà, et échouait aussi au chantier 40.10 — le chantier 41 n'en
est donc pas la cause, mais il ne l'a pas vu non plus. La suite n'avait pas été rejouée.*

## Chantier 42 — Pincement tactile (tenté, abandonné, 04/09/2026)

À consigner parce que rien d'autre ne le consigne. Huit minutes après le commit du chantier 41,
un test `map3d.spec.ts` nommé « au doigt, le pincement zoome la carte (chantier 42) » a été
écrit, exécuté et a **échoué** ; ni le test ni le code correspondant n'ont été committés. La
seule trace était une trace Playwright de 7,8 Mo dans `apps/web/test-results/` (répertoire
gitignoré) et un `.last-run.json` en `"status": "failed"` — l'exécution e2e suivante l'a
écrasée, d'où cette section.

Rien n'est perdu — il n'y avait rien à perdre — mais la carte n'a **aucun** support tactile, et
c'est désormais écrit quelque part. À rouvrir ou à enterrer explicitement : le `useGesture` de
`TierCamera.tsx:252` ne câble aujourd'hui que `onWheel` et `onDrag`, et la bibliothèque
retenue au chantier 38 pour la molette expose `onPinch` au même endroit.

## Chantier 43 — Deux défauts que rien ne signalait (04/09/2026)

Ouvert comme un tour d'horizon — « il y a a priori des choses à revoir, des régressions et
des travaux en attente » — et c'est le tour lui-même qui a trouvé les deux défauts. Aucun
n'était visible dans le code : le dépôt n'a **aucun** `TODO`, aucun test désactivé, aucun
`@ts-ignore`, et cinq `any` tous justifiés en commentaire. Ils étaient dans ce que personne
ne regardait.

Aucune ADR : ce chantier ne décide rien, il répare. Sur le patron du chantier 39.

- **43.1** `corpRelations` et `standings` rejoignent le registre de clés du `Persister`, qui
  déménage dans `persistence/tables.ts` ; `WriteSet` type ses noms de table dessus.
- **43.2** Le plancher de dolly s'exprime depuis le cadrage de l'enfant, plus en largeurs de
  bande. « Ma capitale » atteint de nouveau le palier système.
- **43.3** Traçabilité soldée : bilans des chantiers 41 et 42, `architecture.md` remis
  d'aplomb sur quatre points, sous-points du chantier 40 renumérotés.
- **43.4** Le groupe `correctness` de biome s'allume, moins la seule règle qui portait la
  dette. Onze imports morts, un helper de test défini deux fois, et toute une chaîne de
  calculs devenue inutile s'en vont avec.
- **43.5** Les mesures serveur que le chantier 37 avait périmées sont rejouées. Le bench de
  rattrapage mesurait un serveur qui n'existe pas ; `MAX_GALAXIES`, lui, tient.
- **43.6** `nearestTradingPost` est mémoïsé. Le pilote économique PNJ pesait 99,7 % du coût
  d'un tick ; le rattrapage de vingt-quatre heures au boot passe de dix minutes à quatre
  secondes.
- **43.7** `packages/ui` gagne une pile de test et dix-huit tests sur ses trois composants
  porteurs de logique. Il n'avait pas de script `test` : il était sauté sans bruit.
- **43.8** `MapScene.tsx` passe de 1624 à 1165 lignes : l'arithmétique d'ancrage devient
  `anchors.ts`, les pièces de scène sans rendu deviennent `SceneRig.tsx`.

### Deux tables muettes bloquaient TOUTE la persistance

`corpRelations` et `standings` (chantier 32.19) étaient écrites par `CorporationRepository`
via le `WriteSet` sans figurer dans `PRIMARY_KEYS`. Le coût n'était pas local à ces deux
tables, et c'est tout le sujet : `tableFor` lève, la transaction **entière** fait rollback,
et `runFlush` remet en attente tout le lot qu'il vient de drainer — y compris l'entrée qui
lève. Le flush suivant rejoue le même lot et échoue pareil.

À partir de la première relation entre corporations, **plus rien n'atteignait Postgres** :
ni une colonie, ni un tick, ni un empire. La RAM faisant autorité ([ADR
0003](adr/0003-persistance-write-behind.md)), le jeu tournait juste et l'écran ne mentait
pas. Sur un serveur dont l'invariant est de ne jamais se réinitialiser, la perte ne se
serait vue qu'au redémarrage suivant.

Le correctif du jour tient en deux lignes ; le verrou est ailleurs. `WriteSet.upsert`
acceptait `table: string`, si bien que rien ne reliait les repositories au registre. Il
prend maintenant `PersistedTable`, c'est-à-dire les clés du registre : une table écrite
sans être enregistrée **ne compile plus**.

### « Ma capitale » atteignait le palier système, puis en était renvoyé

Le vol publiait son palier d'arrivée puis retombait à la galaxie à l'image suivante, caméra
immobile. `controls.minDistance` valait quatre **largeurs de bande** sous la frontière — et
une bande n'a pas de largeur fixe. Depuis le chantier 37 le cadrage d'une galaxie suit `√n`
sur 300 à 520 systèmes, la bande univers→galaxie s'est élargie devant la bande
galaxie→système, et un saut qui traverse **deux** bandes en demande désormais 4,08.

`OrbitControls.update()` clampait le vol à `1147,5 × 0,1175⁴ = 0,21875` quand il visait
`0,1756`. Deux pour cent trop court, juste **au-dessus** de la frontière, et
`ascending = distance > parentFrame * 1.02` y voyait une caméra sortie de son palier.

Le plancher se rapporte maintenant au cadrage de l'**enfant**, donc ne dépend plus du
rapport entre deux paliers. C'est le symétrique de `maxDistance`, déjà à `parentFrame * 1e4`
dès qu'un palier existe au-dessus : dès qu'un voisin existe, la borne cesse de décider et
c'est le franchissement qui fait la limite.

### Ce que ce chantier apprend sur la vérification

**Un test qui attend un état transitoire n'en prouve pas la tenue.** Tous les tests visant
la capitale s'arrêtaient à `.poll(...).toBe("system")` — une assertion que satisfait **une
seule fenêtre de mesure**, y compris quand la carte retombe aussitôt et n'en repart plus.
Le palier était atteint pendant environ quatre cents millisecondes. Le nouveau test regarde
donc APRÈS que tout s'est posé, et vérifie la profondeur en plus du palier : `tierAt` lit la
partie entière, un palier système tenu vaut au moins 2.

Corollaire : `map-zoom.spec.ts:261` échouait **trois fois sur trois** depuis ce défaut, et
échouait déjà au chantier 40.10. Il balayait autour d'un corps qu'il n'avait jamais atteint.
Le chantier 41 annonçait « 33 de bout en bout au vert » ; il ne l'était pas. Personne
n'avait rejoué la suite depuis.

**Les logs du serveur ne sont assertés par personne.** `[persister] flush échoué` était
imprimé à chaque exécution e2e, sous les yeux, pendant que la suite passait au vert. Aucun
test unitaire ne pouvait l'attraper : ils vérifient tous le snapshot en mémoire, jamais la
base. C'est la leçon du chantier 35 sous une autre forme — ce qui n'est pas observé n'existe
pas pour la vérification — mais déplacée d'un cran : ici l'information était produite, et
c'est de la LIRE que personne ne s'était chargé.

**Une constante exprimée dans la mauvaise unité vieillit sans prévenir.** `OVERSHOOT` était
en largeurs de bande. Le chantier 37 a changé la largeur des bandes, et la constante est
devenue deux pour cent trop courte sans qu'une seule ligne bouge autour d'elle. Ni test, ni
lint, ni relecture ne pouvaient le signaler : ce qui avait changé était à trois fichiers de
là.

### Ce que ce chantier apprend sur le lint

L'ADR 0020 avait écarté le groupe `correctness` comme « un chantier sur tout le dépôt », et
`CLAUDE.md` promet un durcissement « zone par zone assainie ». La mesure a démenti le
découpage : sur **31 diagnostics, les 31 étaient la même règle**,
`useExhaustiveDependencies`, sur sept fichiers. Les trente et quelques autres règles du
groupe passaient déjà sans une correction. Le bon axe de découpe était donc la **règle**, pas
la zone — et on ne pouvait le savoir qu'en allumant pour voir.

Trois de ces règles ne sont **pas dans le jeu recommandé** et sont précisément celles qui
manquaient : `noUnusedVariables`, `noUnusedImports`, `noUnusedPrivateClassMembers`. Sans
elles, rien dans ce dépôt ne détectait un symbole mort. Vérifié en posant une violation
exprès plutôt qu'en faisant confiance à la configuration : `noUnreachable` mordait,
`noUnusedVariables` non — c'est ce test qui a montré qu'il fallait les nommer une par une.

Ce que le filet a trouvé du premier coup tient en une phrase : **du code mort qu'aucune
relecture n'aurait vu, parce qu'il est réparti**. Onze imports orphelins dans six fichiers.
`unlockTech` défini deux fois dans `station-service.test.ts`, une fois par bloc `describe` —
la copie du chantier 24 est morte depuis que celle du chantier 25 existe, et les deux sont
identiques au caractère près. Et la chaîne `openPath → openSystem → openBody` de `MapPage`,
vestige de l'époque où la fiche résolvait son objet elle-même : trois calculs qui s'évaporent
**en cascade** dès qu'on retire le dernier, chacun ne devenant visible qu'après la mort du
précédent. C'est la forme que prend le code mort dans un dépôt tenu : jamais un bloc, toujours
un fil.

Ce qui reste éteint, et pourquoi : `useExhaustiveDependencies`. Ses 31 diagnostics ne sont pas
tous des défauts — la moitié sont l'idiome « je dépends de `home.height`, pas de `home` »,
délibéré et porteur, qui évite de réallouer des tampons GPU à chaque tick. Les corriger
demande un jugement par site dans une boucle de rendu 3D, où un tableau de dépendances repris
de travers se voit à l'écran et pas dans un test. C'est son propre chantier. En attendant, les
quatre `eslint-disable react-hooks/exhaustive-deps` du dépôt restent **inertes** — il n'y a
pas d'ESLint ici, et la règle biome équivalente ne tourne pas. Ils documentent une intention,
ils ne garantissent rien, et il vaut mieux l'écrire que de les laisser rassurer.

### `advanceTicks(n)` n'avançait pas n ticks

Trouvé ici, corrigé au chantier 44 — la section reste, parce que la façon dont le défaut s'est
présenté vaut d'être gardée.

`objective-service.test.ts` a échoué deux fois pendant ce chantier — « expected 252,55 to be
greater than or equal to 452,45 » — puis a passé cinq fois isolé et une fois en suite
complète. Un test qui échoue une fois sur trois ne prouve rien, et celui-ci prouvait quelque
chose de faux : que le harnais avance un nombre de ticks connu.

Il ne l'avançait pas, et cela se lisait dans la source plutôt que dans les échecs.
`advanceTicks(engine, n)` appelle `devFastForward(n * 5)`, qui reculait `lastTickAt` du delta
demandé puis rejouait :

```
const missed = Math.floor((Date.now() - this.clock.lastTickAt) / TICK_MS);
```

Le nombre rejoué valait donc `n` **plus le temps réel écoulé depuis le tick précédent**, par
tranches de cinq secondes. Sous la contention des workers, un test lent gagnait des ticks
qu'il n'avait pas demandés — et chaque tick de plus consomme de l'entretien de colonie, d'où
des crédits qui manquent à l'arrivée.

Deux constats qui valent pour la suite : la seed d'univers est tirée au hasard à chaque
`bootstrapNewUniverse()` (`randomUUID().slice(0, 8)`), donc chaque test tourne sur un monde
différent ; et un test dont l'assertion dépend de l'économie d'une colonie hérite de cette
variabilité sans le dire. Le chantier 44 n'a corrigé que la première moitié.

### Découper un god file quand le modèle vient d'être unifié

`MapScene.tsx` faisait 1624 lignes — le profil de `game.ts` avant le chantier 19, qui en
faisait 1453. La fenêtre était propre pour une autre raison que la taille : le chantier 41
venait de fondre quatre listes parallèles en une seule `Selectable`, donc le modèle à
extraire existait enfin sous une forme unique.

Deux coutures, et aucune des deux n'est thématique :

- **`anchors.ts`** — l'arithmétique d'ancrage : où se trouve chaque palier, ce que la caméra
  vise, ce que le joueur peut désigner. Ce qui la définit est qu'elle est **pure** : ni
  React, ni three.js, ni état. C'est ce qui la rend vérifiable sans WebGL, comme `tiers.ts`
  et `bounds.ts` avant elle. Le dépôt le savait déjà sans l'avoir dit :
  `MapScene.test.ts` importait `pathFor` et `slotIdFor` depuis le composant, ce qui signale
  une couture sans la trancher. Le fichier de test devient `anchors.test.ts` et son import
  cesse de traverser un composant pour atteindre des fonctions pures.
- **`SceneRig.tsx`** — les pièces de scène **sans rendu visible** : le groupe qui suit un
  corps en orbite, l'éclairage qui suit la profondeur, le vol de caméra, la publication de
  la profondeur dans l'URL. Ce qui les réunit n'est pas un thème mais une place — chacune
  écrit sur la caméra, sur une lumière ou sur l'URL depuis la boucle d'images, jamais dans
  l'arbre. Les garder dans le composant qui les monte mélangeait deux niveaux de lecture.

**Le filet posé au 43.4 a payé dans l'heure.** L'extraction laisse derrière elle des imports
que plus rien n'utilise, et `noUnusedImports` en a signalé huit du premier coup — dont un que
mon propre comptage avait cru utilisé, `place`, parce que le mot apparaît aussi en français
dans les commentaires du fichier. Un décompte à la main se trompe là où le compilateur ne se
trompe pas ; c'est exactement pour ce genre de tâche que la règle valait d'être allumée.

Ce que ce découpage ne fait pas : réduire `MapScene` à une taille confortable. Il reste
1165 lignes, et le composant lui-même — état de sélection, visée, franchissement, listes
dérivées — n'a pas de couture évidente. Le déclarer découpé serait faux ; ce qui a été sorti
est ce qui pouvait l'être sans inventer une frontière.

### Un paquet sans script `test` ne manque à personne

`packages/ui` avait dix-neuf composants et zéro test. Le fait marquant n'est pas l'absence
elle-même mais **ce qui la rendait invisible** : le paquet n'avait pas de script `test`, donc
`pnpm -r test` le sautait sans un mot. Un fichier de test qui échoue se voit ; un paquet
entier qui n'est jamais appelé ne se voit pas. C'est la même famille que le
`[persister] flush échoué` de 43.1 et que les `901 tick(s) en 37020,8ms` de 43.6 — un dépôt
peut être discipliné sur ce qu'il regarde et complètement aveugle sur ce qu'il ne regarde pas.

Les trois composants couverts sont ceux qui portent de la logique, et ce ne sont pas les
mêmes que ceux qui portent du style : `Modal`, `Popover`, `ZoomableSvg`. Ce sont aussi les
trois seuls porteurs de suppressions `biome-ignore` a11y, et ce n'est pas une coïncidence —
chacune justifie de ne PAS prendre l'élément natif. Le prix de ce choix est que le piège à
focus, Échap, la restauration du focus et le pilotage clavier sont écrits à la main. Depuis
le chantier 27.21, et jamais vérifiés.

Deux points que l'écriture des tests a appris :

- **La restauration du focus ne se teste pas dans le sens naïf.** `Modal` lit
  `document.activeElement` une fois, dans son effet de montage. Un test qui ouvre le
  dialogue puis focalise le déclencheur vérifie la restauration vers `body` et passe pour
  de mauvaises raisons. Il faut un harnais qui focalise AVANT l'ouverture, c'est-à-dire qui
  reproduit le geste réel.
- **`Modal.Header` prend une prop `title` et ignore ses enfants.** Le composant a raison,
  c'est le premier test qui avait tort — mais rien dans le dépôt ne l'aurait dit, et un
  appelant qui se trompe obtient un dialogue sans nom accessible, silencieusement.

Ce qui reste hors couverture, et pourquoi : les gestes souris de `ZoomableSvg`. jsdom ne
fournit aucune géométrie, `getBoundingClientRect` rend des zéros, et le composant refuse
alors de deviner un point du monde — comportement correct qui rend le geste intestable hors
navigateur. C'est la frontière naturelle entre ces tests et la suite Playwright.

### Le bench de rattrapage mesurait un serveur qui n'existe pas

Le chantier 27.6 avait posé un bench sur le seul risque de boot identifié : `catchUp()`,
boucle **synchrone** qui rejoue jusqu'à `MAX_CATCHUP_TICKS` ticks avant que le serveur
n'écoute. Il n'avait pas été rejoué depuis le chantier 37, qui a multiplié les systèmes
par trente-six. Rejoué tel quel : **2,9 s** pour 24 h simulées. Rassurant, et sans rapport
avec quoi que ce soit.

Le bench partait d'un `loadOrBootstrap()` nu — un empire, aucun PNJ, aucune économie qui
tourne. Or `apps/server/src/index.ts` appelle `ensureNpcPopulation()` à chaque démarrage, et
sur un serveur qui tourne depuis un moment les PNJ sont en base bien avant le rattrapage. La
configuration mesurée n'était celle d'aucun serveur.

Même montage, PNJ compris, cinq passes :

| | 17 280 ticks (24 h simulées) | par tick |
|---|---|---|
| univers nu | 2 856 ms | 0,17 ms |
| population PNJ, comme au boot | 591, 598, 603, 608, 745 s | **~34 ms** |

Un facteur **deux cent dix**. Et les 34 ms recoupent les 41 ms/tick que
`market-service.test.ts` imprimait déjà à chaque exécution, sans que personne en tire la
conséquence — même motif que le `[persister] flush échoué` de 43.1 : l'information était
produite, personne ne la lisait.

**Ce que ça disait.** Un redémarrage après vingt-quatre heures d'arrêt bloquait le boot une
dizaine de minutes, `catchUp()` étant appelé depuis `boot.ts` avant `buildApp` et ne cédant
jamais la main. `MAX_CATCHUP_TICKS` borne le rattrapage en **nombre de ticks** — une unité
qui était juste quand un tick coûtait une fraction de milliseconde. C'est exactement le
défaut d'unité de l'`OVERSHOOT` du 43.2, à un autre étage.

Trois sorties se présentaient, et deux d'entre elles étaient des décisions de jeu déguisées
en correctifs : borner le rattrapage en TEMPS revient à décider qu'au-delà d'un seuil le
temps hors-ligne d'un joueur cesse de produire ; servir pendant le rattrapage revient à
décider qu'il peut agir sur un monde en retard sur lui-même. La troisième — s'attaquer au
coût du tick — ne coûte rien au joueur. C'est celle qui a été prise, et elle a dissous la
question : le rattrapage tombe à **quatre secondes**, il n'y a plus d'arbitrage à rendre.

### Un seul appel pesait 99,7 % du tick

Profilé phase par phase sur une heure simulée, sonde temporaire dans `TickRunner.runOne` :

| phase | avant | après |
|---|---|---|
| `market.npcTick` | **70 522 ms (99,7 %)** | 464 ms |
| `market.economyTick` | 59 ms | 68 ms |
| `exploration.ensureFrontier` | 42 ms | 48 ms |
| tout le reste réuni | ~99 ms | ~106 ms |
| **720 ticks** | **70 722 ms** | **686 ms** |

Tout était dans `nearestTradingPost`. Il lance un plus-court-chemin **par comptoir** de la
galaxie, sur un graphe reconstruit à chaque appel — et `this.portalLinks` étant un GETTER,
il se recalculait lui aussi à chaque tour de boucle. Une galaxie comptait sept à quatorze
systèmes avant le chantier 37 ; elle en compte trois à cinq cents. Le code n'a pas changé :
son entrée a été multipliée par trente-six et rien ne l'a signalé.

C'est le troisième défaut de ce chantier dont le signal était **imprimé sans être lu** :
`market-service.test.ts` affichait « 901 tick(s) en 37020,8ms » à chaque exécution.

La réponse ne dépend que de la topologie — systèmes, arêtes, position des comptoirs,
liaisons de portail actives — et rien de tout cela ne bouge d'un tick à l'autre. Elle est
donc mémoïsée, avec une clé qui **contient** ces trois choses plutôt que de dépendre d'un
point d'invalidation qu'on oublierait : une galaxie neuve change le compte de galaxies et
celui des comptoirs, un portail qui s'ouvre change la signature des liaisons. Un cache
qu'on invalide à la main est un cache qu'on invalide mal ; le pire qu'un défaut de clé
puisse produire ici est un recalcul.

Verrou : un budget de temps dans `market-service.test.ts`, neuf cents ticks et trois PNJ
sous trente secondes. C'est un **plancher d'implémentation** et non une mesure de la
machine — même esprit que le budget d'images de `map3d.spec.ts`, et il ne doit jamais être
relevé pour faire passer un test. Mesuré à 0,7 s, il laisse quarante fois la marge et
attrape quand même un retour à l'état d'avant.

### `MAX_GALAXIES` tient

L'ADR 0018 posait 200 galaxies sur une mesure de tas qu'elle qualifiait elle-même de
synthétique, en demandant de la refaire. Refaite avec le générateur d'aujourd'hui, sur vingt
galaxies — 8 137 systèmes, 56 656 corps :

| | ADR 0018 | mesuré au chantier 43 |
|---|---|---|
| tas par galaxie | ~1,59 Mo | **1,46 Mo** |
| univers plein (200) | ~318 Mo | **291 Mo** |
| `generateGalaxyAt` | 31 ms | 31,3 ms |

Le chiffre tenait. Rien à recaler, et c'est le genre de résultat qu'il faut écrire aussi :
une vérification qui confirme coûte le même temps qu'une qui infirme, et sans elle on ne
sait pas laquelle des deux on avait.

Reste ce que cette mesure n'est toujours pas : un serveur réel en charge. Elle pèse ce que
le générateur produit, pas ce qu'un processus tient avec ses joueurs, ses sockets et ses
projections. L'ADR 0018 demandait le second ; ceci est le premier, refait.

### Relevés

| | chantier 40 | chantier 43 |
|---|---|---|
| img/s univers · galaxie · système | 58-61 · 27-39 · 55-60 | 57 · 33 · 55 |
| img/s en transition univers→galaxie | 56-59 à z = 0,62-0,68 | 62 à z = 0,64 |
| suite e2e complète | 33 passés, 3,5 min | **34 passés**, 3,9 et 4,6 min sur deux passes |
| `pnpm lint` | `a11y` + `noDebugger` | **+ `correctness`**, moins `useExhaustiveDependencies` |
| lignes de code mort retirées | — | 39 |
| `MapScene.tsx` | 1624 lignes | **1165** (+ `anchors.ts` 285, `SceneRig.tsx` 235) |
| `catchUp()` 24 h, PNJ compris | non mesuré (2,9 s à vide) | 591-745 s → **4,0-4,7 s** |
| coût d'un tick, PNJ compris | ~34 ms | **~0,95 ms** |
| tas par galaxie | ~1,59 Mo (synthétique) | 1,46 Mo mesuré |
| conteneur `app` pendant le relevé | **en marche** | arrêté |
| tests unitaires (7 paquets) | — | **995 passés**, 93 fichiers (`packages/ui` : 0 → 18) |

Les relevés du chantier 40 avaient été pris conteneur `app` **en marche**, ce que ce
document identifie depuis le chantier 35 comme faussant la mesure de moitié. Ceux-ci sont
pris `app` arrêté, et c'est pourquoi la fourchette du palier galaxie s'est resserrée plutôt
qu'améliorée : elle n'est plus bruitée. La suite est plus longue d'une minute — elle a un
test de plus, et le vol vers la capitale ne combat plus une borne de dolly.

## Chantier 44 — `devFastForward` rend le temps réel à l'ordonnanceur (05/09/2026)

Le chantier 43 avait consigné `advanceTicks(n)` sans le corriger, et posé la question comme un
arbitrage : « un nombre de ticks, ou un rattrapage réaliste ? ». **Il n'y en avait pas.** La
lecture du code montre une responsabilité en double, pas une formule à choisir.

Aucune ADR : ce chantier ne décide rien, il rend à chacun son travail.

### Le défaut n'était pas l'instabilité, c'était un désaccord d'unités

`devFastForward` décale tous les timers de **`delta` millisecondes** — huit `shiftTime`, de
`industry-service.ts` à `station-service.ts` — puis rejouait **`delta / TICK_MS` plus la
dérive** ticks. Les deux quantités décrivent la même avance de temps simulé et ne coïncidaient
pas. Le monde avançait de `delta` sur ses échéances et d'autre chose sur ses ticks.

L'instabilité des tests n'était que le symptôme visible. Rejouer exactement `delta / TICK_MS`
réaligne les deux : c'est une correction de simulation, pas un confort de test.

### La dérive appartenait à l'ordonnanceur

`scheduler.ts` calcule exactement la même expression, toutes les cinq secondes :

```ts
const missed = Math.floor((Date.now() - this.host.lastTickAt()) / TICK_MS);
if (missed > 0) this.host.advance(missed);
```

`devFastForward` la réimplémentait dans un outil dont le contrat — route `/dev/fastforward` —
est « avance N secondes de temps simulé ». La ligne
`floor((Date.now() - lastTickAt) / TICK_MS)` était écrite **trois fois** dans le dépôt ; il en
reste deux, et les deux restantes sont de vrais rattrapages : le `Scheduler` sur un serveur
vivant, `catchUp()` au boot.

Sur un serveur, rien n'est perdu : `lastTickAt` revient à sa valeur d'entrée et l'ordonnanceur
consomme la dérive à sa prochaine salve. En test il n'y a personne pour le faire, et c'est
correct — `engine.start()` n'existe que dans `index.ts`, donc aucun temps réel n'y est
légitime.

Détail qui a failli passer : le rejeu est quantifié en ticks **entiers avant** tout décalage.
Arrondir le rejeu sans arrondir le décalage aurait recréé le désaccord qu'on venait de
supprimer, et `advance(0,6)` aurait corrompu `clock.tick` avec une fraction. Le plafond
`MAX_CATCHUP_TICKS` change de sens au passage : il ne borne plus un rattrapage mais une
demande, et le journal le dit désormais quand il mord.

### Le contrat était écrit trois fois, faux les trois fois

- le JSDoc d'`advanceTicks` (`test-harness.ts`) : « delta multiple exact de TICK_MS » ;
- le nom du test `boot.test.ts` : « le tick est déterministe : N ticks avancent l'horloge
  d'exactement N » ;
- la route `/dev/fastforward`, qui renvoie le `tick` atteint.

Et ce même test **contournait** le défaut : une amorce `advanceTicks(engine, 1)` pour drainer
la dérive, précédée d'un commentaire qui le décrivait au mot près. Quelqu'un l'a rencontré,
compris, écrit — et contourné dans le test qui énonce le contrat que le code ne tenait pas. Le
contournement était en plus incomplet : il ne drainait que la dérive accumulée avant l'amorce.

### Vérification

L'amorce disparaît, et l'attente qui la remplace fait l'inverse : elle **fabrique** la dérive.
Six secondes entre le relevé de `t0` et l'appel mesuré, là où aucun test n'en attendait.

Exécuté contre l'ancien code, ce test rend « **expected 11 to be 10** » — le tick parasite
prédit, ni plus ni moins. Contre le nouveau, il passe. C'est la seule forme de preuve qui vaut
pour un défaut intermittent : le rendre certain.

Le risque du correctif était ailleurs — un test qui passait GRÂCE aux ticks surnuméraires.
Quatre sites le méritaient : l'assertion cassée d'`objective-service.test.ts`, l'égalité
stricte de `contract-service.test.ts` sur les vivres livrés, sa marge de cinquante crédits, et
le budget de temps du 43.6, que des ticks surnuméraires ne pouvaient qu'allonger. Tous
passent.
