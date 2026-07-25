# SpaceSim

Jeu de gestion spatiale par navigateur (solo pour le MVP, multi univers-unique visé à terme).
Design complet et roadmap : [docs/design.md](docs/design.md).

## Architecture

Monorepo pnpm workspaces, TypeScript partout :

- `packages/shared` — types du modèle de jeu, constantes d'équilibrage, génération d'univers et logique de simulation **pure et déterministe** (testée avec vitest). Aucune dépendance runtime.
- `apps/server` — Fastify + WebSocket (`/ws`), moteur de ticks, SQLite (better-sqlite3 + drizzle). **Serveur autoritaire** : toute la simulation vit ici, le client n'est qu'un dashboard.
- `apps/web` — React + Vite. Proxy Vite `/ws` → serveur :3001.

Principes :
- L'univers n'est **pas stocké en DB** : régénéré depuis la seed (générateur déterministe, `packages/shared/src/universe.ts`). La DB ne contient que l'état dynamique.
- L'univers est **extensible à l'infini** (chantier 9) : chaque galaxie se génère seule depuis
  `seed:galaxy:<index>` et se place sur une spirale d'angle d'or. Seul `games.galaxyCount` est
  persisté ; `ensureFrontier()` l'incrémente pour garder des galaxies vierges devant les joueurs.
  Toute modification du générateur invalide les parties existantes (supprimer `spacesim.db`).
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
- `packages/protocol` portera les contrats HTTP/WebSocket et leurs schémas Zod. Il peut dépendre
  de `shared`; les applications peuvent dépendre de lui, jamais l'inverse.
- `apps/server` reste un serveur Fastify. Il sépare les adaptateurs HTTP/WS, les services
  applicatifs, le runtime de jeu mutable, les projections client et les repositories Drizzle.
  `GameEngine` demeure une façade de compatibilité pendant les extractions. Ne pas introduire
  NestJS ou un conteneur DI : la composition explicite au boot est suffisante pour le moteur à
  ticks et WebSocket.
- L'API de jeu publique et la future API protégée `/api/admin` utilisent les mêmes services
  applicatifs. Une route admin ne modifie jamais Drizzle ni les maps du runtime directement.
  Les actions administratives sont autorisées par rôle, nommées, auditées et validées.
- `apps/web` est le client joueur. Son état poussé par WebSocket est centralisé, puis les
  features consomment des sélecteurs plutôt que de faire transiter le snapshot par props.
- `packages/ui` hébergera les tokens, styles de base et primitives React génériques, sans logique
  de jeu. Les cartes SVG, labels, calculs d'affichage et interactions métier restent dans les
  features de `apps/web`. Le futur client admin réutilisera `protocol` et `ui`.

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
pnpm test          # tests unitaires de la simulation (shared)
pnpm typecheck     # tsc sur les 3 packages
pnpm format        # normalise le formatage avec Biome
pnpm format:check  # vérifie le formatage sans modifier les fichiers
pnpm lint          # règles Biome adoptées progressivement
```

`format:check` est obligatoire pour tout le dépôt. Le lint est renforcé progressivement avec
chaque zone de code assainie, afin de ne pas masquer un chantier de refactorisation sous des
centaines de corrections non liées.

Les deux serveurs de dev sont aussi déclarés dans `.claude/launch.json` (noms `server` et `web`).
La DB SQLite (`apps/server/spacesim.db`) se supprime sans risque pour repartir d'une partie neuve.

## Environnement Docker (build sans Node natif)

Cette machine n'a **pas Node/pnpm installés** : tout passe par Docker (Docker Desktop, backend WSL2).
Le CLI docker n'est pas sur le PATH — il vit sous
`C:\Users\casa2\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe`.

```
docker compose up app              # serveur (3001) + client web (5173), hot reload
docker compose run --rm test       # tests unitaires (packages/shared)
docker compose run --rm typecheck  # tsc sur les 3 packages
docker compose run --rm test sh -c "pnpm lint"
docker compose run --rm test sh -c "pnpm format:check"
```

`Dockerfile` = toolchain (node 22 + pnpm via corepack, épinglé par `packageManager`).
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
