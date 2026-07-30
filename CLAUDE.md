# SpaceSim

Jeu de gestion spatiale par navigateur, façon EVE Online : un **univers unique, persistant
et multijoueur**. Une fois le serveur officiel lancé, il ne sera **jamais réinitialisé** —
seulement étendu, corrigé, amélioré.
Design complet et roadmap : [docs/design.md](docs/design.md).

## Architecture

Monorepo pnpm workspaces, TypeScript partout :

- `packages/shared` — types du modèle de jeu, constantes d'équilibrage, génération d'univers et logique de simulation **pure et déterministe** (testée avec vitest). Aucune dépendance runtime.
- `packages/protocol` — contrats HTTP/WebSocket et schémas Zod (`ClientMessage`, `ServerMessage`, `EmpireSnapshot`, `admin.ts` — rôles/permissions/actions admin, chantier 23.1). Dépend de `shared` ; `apps/server`, `apps/web` et `apps/admin` en dépendent, jamais l'inverse.
- `packages/ui` — package React réel (chantier 21, consommé en source directe comme `shared` — pas d'étape de build) : design system HUD (18 composants — `Button`, `Link`, `Panel`, `Table`, `Tabs`, `Toast`, `TopBar`, `ZoomableSvg`…) + tokens de couleur/typographie. Chaque composant porte son propre `*.module.css` (CSS Modules, chantier 22) plutôt qu'une feuille globale ; les variantes se pilotent par `data-variant`/`data-*` (toujours émis, jamais omis à la valeur par défaut) plutôt que par suffixe de classe conditionnel. Le motif transverse « cut-frame » (bordures en coin coupé) vit dans `shared/cut-frame.module.css`, consommé via `composes`. Aucun import de `game-store` ni de `protocol` (`apps/admin` en dépend aussi) ; aucune logique de jeu, y compris la navigation — `TopBar`/`Link` restent agnostiques du routeur.
- `apps/server` — Fastify + WebSocket (`/ws`), moteur de ticks, Postgres (`drizzle-orm/node-postgres` en prod, PGlite WASM embarqué en tests/e2e — même dialecte SQL). **Serveur autoritaire** : toute la simulation vit ici, le client n'est qu'un dashboard.
- `apps/web` — React + Vite + React Router. Proxy Vite `/ws` → serveur :3001.
- `apps/admin` — client d'administration (chantier 23, React + Vite + React Router, port 5174, sans WebSocket ni `zustand` — état par écran, fetch/mutate sur `/api/admin/*`). Mêmes `packages/ui`/`packages/protocol` que `apps/web`, même design ; aucune dépendance à `game-store`. Auth identique (`/auth/*`, session opaque en `localStorage`, clé distincte `spacesim.admin.session`) — un compte admin est un compte joueur promu par `accounts.role`, jamais un compte séparé.

Principes :
- **L'univers est stocké en DB** (chantier 18, tables `universe_*`) et la DB fait
  **autorité** : le générateur (`packages/shared/src/universe.ts`) ne sert qu'à
  **matérialiser** les galaxies neuves à l'ouverture de la frontière
  (`growUniverse` → `appendGalaxies`, transactionnel). Une galaxie matérialisée ne change
  plus jamais ; corriger l'univers officiel = UPDATE ciblé, jamais régénération.
- **Modifier le générateur n'invalide plus rien** : cela n'affecte que les galaxies
  futures. Tout changement de son flux de sortie doit bumper `GENERATOR_VERSION` et
  régénérer `universe.fixture.json` (`vitest -u`) dans le **même commit** — la fixture
  gelée casse sinon. Les habillages dérivés se calculent depuis l'**id** du corps
  (patron `bodyPhysicals`), jamais depuis le flux du générateur.
- L'univers reste **extensible à l'infini** (chantier 9) : chaque galaxie se génère seule
  depuis `seed:galaxy:<index>` sur une spirale d'angle d'or ; `ensureFrontier()` garde des
  galaxies vierges devant les joueurs. L'arbre inter-galactique est figé à la
  matérialisation (`parent_galaxy_index`) — les constantes de spirale ne recâblent plus le
  réseau existant.
- Création d'univers = geste explicite : `GameEngine.bootstrapNewUniverse()` (une fois dans
  la vie du serveur). `load()` lève sur une base vierge ; `loadOrBootstrap()` est le
  comportement dev/tests. Une base d'avant le chantier 18 est matérialisée par un
  rattrapage one-shot idempotent au boot.
