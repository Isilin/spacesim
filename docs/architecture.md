# Architecture — référence profonde

Ce document couvre le détail technique de SpaceSim : inventaire réel des services, des
endpoints, de la configuration, des quirks d'environnement. Pour le *pourquoi* des décisions
structurantes, voir [`docs/adr/`](adr/). Pour la roadmap, voir [`docs/design.md`](design.md).
Pour la direction visuelle, voir [`docs/ui-brief.md`](ui-brief.md). `CLAUDE.md` reste le point
d'entrée court qui pointe ici pour le détail.

## Vue d'ensemble du monorepo

Workspaces pnpm, TypeScript partout :

- **`packages/shared`** — modèles, contenu (`content/`), génération d'univers
  (`universe.ts`), simulation pure et déterministe. Zéro dépendance runtime.
- **`packages/protocol`** — contrats HTTP/WS, schémas Zod, `admin.ts` (rôles/permissions).
  Dépend de `shared` ; jamais l'inverse.
- **`packages/ui`** — design system HUD (18 composants, CSS Modules), agnostique de
  `game-store`/`protocol`/du routeur.
- **`apps/server`** — Fastify + WebSocket, moteur de tick, Postgres (Drizzle en prod, PGlite en
  tests). Serveur autoritaire.
- **`apps/web`** — client joueur, React + Vite + React Router, port 5173.
- **`apps/admin`** — client d'administration, React + Vite + React Router, port 5174, sans
  WebSocket ni `zustand`.

## Services applicatifs (`apps/server/src/runtime/`)

`composeEngine()` (`runtime/composition.ts`, ~260 lignes) câble **12 services** + le
`TickRunner`, une fois au boot. Cycles de dépendances cassés par des fermetures paresseuses sur
des `let` non encore affectées — voir [ADR 0001](adr/0001-composition-explicite-sans-conteneur-di.md).

| Service | Domaine |
|---|---|
| `IndustryService` | Colonies, production, bâtiments, blueprints |
| `LogisticsService` | Missions, convois, ascenseur orbital, routes |
| `GatewayService` | Portails inter-galactiques |
| `ContractService` | Contrats de vente entre joueurs |
| `MarketService` | Comptoirs commerciaux PNJ, prix régionaux |
| `ExplorationService` | Découverte de systèmes, claims, croissance de l'univers |
| `FleetService` | Flottes, combat |
| `DiplomacyService` | Relations inter-empires, guerre |
| `ObjectiveService` | Objectifs/quêtes |
| `StationService` | Stations orbitales (voir détail ci-dessous) |
| `BootstrapService` | Amorçage d'univers/d'empire |
| `DevService` | Endpoints `/dev/*` (hors production) |

### `StationService` — une station n'est pas une colonie

Une station est une entité de premier rang distincte d'une colonie : elle orbite un corps sans
revendiquer de territoire (pas de claim système), possède sa propre grille de croissance
hexagonale (chantier 26, voir plus bas) et son propre accès marché inter-empire.

- `resolveTradeAccess` — validateur d'accès partagé : existence de la colonie/station,
  système découvert, distance de saut, politique diplomatique du propriétaire
  (`canTradeAtStation`) contre la relation du visiteur. Réutilisé tel quel par
  `IndustryService` pour le commerce de blueprints/vaisseaux.
- `setMarketPolicy` — action réservée au propriétaire : `marketAccess` (paliers
  diplomatiques) et `marketTaxRate` (0–1).
- `sellToStation`/`buyFromStation` — actions joueur, gardées par `resolveTradeAccess`, miroir
  de `MarketService.sellToTradingPost/buyFromTradingPost`.
- `buildZone`/`buildInstallation` — construction sur la grille hexagonale.

### CMS en DB (`runtime/content/`)

`content-service.ts` (`ensureContentSeeded()`, `loadContentBundle()`) couvre **13 domaines** :
warships, combatTuning, factions, buildings, ships, constants, techs, chassis, modules,
presets, milestones, zoneTypes, installations. **12 d'entre eux** ont une vue CRUD dédiée côté
admin (`ContentLayout.tsx`) — `combatTuning` est seedé/chargé mais n'a pas de vue admin propre.

