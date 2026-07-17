# SpaceSim — Plan MVP

> **État (13/07/2026)** : jalons 1 à 7 implémentés et vérifiés — le MVP décrit ici est jouable.
> **Pivot EVE-like (13/07/2026)** : plus de niveaux de bâtiments — on empile des **instances**
> (coût plat, contrainte = emplacements + main-d'œuvre). Univers en **3 échelles** :
> Univers (3 galaxies) → Galaxie (graphe de systèmes) → Système (orbites, planètes, lunes
> colonisables, ceintures d'astéroïdes). Voyage inter-galactique verrouillé (portails : v2).
> **Chantiers v2 livrés (13/07/2026)** : 0 migrations drizzle-kit · 1 marché PNJ (factions,
> stations, prix offre/demande, ventes/achats au spot) · 2 chantier naval + routes automatiques
> (cargos possédés, règles maintain/fixed/surplus) · 3 stations minières sur ceintures ·
> 4 influence (monument, colonisation à coût croissant, claims +15 % prod) + réputation factions
> (paliers Associé/Partenaire/Allié, remises commerciales).
> Prochains chantiers : 5 portails inter-galactiques, 6 flottes + combat PvE (Endless Space-like), 7 multi territorial.

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