- Temps hybride : tick serveur (5 s, `TICK_MS`) pour la production ; timers réels absolus (timestamps en DB) pour constructions/trajets/recherche, résolus par le tick qui les dépasse. Catch-up hors-ligne borné (`MAX_CATCHUP_TICKS`).
- **Persistance en write-behind** (chantier 20) : la sim et les commandes WS restent 100 %
  synchrones sur la RAM (qui fait autorité) ; les repositories écrivent dans un `WriteSet`
  (`runtime/persistence/write-set.ts`, upserts keyés `(table, pk)` + deletes) qu'un
  `Persister` (`runtime/persistence/persister.ts`) flushe en transaction, sérialisé par une
  chaîne de promesses. `notify()` part avant la fin du flush — un crash perd au pire le
  travail depuis le dernier flush (une commande ou un lot de ticks), jamais la cohérence de
  la DB. `lastFlushAt`/`lastFlushError` exposés pour la supervision.
- Toute règle de simulation = fonction pure dans `shared`, appelée par le serveur. Les constantes d'équilibrage vivent dans `shared` (fichiers `constants.ts` / `content/`).
- **Logistique en deux stocks** (chantier 12) : chaque colonie a un stock **au sol**
  (`resources`, produit/consommé par les bâtiments) et un stock **en orbite**
  (`orbitalResources`, la seule soute chargeable par un vaisseau). Le `orbital_dock` fixe
  capacité et débit de l'ascenseur ; `liftRules` décide de ce qui monte/descend. Tout ce qui
  embarque (convois, routes, ventes) passe par `takeFromOrbit`/`deliverToOrbit` — sans dock, une
  colonie ne peut rien exporter. Prix de station **régionaux** (`stationPrice(res, stock, ctx)`).
- **Conception de vaisseaux** (chantier 13) : plus de classes figées — un vaisseau est un
  `Blueprint` (châssis + modules), assemblé par le joueur (`ShipDesigner`, onglet Chantier),
  résolu par `sim/design.ts` (`resolveBlueprint`/`validateBlueprint`). Châssis (`content/chassis.ts`)
  = coque de base + emplacements typés (`weapon`/`defense`/`propulsion`/`utility`) + budgets
  partagés énergie/tonnage/calcul (EVE-like) + `domain` (`fleet` = flotte militaire, `colony` =
  pool civil). Modules (`content/modules.ts`) débloqués par la recherche
  (`EmpireEffects.unlockedChassis`/`unlockedModules`, dérivés de `requiresTech`). `sim/combat.ts`
  et `sim/ships.ts` prennent des stats **injectées** (défaut : tables historiques `SHIPS`/
  `WARSHIPS`, conservées pour la parité). Plans commercialisables en station PNJ (`StationPanel`) :
  achat au catalogue (`PRESETS`, marge +40 %), revente de plan ou de vaisseau assemblé (décote −50 %).
- Code en anglais, UI en français (labels dans le client ou fichiers de contenu).

## Architecture cible et frontières

La séparation des responsabilités est stricte :

- `packages/shared` reste le noyau de domaine : modèles, contenu, génération d'univers et
  simulation pure. Il ne dépend d'aucune bibliothèque runtime, d'I/O ou de transport.
