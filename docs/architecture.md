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
  `game-store`/`protocol`/du routeur. Direction visuelle itérée via **DesignSync** (projet
  claude.ai/design) : l'utilisateur y ajuste des cartes seed, les composants sont ensuite
  tirés (`list_files`/`get_file`) et implémentés en camelCase CSS Modules — le seed reste la
  référence visuelle, pas le gabarit d'implémentation littéral — puis repoussés en preview pour
  revue.
- **`apps/server`** — Fastify + WebSocket, moteur de tick, Postgres (Drizzle en prod, PGlite en
  tests). Serveur autoritaire.
- **`apps/web`** — client joueur, React + Vite + React Router, port 5173. État poussé par
  WebSocket centralisé dans un store Zustand (`state/game-store.ts`), navigation par URL
  (6 onglets plats + carte en routes imbriquées `/map/galaxy/:id/system/:id/body/:id`,
  résolues par `hooks/useMapLevel.ts`). Une feature qui n'a qu'un seul consommateur d'une
  valeur la reçoit en prop depuis son parent ; une dérivation dupliquée (colonie active,
  système exploré…) passe par un sélecteur (`state/selectors.ts`,
  `useGameStore(selectXxx(...))`) plutôt qu'une chaîne de props.
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

## Conception de vaisseaux (Blueprint)

Pas de classes figées — un vaisseau est un `Blueprint` (châssis + modules), assemblé par le
joueur (`ShipDesigner`, onglet Chantier), résolu par `sim/design.ts`
(`resolveBlueprint`/`validateBlueprint`). Châssis (`content/chassis.ts`) = coque de base +
emplacements typés (`weapon`/`defense`/`propulsion`/`utility`) + budgets partagés
énergie/tonnage/calcul (EVE-like) + `domain` (`fleet` = flotte militaire, `colony` = pool
civil). Modules (`content/modules.ts`) débloqués par la recherche
(`EmpireEffects.unlockedChassis`/`unlockedModules`, dérivés de `requiresTech`). `sim/combat.ts`
et `sim/ships.ts` prennent des stats **injectées** (défaut : tables historiques `SHIPS`/
`WARSHIPS`, conservées pour la parité). Plans commercialisables en station PNJ
(`StationPanel`) : achat au catalogue (`PRESETS`, marge +40 %), revente de plan ou de vaisseau
assemblé (décote −50 %).

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

## Comptes joueurs