## Chantier 26 — grille hexagonale de croissance des stations

`packages/shared/src/sim/industry/station-layout.ts` : coordonnées axiales `{q, r}`
(`HexCoord`), 6 directions (`HEX_DIRECTIONS`). Le hub `(0,0)` est toujours occupé (jamais une
vraie zone). `computeGrowthPoints` retourne toutes les cellules vides adjacentes à une cellule
occupée — garantit une silhouette toujours connexe, jamais de zone flottante. Fonction pure,
partagée entre la validation serveur et le rendu client.

- `apps/web/src/StationDiagram.tsx` — rendu SVG de la grille : conversion axial→pixel
  (`hexPixelPosition`, formule hexagone pointy-top standard), jitter organique déterministe par
  cellule (RNG seedé), style visuel "gooey"/fusion de blobs, couleur de zone dérivée d'un hash
  stable de `zoneTypeId` (rend les types de zone créés en admin sans id codé en dur).
- `apps/web/src/StationBuildPicker.tsx` — panneau "quoi construire" sous le diagramme :
  sélection d'un type de zone pour un point de croissance, ou d'une installation pour une zone
  construite, avec vérification de coût/capacité (`canAffordStation`).

## `apps/admin` — structure réelle

4 onglets de navigation (`App.tsx`, `NAV_ITEMS`) : **Joueurs** (`/accounts`,
`AccountsListView`/`AccountDetailView` — gestion de comptes, les sanctions vivent dans
`AccountDetailView`, pas de vue dédiée), **Contenu** (`/content`, 12 sous-routes CRUD),
**Ops** (`/ops`, `OpsView` — santé du moteur), **Journal d'audit** (`/audit`,
`AuditLogView`).

## Endpoints

### `/auth/*`
`POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`.

### `/dev/*` (hors production, 10 routes réelles)
`POST /dev/grant`, `POST /dev/fastforward`, `POST /dev/fundgateway`,
`POST /dev/spawnpirate`, `POST /dev/setfactionmood`, `POST /dev/triggerworldevent`,
`POST /dev/spawnempire`, `POST /dev/spawnnpc`, `GET /dev/empires`, `POST /dev/armfleet`.

### `/api/admin/*`
Même socle de services applicatifs que l'API publique. Garde Fastify `adminGuard`
(fail-closed si une route omet son `adminAction`), matrice `ROLE_PERMISSIONS`
(`packages/protocol/src/admin.ts`), audit des mutations (pas des lectures) dans
`admin_audit_log`.

## Configuration (`apps/server/src/config.ts`)

Validée par Zod au premier import : `PORT`, `DATABASE_URL`, `NODE_ENV`, `LOG_LEVEL`,
`CORS_ORIGIN`, `RATE_LIMIT_MAX`, `DEV_ROUTES`, `SPACESIM_BOOTSTRAP` — convention
`z.enum(["0","1"])` pour les flags booléens. Les routes `/dev/*` sont à double verrou : jamais
actives en prod sauf `DEV_ROUTES=1` explicite.

## Environnement Docker

`docker compose up app` sert Postgres + serveur (3001) + web (5173) + admin (5174) — les trois
ports client sont exposés et documentés en tête de `docker-compose.yml`. Pas de Node/pnpm natif
attendu sur l'hôte : `node_modules` vivent dans des volumes nommés (binaires Linux isolés de
l'hôte Windows). Le bind mount hôte→conteneur ne remonte pas les événements fs de façon fiable ;
`CHOKIDAR_USEPOLLING`/`CHOKIDAR_INTERVAL` forcent le polling (~300 ms) pour `tsx watch`/Vite.
`.devcontainer/devcontainer.json` attache VS Code au service `app` existant (pas un conteneur
séparé) — `shutdownAction: "none"` évite qu'une fermeture de VS Code n'arrête la pile.