- `packages/protocol` porte les contrats HTTP/WebSocket et leurs schémas Zod. Il dépend de
  `shared` ; les applications en dépendent, jamais l'inverse.
- `apps/server` est un serveur Fastify découpé par frontière : adaptateurs HTTP/WS
  (`src/http/routes/`, `src/ws/dispatch.ts`), neuf services applicatifs par domaine
  (`runtime/services/` — industrie, logistique, portails, contrats, marché, exploration,
  flottes, diplomatie, objectifs) + bootstrap + outils de dev, un `GameRuntime` pour l'état
  mutable, des projections en lecture seule, un `TickRunner` explicite pour l'ordre d'un
  tick, et les repositories Drizzle (`runtime/repositories/`, un propriétaire par table).
  `GameEngine` reste une façade de compatibilité, composée au boot (`runtime/composition.ts`
  → `composeEngine`) à partir de ces pièces — pas une couche à supprimer, le point d'entrée
  stable du moteur. Ne pas introduire NestJS ou un conteneur DI : la composition explicite au
  boot suffit.
- L'API de jeu publique et l'API protégée `/api/admin` utilisent les mêmes services applicatifs.
  Socle démarré au chantier 23.1 : `accounts.role`, matrice `ROLE_PERMISSIONS` codée
  (`packages/protocol/src/admin.ts`), garde Fastify `adminGuard`
  (`apps/server/src/http/routes/admin/guard.ts`, fail-closed si une route omet son
  `adminAction`) et `admin_audit_log`. Une route admin ne doit jamais modifier Drizzle ni les
  maps du runtime directement ; les actions administratives sont autorisées par rôle, nommées,
  et les mutations sont auditées (pas les lectures).
- `apps/web` est le client joueur : état poussé par WebSocket centralisé dans un store Zustand
  (`state/game-store.ts`), navigation par URL (React Router — 6 onglets plats + carte en routes
  imbriquées `/map/galaxy/:id/system/:id/body/:id`, résolues par `hooks/useMapLevel.ts`). Les
  features qui n'ont qu'un seul consommateur d'une valeur continuent de la recevoir en prop
  depuis leur parent ; celles où une dérivation (colonie active, système exploré…) apparaît
  dupliquée passent par un sélecteur (`state/selectors.ts`), consommé directement via
  `useGameStore(selectXxx(...))` plutôt que transitée par une chaîne de props.
- `packages/ui` héberge le design system HUD (chantier 21, CSS Modules + data-attributes
  chantier 22) : composants React génériques (`Button`, `Link`, `Panel`, `Table`, `Tabs`,
  `Toast`, `TopBar`, `ZoomableSvg`…), tokens et styles, consommés en source directe par
  `apps/web`. Les cartes SVG (rendu des nœuds), labels, calculs d'affichage et interactions
  métier propres au jeu restent dans les features de `apps/web` — `ui` ne connaît ni
  `game-store` ni `protocol`. `apps/admin` (chantier 23) réutilise `protocol` et `ui`. La
  direction visuelle a été itérée via **DesignSync** (projet claude.ai/design) : l'utilisateur
  y ajuste des cartes seed, les composants sont ensuite tirés (`list_files`/`get_file`) et
  implémentés ici — en camelCase CSS Modules plutôt qu'en classes globales, le seed restant
  la référence visuelle, pas le gabarit d'implémentation littéral — puis repoussés en preview
  pour revue.

## Workflow de changement

Les règles Karpathy suivantes complètent les règles propres au projet :

1. **Réfléchir avant de coder** : expliciter les hypothèses et les compromis. En cas
   d'ambiguïté qui modifie le comportement, demander une décision plutôt que choisir en silence.
2. **Privilégier la simplicité** : livrer le minimum nécessaire. Ne pas introduire une couche,
   une option ou une gestion d'erreur spéculative.
3. **Faire des changements chirurgicaux** : chaque ligne modifiée doit découler de la demande.
   Ne pas corriger du code adjacent ni supprimer du code préexistant sans objectif explicite.
