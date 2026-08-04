# 0005 — Effect.ts en conditions réelles, but d'apprentissage

## Statut

Accepté

## Contexte

Le chantier 27 avait explicitement écarté Effect.ts comme couche systémique
(`docs/design.md`, intro du chantier 27) : paradigme incompatible avec l'async/await +
exceptions déjà en place (routes Fastify, moteur de tick, WS dispatch), taxe d'interop à
chaque frontière Effect↔code existant, coût d'apprentissage disproportionné pour une
petite équipe. Cette exclusion visait une adoption systémique — remplacer le style
existant partout — et n'a jamais eu d'ADR dédiée, une phrase de roadmap plutôt qu'une
décision tracée.

La question qui se pose maintenant est différente : apprentissage personnel du
framework, sans deadline produit ni besoin fonctionnel à combler, "avec le temps que ça
prendra". Les trois raisons d'origine restent valables pour une adoption large — ce
n'est pas ce que cette ADR décide.

Risque technique identifié : le dépôt tourne sur TypeScript 7.0.2 (portage natif/Go,
catalog pnpm `typescript: ^7.0.0`), une version très récente dont la compatibilité avec
les mécanismes fins d'inférence d'Effect (`Effect<A, E, R>`, `Effect.gen`, variance) n'a
jamais été vérifiée.

## Décision

Le travail se fait directement dans le code réel du projet (`apps/web`, `apps/admin`,
`apps/server`, `packages/shared`/`protocol`/`ui`) — pas dans un package ou une app dédiés
à l'exercice. Séquence tracée comme chantier 28 dans `docs/design.md` :

1. Spike de compatibilité TS7×Effect (scratch, hors dépôt) avant tout ajout de
   dépendance réelle.
2. Progression pédagogique par petites étapes vérifiées, chacune une modification
   chirurgicale d'un fichier réel existant : `Effect.gen`/`pipe` de base, erreurs
   typées (sur le pattern `{ ok, reason }` réellement dupliqué dans
   `packages/shared/src/sim/industry/{colony,station,ships}.ts`), `Context.Tag`,
   `Layer`, `Schedule`/retry.
3. Un pilote réel borné sur `apps/server/src/runtime/persistence/persister.ts` (module
   déjà asynchrone, déjà try/catch + retry manuel — le plus représentatif de ce
   qu'Effect promet de mieux gérer), signature publique et tests existants inchangés.
4. Bilan explicite qui décide d'une suite ou d'un arrêt.

Méthode de travail : j'explique un concept, je propose exercice(s) et modification
ciblée ; l'utilisateur implémente et committe ; relecture, correction directe si
nécessaire (commit de suivi expliqué), commentaire ; étape suivante.

Gardes-fous, non négociables pour ce chantier :

- `apps/server/src/runtime/composition.ts` (`composeEngine`) n'est pas touché : les
  `Layer`/`Context` s'exercent d'abord sur des services réels mais nouveaux/isolés.
- `apps/server/src/runtime/tick-runner.ts` (`TickRunner.run()`, ADR 0003 — boucle
  synchrone) ne devient pas async.
- `packages/protocol` garde Zod comme source de vérité (génération `orval`, type
  provider Fastify) — pas d'Effect Schema en remplacement dans ce chantier.

## Conséquences

- `packages/shared`, documenté "zéro dépendance runtime" (`CLAUDE.md`), perd cette
  propriété dès la première étape qui y introduit `effect` — accepté sciemment.
- Une dépendance `effect` apparaît dans le graphe du monorepo (`packages/shared` et,
  après le pilote, `apps/server`).
- ADR 0001 (pas de conteneur DI) n'est pas préservée indéfiniment par cette décision :
  `composeEngine` est destiné à être remplacé une fois `Layer`/`Context` (ce chantier) et
  le conteneur IoC d'AdonisJS (chantier 29, à venir) réellement maîtrisés sur du code
  réel — chantier 30, avec sa propre ADR au statut `Remplacé par` posé explicitement sur
  `0001`. Ce chantier-ci ne fait qu'ouvrir cette trajectoire, il ne la referme pas.
- Le spike (préalable bloquant) : si TypeScript 7 se révèle incompatible avec
  l'inférence d'Effect, la suite du chantier s'ajuste (version TS locale à discuter)
  avant de continuer.

## Alternatives écartées

- **Statu quo (exclusion totale maintenue)** — écarté : l'apprentissage personnel a une
  valeur propre, indépendante d'un besoin produit.
- **Bac à sable séparé ou semi-séparé** (package/app dédié à l'exercice, jamais branché
  sur le code réel) — écarté par l'utilisateur : l'objectif est de travailler
  directement dans le projet, pas sur des exercices jetables déconnectés du domaine.
- **Réécrire `composeEngine` avant d'avoir appris Layers/IoC** — écarté : ferait
  découvrir les limites du mécanisme en plein milieu d'un module central plutôt qu'après
  un apprentissage réel sur du périmètre isolé (chantier 30 vient après, pas avant).
