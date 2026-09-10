# 0023 — Le serveur tourne depuis ses sources

## Statut

Accepté

## Contexte

`apps/server` n'avait ni script `build`, ni script `start`, ni image de production. Il
tournait depuis ses sources TypeScript via `tsx` en développement, en conteneur, en CI et
sous Playwright. Pour un serveur officiel censé ne jamais repartir de zéro
([ADR 0002](0002-univers-materialise-en-db.md)), c'était le trou le plus net : rien ne
décrivait comment le mettre en ligne, et rien ne prouvait que ce chemin fonctionnait.

Le chantier 48 ayant mis toute la chaîne sous Vite+, `vp pack` (tsdown) devenait la
réponse évidente. L'inventaire l'a écartée.

## Décision

Le serveur n'est **pas empaqueté**. Il est livré sous forme d'image autonome qui exécute
ses sources — `Dockerfile.server`, tâche `start` (`tsx src/index.ts`), service Compose
`server_prod` en profil `prod`.

Six obstacles concrets écartent le bundling, tous vérifiés dans le code :

1. `apps/server/src/db/index.ts` ne résout plus le dossier de migrations lui-même depuis
   le chantier 49, mais `db/migrator.ts` le fait toujours en relatif d'`import.meta.url`
   (`../../drizzle`). Depuis un `dist/`, ce chemin pointe un cran trop haut — et les
   2,4 Mo de `.sql` plus `_journal.json` sont lus par `fs` à l'intérieur de drizzle, donc
   aucun bundler ne les trace ni ne les copie.
2. `@electric-sql/pglite` (WASM plus image de système de fichiers) est importé
   statiquement, même quand le déploiement parle à un vrai Postgres.
3. `pg` déclare un pair optionnel `pg-native` ; `drizzle-orm` en déclare plus de trente.
   Un bundler naïf tente de tous les résoudre.
4. Les greffons Fastify passent par `fastify-plugin`, qui lit des symboles de métadonnées
   et l'identité des fonctions — deux choses qu'un bundler qui renomme ou hisse casse.
5. Les paquets du workspace s'exportent en TypeScript brut (`"." : "./src/index.ts"`) avec
   des imports relatifs suffixés `.js`. Le bundler devrait accepter du TS à l'intérieur de
   `node_modules` et remapper `.js` → `.ts`.
6. `config.ts` a un défaut de base de données relatif (`./spacesim-pgdata`), résolu contre
   le répertoire courant.

Chacun se contourne. Les six ensemble, pour un serveur qui n'a aucun besoin de démarrage à
froid rapide ni de taille d'artefact contrainte, ne paient pas.

## Conséquences

Ce que ça donne :

- Un chemin de production existe et se prouve. `NODE_ENV=production` fait passer le boot
  par `GameEngine.load()` — un autre code que le `loadOrBootstrap()` de tous les autres
  environnements — et un job de CI vérifie à chaque PR qu'il amorce et sert.
- L'invariant du serveur officiel est exécutable, pas seulement écrit : sur une base vide
  et sans `SPACESIM_BOOTSTRAP=1`, le démarrage échoue avec « Aucun univers en base ».
  Vérifié.
- L'obstacle 1 devient sans objet : le dossier `drizzle/` est copié tel quel, à côté des
  sources qui le cherchent.
- `tsx` reste une dépendance de développement mais devient nécessaire à l'exécution.
  L'installation dans l'image est donc complète, devDeps comprises.

Ce que ça coûte :

- **L'image porte les sources et toutes les dépendances**, y compris celles qui ne servent
  qu'aux tests. Elle est plus grosse qu'un bundle, et sa surface aussi.
- **Le démarrage transpile.** `tsx` compile à la volée à chaque boot. Sans conséquence
  pour un processus long, mais mesurable au redémarrage.
- **Aucune vérification de types au démarrage** — `tsx` transpile sans vérifier. C'est
  `vp check` qui tient ce rôle, en CI.

## Alternatives écartées

**`vp pack` sur `apps/server`.** La voie que le chantier 48 rendait naturelle. Elle bute
sur les six obstacles ci-dessus, dont le premier — les migrations lues par `fs` à un
chemin relatif au module — demanderait à lui seul de changer la façon dont drizzle trouve
ses fichiers, donc de s'écarter de son chemin documenté.

**`vp pack` sur les paquets du workspace seulement**, en laissant le serveur en sources.
Cela retirerait l'obstacle 5 et donnerait des `dist/` avec leurs `.d.ts` à `shared`,
`protocol` et `ui`. Écartée ici parce qu'elle change ce que consomment aussi `apps/web` et
`apps/admin` — une décision d'architecture qui mérite son propre chantier, pas un effet de
bord d'une mise en production. **C'est la porte de réouverture de cette ADR.**

**Compiler avec `tsc`** vers du JavaScript, sans bundler. Écartée : le dépôt est sur
TypeScript 7 en `noEmit` partout ([ADR 0005](0005-effect-ts-en-conditions-reelles.md)), et
réintroduire une étape d'émission irait contre le chantier 48, qui vient justement de
retirer les six `tsc`.
