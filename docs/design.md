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
  **Fin de la première vague de contenu** (23.5-23.10) : six domaines migrés en DB, la
  recette est éprouvée sur tous les cas — id libre (23.5/23.6/23.8/23.9/23.10), id fermé
  (23.7), scalaire simple (23.8b), graphe avec garde-fou serveur (23.9), et deux tables
  couplées consommées par un même résolveur (23.10).

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