4. **Piloter par des objectifs vérifiables** : avant une extraction, définir le comportement à
   préserver et le test qui le prouve; exécuter ce test avant et après le changement.

La remise en ordre de l'architecture est une exception explicitement demandée à la règle de
portée minimale. Elle reste découpée par frontière et chaque extraction conserve les contrats,
les sauvegardes et la sémantique de tick existants.

## Commandes

```
pnpm dev:server    # serveur de jeu (port 3001)
pnpm dev:web       # client web (port 5173)
pnpm dev:admin     # client admin (port 5174, chantier 23)
pnpm test          # tests unitaires (shared, protocol, server, web, admin — vitest par paquet)
pnpm typecheck     # tsc sur shared/protocol/server/web
pnpm format        # normalise le formatage avec Biome
pnpm format:check  # vérifie le formatage sans modifier les fichiers
pnpm lint          # règles Biome adoptées progressivement
```

`format:check` est obligatoire pour tout le dépôt. Le lint est renforcé progressivement avec
chaque zone de code assainie, afin de ne pas masquer un chantier de refactorisation sous des
centaines de corrections non liées.

Les trois serveurs de dev sont aussi déclarés dans `.claude/launch.json` (noms `server`, `web` et
`admin`).
En dev via Docker, l'univers vit dans le volume nommé `pgdata` (service `postgres` du
compose) : jeter l'univers de dev est un geste explicite, `docker compose down -v`
(acceptable en local uniquement, `loadOrBootstrap` en recrée un au boot). Le futur serveur
officiel, lui, ne repart jamais de zéro : c'est l'invariant du chantier 18, et créer son
univers demande `SPACESIM_BOOTSTRAP=1` explicite (jamais un défaut, chantier 20.4).

## Environnement Docker (build sans Node natif)

Cette machine n'a **pas Node/pnpm installés** : tout passe par Docker (Docker Desktop, backend WSL2).
Le CLI docker n'est pas sur le PATH — il vit sous
`C:\Users\casa2\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe`.

```
docker compose up app              # serveur (3001) + client web (5173), hot reload
docker compose run --rm test       # tests unitaires (tous les paquets avec un script test)
docker compose run --rm typecheck  # tsc sur shared/protocol/server/web
docker compose run --rm test sh -c "pnpm lint"
docker compose run --rm test sh -c "pnpm format:check"
docker compose run --rm e2e        # Playwright, pile serveur+web sur SPACESIM_DB=:memory:
```

`Dockerfile` = toolchain (node 22 + pnpm via corepack, épinglé par `packageManager`).
`Dockerfile.e2e` l'étend avec les dépendances système de Chromium (service `e2e` seulement, pour
ne pas alourdir `app`/`test`/`typecheck` — le binaire du navigateur s'installe au premier
`docker compose run e2e`, mis en cache dans le volume nommé `playwright_browsers`).
`docker-compose.yml` monte le code depuis l'hôte ; les `node_modules` vivent dans des volumes
nommés (binaires natifs Linux isolés de l'hôte). Après un changement de dépendances, l'install
se relance au prochain `up`/`run` (lockfile figé).

**Édition locale (VS Code)** : sans Node/pnpm sur l'hôte, les `node_modules` n'existent jamais
sur le disque Windows (volumes nommés) — un VS Code ouvert directement sur le dossier ne peut
donc résoudre ni les imports `@spacesim/*` ni les dépendances externes. `.devcontainer/devcontainer.json`
référence le service `app` existant : `Dev Containers: Reopen in Container` (extension
`ms-vscode-remote.remote-containers`) attache VS Code à ce conteneur, où le serveur TypeScript
et Biome (`.vscode/extensions.json`) trouvent les vraies dépendances. `shutdownAction: "none"`
évite que fermer VS Code n'arrête la pile.

Le bind mount hôte Windows → conteneur (Docker Desktop/WSL2) ne fait pas remonter les
événements fs de façon fiable : `tsx watch` et Vite ne voyaient aucune modification faite
depuis l'hôte. `CHOKIDAR_USEPOLLING`/`CHOKIDAR_INTERVAL` sur le service `app` (lus directement
par chokidar, la lib de watch des deux outils) forcent le polling — le hot reload fonctionne
à nouveau, au prix d'une détection à ~300 ms plutôt qu'instantanée.

