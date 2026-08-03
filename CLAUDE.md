# SpaceSim

Jeu de gestion spatiale par navigateur, façon EVE Online : un **univers unique, persistant et
multijoueur**. Une fois le serveur officiel lancé, il ne sera **jamais réinitialisé** —
seulement étendu, corrigé, amélioré.

Design et roadmap : [docs/design.md](docs/design.md). Référence technique profonde :
[docs/architecture.md](docs/architecture.md). Pourquoi des décisions structurantes :
[docs/adr/](docs/adr/). Direction visuelle : [docs/ui-brief.md](docs/ui-brief.md).

## Architecture (monorepo pnpm, TypeScript partout)

- `packages/shared` — modèles, contenu, génération d'univers, simulation pure. Zéro dépendance
  runtime.
- `packages/protocol` — contrats HTTP/WS, schémas Zod. Dépend de `shared`, jamais l'inverse.
- `packages/ui` — design system HUD (CSS Modules), agnostique de `game-store`/`protocol`.
- `apps/server` — Fastify + WebSocket, moteur de tick, Postgres. Serveur autoritaire, toute la
  simulation vit ici.
- `apps/web` — client joueur (port 5173).
- `apps/admin` — client d'administration (port 5174), mêmes `protocol`/`ui`, auth identique
  (un admin est un compte joueur promu par rôle, jamais un compte séparé).

## Invariants qui changent l'approche de n'importe quelle tâche ici

- **L'univers ne se réinitialise jamais.** Le générateur (`packages/shared/src/universe.ts`)
  ne fait que matérialiser des galaxies neuves ; une galaxie matérialisée ne change plus par
  régénération, seulement par UPDATE ciblé. Voir
  [ADR 0002](docs/adr/0002-univers-materialise-en-db.md).
- **La RAM fait autorité pour la simulation**, pas la DB : write-behind via `WriteSet`/
  `Persister`, la DB est un miroir écrit en arrière-plan. Voir
  [ADR 0003](docs/adr/0003-persistance-write-behind.md).
- **Logistique en deux stocks** (sol/orbite) — tout ce qui embarque passe par l'ascenseur
  orbital. Voir [ADR 0004](docs/adr/0004-logistique-deux-stocks-sol-orbite.md).
- **Pas de conteneur DI** — composition explicite au boot (`composeEngine`). Voir
  [ADR 0001](docs/adr/0001-composition-explicite-sans-conteneur-di.md).
- **Cette machine n'a pas Node/pnpm natif** — tout passe par Docker (backend WSL2), voir plus
  bas.
- Code en anglais, UI en français.

## Workflow de changement (règles Karpathy)

1. **Réfléchir avant de coder** : expliciter hypothèses et compromis. En cas d'ambiguïté qui
   modifie le comportement, demander une décision plutôt que choisir en silence.
2. **Privilégier la simplicité** : livrer le minimum nécessaire, aucune couche spéculative.
3. **Changements chirurgicaux** : chaque ligne modifiée découle de la demande. Ne pas corriger
   du code adjacent sans objectif explicite.
4. **Piloter par des objectifs vérifiables** : définir le comportement à préserver et le test
   qui le prouve avant une extraction ; exécuter ce test avant et après.

## Commandes

```
pnpm dev:server / dev:web / dev:admin   # ports 3001 / 5173 / 5174
pnpm test / typecheck / format / format:check / lint
```

`format:check` est obligatoire sur tout le dépôt. Le lint est renforcé progressivement, zone
par zone assainie.

## Docker (pas de Node/pnpm natif sur cette machine)

```
docker compose up app              # Postgres + serveur + web + admin, hot reload
docker compose run --rm test       # tests unitaires
docker compose run --rm typecheck
docker compose run --rm e2e        # Playwright
```

`Dev Containers: Reopen in Container` (VS Code) attache au service `app` existant, où le
serveur TypeScript résout les vraies dépendances (`node_modules` en volumes nommés, jamais sur
le disque hôte). Détail complet (quirks fs, migrations Drizzle, sauvegarde, chemin de
`docker.exe`) : [docs/architecture.md](docs/architecture.md).

En dev, l'univers vit dans le volume `pgdata` : `docker compose down -v` le jette (acceptable
en local, `loadOrBootstrap` en recrée un au boot). Le serveur officiel ne repart jamais de
zéro — créer son univers demande `SPACESIM_BOOTSTRAP=1` explicite, jamais un défaut.
