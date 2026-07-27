# SpaceSim — Plan MVP

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
> **Prochain chantier : 7 — multi territorial** (voir « Chantier 7 » en fin de document),
> puis pass d'équilibrage/polish continu.
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
| Univers | 10–30 systèmes générés (seed), région unique |
| Objectif | Sandbox + jalons mesurables |
| Ambiance | Esthétique hard sci-fi, richesse de lore space opera (habillage léger au MVP, extensible) |
| UI | Dashboards + carte 2D (3D éventuelle bien plus tard) |
| Ambition | Hobby sérieux : en ligne à terme, archi propre sans sur-ingénierie |

## Stack technique (choix délégué)

**TypeScript full-stack, monorepo pnpm workspaces** :

- `packages/shared` — types du modèle de jeu, constantes d'équilibrage (bâtiments, ressources, techs), logique de simulation pure (fonctions déterministes testables), partagés client/serveur.
- `apps/server` — Node + **Fastify**, moteur de ticks, WebSocket (push d'état vers le client — cohérent avec les sessions longues), persistance via **Drizzle ORM**.
- `apps/web` — **React + Vite**, TanStack Query/Router (ou Zustand pour l'état temps réel), carte 2D en SVG/Canvas.

**Base de données : SQLite (better-sqlite3) au MVP**, zéro infra sur Windows ; Drizzle rend la migration PostgreSQL triviale au moment du multi. Pas de comptes au MVP : un profil/partie local, mais toute la simulation côté serveur (le client n'est qu'un dashboard) — c'est ce qui préserve le chemin vers l'univers unique.

**Moteur temps hybride** :
- Tick serveur (~5 s) : production des ressources, croissance/besoins de population, consommation.
- Timers réels absolus (timestamp de fin en DB) : constructions, recherche, trajets de vaisseaux — résolus par le tick qui les dépasse. Le serveur peut rattraper le temps hors-ligne en rejouant les ticks (catch-up borné).

## Design du jeu (MVP)

### Univers
- Génération procédurale à seed : ~20 systèmes reliés par des liaisons (graphe), 2–5 planètes/système.
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
`spacesim.db` supprimée). `Empire.blueprintMap` chargée/persistée, amorcée aux presets de départ
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