Migrations drizzle-kit (`apps/server/drizzle/`), appliquées automatiquement au boot :
après un changement de `src/db/schema.ts`, lancer `pnpm --filter @spacesim/server db:generate`
et committer la migration générée. Ne jamais modifier une migration déjà appliquée.

## Configuration et durcissement prod (chantier 20)

`apps/server/src/config.ts` valide l'environnement avec Zod au premier import (erreurs
lisibles immédiatement plutôt que des `undefined` silencieux) : `PORT`, `DATABASE_URL`
(`postgres://…` en prod, sinon `SPACESIM_DB`/chemin PGlite), `NODE_ENV`, `LOG_LEVEL`,
`CORS_ORIGIN`, `RATE_LIMIT_MAX`, `DEV_ROUTES`, `SPACESIM_BOOTSTRAP`. Les routes `/dev/*` sont
à double verrou : jamais actives en prod sauf `DEV_ROUTES=1` explicite. `@fastify/rate-limit`
et `@fastify/cors` sont enregistrés dans `http/app.ts` ; les logs pino masquent l'en-tête
`authorization`.

Sauvegarde de l'univers officiel : `scripts/backup.sh` (`pg_dump -Fc`, horodaté) — voir
l'en-tête du script pour l'usage exact (y compris via `docker compose exec postgres` en dev,
le conteneur `app` n'ayant pas `pg_dump`). Restauration via `pg_restore --clean --if-exists`.

## Comptes joueurs (chantier 8)

Chaque joueur a un compte (e-mail + mot de passe) ; un compte possède un empire dans l'univers
partagé. Hash scrypt via `node:crypto` (aucune dépendance d'auth), sessions à jeton opaque en DB
(`apps/server/src/auth.ts`), jeton client en `localStorage`.

```
POST /auth/register  {"email", "password", "empireName"}  # crée le compte ET son empire
POST /auth/login     {"email", "password"}
POST /auth/logout                                          # en-tête Authorization: Bearer <token>
GET  /auth/me                                              # idem — session + empire courants
```
Le WebSocket exige une session : `/ws?session=<token>`, sinon fermeture avec le code `4001`
(le client repasse alors par l'écran de connexion). Le **premier** compte inscrit sur une base
neuve adopte l'empire amorcé au boot ; les suivants reçoivent un empire neuf.

## Outils de dev (hors production)

```
POST /dev/grant        {"ore": 100, "science": 500}     # injecte des ressources (1re colonie)
POST /dev/fastforward  {"seconds": 3600}                # avance le temps simulé (décale les timers, rejoue les ticks)
POST /dev/fundgateway  {"galaxyId": "gal-1", "leave": 40} # pré-finance un portail (reste `leave` métaux à livrer)
POST /dev/spawnpirate  {"systemId": "gal-0-sys-3", "threat": 2} # fait apparaître un repaire pirate
POST /dev/spawnempire  {"name": "Colonia"}              # instancie un empire supplémentaire
GET  /dev/empires                                        # résumé de tous les empires en mémoire
POST /dev/armfleet     {"empireId": "…", "systemId": "gal-0-sys-3", "ships": {…}} # arme une flotte (tests PvP)
```
`systemId` vide (`{}`) → repaire dans le système de la colonie mère. `threat` 1–3 (défaut 2).
`/dev/armfleet` sans `empireId` cible l'empire par défaut.