Chaque joueur a un compte (e-mail + mot de passe) ; un compte possède un empire dans l'univers
partagé. Hash scrypt via `node:crypto` (aucune dépendance d'auth), sessions à jeton opaque en
DB (`apps/server/src/auth.ts`), jeton client en `localStorage`.

```
POST /auth/register  {"email", "password", "empireName"}  # crée le compte ET son empire
POST /auth/login     {"email", "password"}
POST /auth/logout                                          # en-tête Authorization: Bearer <token>
GET  /auth/me                                              # idem — session + empire courants
```

Le WebSocket exige une session : `/ws?session=<token>`, sinon fermeture avec le code `4001`
(le client repasse alors par l'écran de connexion). Le **premier** compte inscrit sur une base
neuve adopte l'empire amorcé au boot ; les suivants reçoivent un empire neuf. `apps/admin`
utilise les mêmes routes `/auth/*`, clé `localStorage` distincte
(`spacesim.admin.session`) — un compte admin est un compte joueur promu par `accounts.role`,
jamais un compte séparé.

## Endpoints

### `/dev/*` (hors production, 10 routes réelles)

```
POST /dev/grant        {"ore": 100, "science": 500}       # injecte des ressources (1re colonie)
POST /dev/fastforward  {"seconds": 3600}                  # avance le temps simulé (rejoue les ticks)
POST /dev/fundgateway  {"galaxyId": "gal-1", "leave": 40} # pré-finance un portail (reste `leave` à livrer)
POST /dev/spawnpirate  {"systemId": "gal-0-sys-3", "threat": 2} # repaire pirate (threat 1-3, défaut 2)
POST /dev/setfactionmood
POST /dev/triggerworldevent
POST /dev/spawnempire  {"name": "Colonia"}                # instancie un empire supplémentaire
POST /dev/spawnnpc
GET  /dev/empires                                          # résumé de tous les empires en mémoire
POST /dev/armfleet     {"empireId": "…", "systemId": "…", "ships": {…}} # arme une flotte (tests PvP)
```

`systemId` vide (`{}`) sur `spawnpirate` → repaire dans le système de la colonie mère.
`/dev/armfleet` sans `empireId` cible l'empire par défaut.

### `/api/admin/*`

Même socle de services applicatifs que l'API publique. Garde Fastify `adminGuard`
(fail-closed si une route omet son `adminAction`), matrice `ROLE_PERMISSIONS`
(`packages/protocol/src/admin.ts`), audit des mutations (pas des lectures) dans
`admin_audit_log`.

## Configuration et durcissement prod (`apps/server/src/config.ts`)

Validé par Zod au premier import (erreurs lisibles immédiatement plutôt que des `undefined`
silencieux) : `PORT`, `DATABASE_URL` (`postgres://…` en prod, sinon `SPACESIM_DB`/chemin
PGlite), `NODE_ENV`, `LOG_LEVEL`, `CORS_ORIGIN`, `RATE_LIMIT_MAX`, `DEV_ROUTES`,
`SPACESIM_BOOTSTRAP` — convention `z.enum(["0","1"])` pour les flags booléens. Les routes
`/dev/*` sont à double verrou : jamais actives en prod sauf `DEV_ROUTES=1` explicite.
`@fastify/rate-limit` et `@fastify/cors` sont enregistrés dans `http/app.ts` ; les logs pino
masquent l'en-tête `authorization`.

Sauvegarde de l'univers officiel : `scripts/backup.sh` (`pg_dump -Fc`, horodaté) — voir
l'en-tête du script pour l'usage exact (y compris via `docker compose exec postgres` en dev, le
conteneur `app` n'ayant pas `pg_dump`). Restauration via `pg_restore --clean --if-exists`.

## Environnement Docker

Le CLI docker n'est pas toujours sur le PATH de l'hôte — sur cette machine il vit sous
`C:\Users\casa2\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe`.

`docker compose up app` sert Postgres + serveur (3001) + web (5173) + admin (5174) — les trois
ports client sont exposés et documentés en tête de `docker-compose.yml`. `Dockerfile` = toolchain
(node 22 + pnpm via corepack, épinglé par `packageManager`). `Dockerfile.e2e` l'étend avec les
dépendances système de Chromium (service `e2e` seulement, pour ne pas alourdir
`app`/`test`/`typecheck` — binaire installé au premier `docker compose run e2e`, caché dans le
volume nommé `playwright_browsers`).

Pas de Node/pnpm natif attendu sur l'hôte : `node_modules` vivent dans des volumes nommés
(binaires Linux isolés de l'hôte Windows). Après un changement de dépendances, l'install se
relance au prochain `up`/`run` (lockfile figé).

**Édition locale (VS Code)** : sans Node/pnpm sur l'hôte, un VS Code ouvert directement sur le
dossier ne peut résoudre ni les imports `@spacesim/*` ni les dépendances externes.
`.devcontainer/devcontainer.json` référence le service `app` existant :
`Dev Containers: Reopen in Container` (extension `ms-vscode-remote.remote-containers`) attache
VS Code à ce conteneur, où le serveur TypeScript et Biome trouvent les vraies dépendances.
`shutdownAction: "none"` évite qu'une fermeture de VS Code n'arrête la pile.

Le bind mount hôte Windows → conteneur (Docker Desktop/WSL2) ne fait pas remonter les
événements fs de façon fiable : `tsx watch` et Vite ne voyaient aucune modification faite
depuis l'hôte. `CHOKIDAR_USEPOLLING`/`CHOKIDAR_INTERVAL` sur le service `app` forcent le
polling — le hot reload fonctionne, au prix d'une détection à ~300 ms plutôt qu'instantanée.

Migrations drizzle-kit (`apps/server/drizzle/`), appliquées automatiquement au boot : après un
changement de `src/db/schema.ts`, lancer `pnpm --filter @spacesim/server db:generate` et
committer la migration générée. Ne jamais modifier une migration déjà appliquée.
