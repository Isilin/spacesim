# SpaceSim — Plan MVP

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

**Avancement (21/07/2026)** :
- ✅ **7a** — table `players`, `ownerId` sur colonies/fleets/claims, empire par défaut créé au
  boot + estampillage à la création (migration 0004).
- ✅ **7b (données)** — état d'empire (influence, recherche, réputation, exploration) déplacé de
  `games` vers `players` ; persistance retargetée, copie one-shot en migration 0005. Forme externe
  (`game` envoyé au client) inchangée, encore mono-empire en mémoire.
- ⏳ **7b (moteur)** — objet `Empire` par joueur, `Map<playerId, Empire>`, ticks/effects/fog par
  empire. **7c** identité de connexion + snapshots par joueur. **7d** territoire & PvP. **7e** UI.

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

**7c — Réseau & identité (léger, sans comptes).**
- Handshake de connexion : `?player=<token>` rejoint un empire existant, sinon en crée un.
  (Comptes + mots de passe = ligne v2 séparée « comptes + Postgres » ; ici, jetons légers,
  on reste sur SQLite.)
- `hello` et `tick` deviennent **par joueur** : seulement ses entités + l'univers redacté à son
  brouillard + la présence étrangère visible là où il a de la visibilité.
- Toutes les actions sont validées contre le `playerId` de la connexion (on ne pilote que le sien).
- Broadcast : un snapshot redacté distinct par connexion.

**7d — Territoire & contestation (le cœur « territorial »).**
- Claims **exclusifs par joueur** : un système n'est revendicable que par un empire à la fois.
- Contestation : revendiquer/rompre un claim ennemi exige une présence militaire (flotte) dans
  le système ; notion de frontière/adjacence sur le graphe (bonus de territoire contigu,
  points d'étranglement).
- **PvP** : étendre l'attaque (aujourd'hui flotte → repaire pirate) à flotte → flotte et
  flotte → colonie ennemies. `resolveBattle` est déjà agnostique attaquant/défenseur : réutilisable.
  À définir : défense de colonie (garnison / défense orbitale), conséquences (raid de ressources,
  rupture de claim, à terme capture de colonie).

**7e — UI & polish.**
- Carte : territoires colorés par empire, flottes étrangères dans les systèmes visibles.
- Vue Empire : relations / classement.
- Contrôles d'attaque ciblant des entités étrangères ; journal des batailles PvP.

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
