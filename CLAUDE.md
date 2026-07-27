# SpaceSim

Jeu de gestion spatiale par navigateur, façon EVE Online : un **univers unique, persistant
et multijoueur**. Une fois le serveur officiel lancé, il ne sera **jamais réinitialisé** —
seulement étendu, corrigé, amélioré.
Design complet et roadmap : [docs/design.md](docs/design.md).

## Architecture

Monorepo pnpm workspaces, TypeScript partout :

- `packages/shared` — types du modèle de jeu, constantes d'équilibrage, génération d'univers et logique de simulation **pure et déterministe** (testée avec vitest). Aucune dépendance runtime.
- `packages/protocol` — contrats HTTP/WebSocket et schémas Zod (`ClientMessage`, `ServerMessage`, `EmpireSnapshot`). Dépend de `shared` ; `apps/server` et `apps/web` en dépendent, jamais l'inverse.
- `packages/ui` — feuille de styles partagée (tokens de couleur, primitives CSS génériques : `.tabs`, `.action-button`, `.chip`, `.field`…), importée une fois par `apps/web`. Pas encore de composants React : à ajouter seulement quand un vrai doublon d'interface (pas juste une classe CSS) apparaît.
- `apps/server` — Fastify + WebSocket (`/ws`), moteur de ticks, SQLite (better-sqlite3 + drizzle). **Serveur autoritaire** : toute la simulation vit ici, le client n'est qu'un dashboard.
- `apps/web` — React + Vite + React Router. Proxy Vite `/ws` → serveur :3001.

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
  (`src/routes/`), six services applicatifs par domaine (`runtime/services/` — industrie,
  logistique, exploration, flottes, diplomatie, bootstrap), un `GameRuntime` pour l'état mutable,
  des projections en lecture seule, un `TickRunner` explicite pour l'ordre d'un tick, et les
  repositories Drizzle. `GameEngine` reste une façade de compatibilité, composée au boot à
  partir de ces pièces — pas une couche à supprimer, le point d'entrée stable du moteur. Ne pas
  introduire NestJS ou un conteneur DI : la composition explicite au boot suffit.
- L'API de jeu publique et la future API protégée `/api/admin` utiliseront les mêmes services
  applicatifs (socle admin différé, non commencé). Une route admin ne devra jamais modifier
  Drizzle ni les maps du runtime directement ; les actions administratives seront autorisées par
  rôle, nommées, auditées et validées.
- `apps/web` est le client joueur : état poussé par WebSocket centralisé dans un store Zustand
  (`state/game-store.ts`), navigation par URL (React Router — 6 onglets plats + carte en routes
  imbriquées `/map/galaxy/:id/system/:id/body/:id`, résolues par `hooks/useMapLevel.ts`). Les
  features qui n'ont qu'un seul consommateur d'une valeur continuent de la recevoir en prop
  depuis leur parent ; celles où une dérivation (colonie active, système exploré…) apparaît
  dupliquée passent par un sélecteur (`state/selectors.ts`), consommé directement via
  `useGameStore(selectXxx(...))` plutôt que transitée par une chaîne de props.
- `packages/ui` héberge pour l'instant une feuille de styles (tokens, primitives CSS génériques
  identifiées par audit de `styles.css`), sans composant React ni logique de jeu. Les cartes SVG,
  labels, calculs d'affichage et interactions métier restent dans les features de `apps/web`. Des
  primitives React n'y entreront que si un vrai doublon d'interface (pas seulement une classe
  CSS partagée) apparaît. Le futur client admin réutilisera `protocol` et `ui`.

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
pnpm test          # tests unitaires (shared, protocol, server, web — vitest par paquet)
pnpm typecheck     # tsc sur shared/protocol/server/web
pnpm format        # normalise le formatage avec Biome
pnpm format:check  # vérifie le formatage sans modifier les fichiers
pnpm lint          # règles Biome adoptées progressivement
```

`format:check` est obligatoire pour tout le dépôt. Le lint est renforcé progressivement avec
chaque zone de code assainie, afin de ne pas masquer un chantier de refactorisation sous des
centaines de corrections non liées.

Les deux serveurs de dev sont aussi déclarés dans `.claude/launch.json` (noms `server` et `web`).
Supprimer la DB de dev (`apps/server/spacesim.db`) jette **l'univers de dev** — acceptable en
local uniquement (`loadOrBootstrap` en recrée un au boot). Le futur serveur officiel, lui, ne
repart jamais de zéro : c'est l'invariant du chantier 18.

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

Migrations drizzle-kit (`apps/server/drizzle/`), appliquées automatiquement au boot :
après un changement de `src/db/schema.ts`, lancer `pnpm --filter @spacesim/server db:generate`
et committer la migration générée. Ne jamais modifier une migration déjà appliquée.

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
