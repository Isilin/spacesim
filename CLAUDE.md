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
- Temps hybride : tick serveur (5 s, `TICK_MS`) pour la production ; timers réels absolus (timestamps en DB) pour constructions/trajets/recherche, résolus par le tick qui les dépasse. Catch-up hors-ligne borné (`MAX_CATCHUP_TICKS`).
- Toute règle de simulation = fonction pure dans `shared`, appelée par le serveur. Les constantes d'équilibrage vivent dans `shared` (fichiers `constants.ts` / `content/`).
- Code en anglais, UI en français (labels dans le client ou fichiers de contenu).

## Commandes

```
pnpm dev:server    # serveur de jeu (port 3001)
pnpm dev:web       # client web (port 5173)
pnpm test          # tests unitaires de la simulation (shared)
pnpm typecheck     # tsc sur les 3 packages
```

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
```

`Dockerfile` = toolchain (node 22 + pnpm via corepack, épinglé par `packageManager`).
`docker-compose.yml` monte le code depuis l'hôte ; les `node_modules` vivent dans des volumes
nommés (binaires natifs Linux isolés de l'hôte). Après un changement de dépendances, l'install
se relance au prochain `up`/`run` (lockfile figé).

Migrations drizzle-kit (`apps/server/drizzle/`), appliquées automatiquement au boot :
après un changement de `src/db/schema.ts`, lancer `pnpm --filter @spacesim/server db:generate`
et committer la migration générée. Ne jamais modifier une migration déjà appliquée.

## Outils de dev (hors production)

```
POST /dev/grant        {"ore": 100, "science": 500}     # injecte des ressources (1re colonie)
POST /dev/fastforward  {"seconds": 3600}                # avance le temps simulé (décale les timers, rejoue les ticks)
POST /dev/fundgateway  {"galaxyId": "gal-1", "leave": 40} # pré-finance un portail (reste `leave` métaux à livrer)
POST /dev/spawnpirate  {"systemId": "gal-0-sys-3", "threat": 2} # fait apparaître un repaire pirate
```
`systemId` vide (`{}`) → repaire dans le système de la colonie mère. `threat` 1–3 (défaut 2).
