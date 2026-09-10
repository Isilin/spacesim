# 0022 — Vite+ comme chaîne d'outils unique

## Statut

Accepté

## Contexte

L'outillage du dépôt était assemblé à la main, chaque pièce choisie séparément : `pnpm -r`
pour orchestrer, six processus vitest lancés en parallèle sans rapport commun, Biome 2.5.12
pour le lint et le format, six `tsc --noEmit`, Playwright à part. Aucun cache de tâches,
aucun hook git, aucune couverture, et deux déclarations indépendantes de la version de Node —
le tag de l'image Docker d'un côté, `node-version:` du workflow CI de l'autre — que rien ne
vérifiait.

Vite+ (VoidZero, MIT depuis le rachat par Cloudflare en juin 2026) propose de tenir tout cela
sous une commande. Deux faits mesurés cadrent la décision :

- **Le build est déjà le sien.** `@voidzero-dev/vite-plus-core@0.3.1` embarque vite 8.2.2 et
  rolldown 1.2.7, exactement les versions que `apps/web` et `apps/admin` résolvaient déjà.
  L'adoption ne change donc rien à ce qui est produit.
- **Les tests reculent d'une majeure.** `vite-plus@0.3.1` déclare `vitest` en dépendance dure
  épinglée à 4.1.11 et impose une copie unique. Le dépôt venait de monter en 5.0.0 au chantier
  46, trois jours plus tôt.

L'échéance est connue : l'issue #2405 (« Plan for 2026 Q3 ») annonce le passage à vitest 5,
sur la même liste que la 1.0 et le cache distant de `vp run`. Elle n'est pas tenue — la PR
#2612, « keep automatic Vitest upgrades on v4 », re-épingle les montées automatiques le
05/09/2026, « until the integration supports that major ». Sept ruptures sont par ailleurs
annoncées avant la 1.0, dont le retrait du wrapper lint/format.

## Décision

Passer entièrement sous `vp` : `vp test` pour les suites, `vp check` pour le format, le lint
et les types, `vp run` pour l'orchestration, l'image officielle `ghcr.io/voidzero-dev/vite-plus`
en conteneur et `setup-vp` en CI. Biome, `pnpm -r` et `tsc --noEmit` disparaissent du dépôt.

Le recul en vitest 4.1.11 est **accepté**, avec ses deux compensations écrites dans la config
plutôt que subies : `clearMocks` reposé explicitement à `true`, et le benchmark de rattrapage
réécrit vers le `bench()` de portée module.

## Conséquences

Ce que ça donne :

- Une porte unique. `vp check` rend 469 fichiers formatés en 0,5 s et 420 fichiers lintés et
  typés en 4,6 s, là où il fallait Biome plus six invocations de `tsc`.
- Le **lint type-aware**, que Biome n'avait pas : 59 des 61 règles de typescript-eslint,
  servies par tsgolint sur le TypeScript 7.0.2 du dépôt (ADR 0005) — précisément la version
  que ces règles exigent.
- Un cache de tâches, mesuré à 2/2 sur `vp run -r build`.
- Une seule source pour la version de Node : `devEngines` dans le package.json racine, lue par
  l'image comme par la CI, et épinglée dans le lockfile avec intégrité par plateforme.
- `packages/i18n-config` cesse d'être sauté en silence : sans script `test`, il était invisible
  de `pnpm -r test` ; il est désormais un projet déclaré.

Ce que ça coûte :

- **Les garde-fous de vitest 5 sont perdus** : une assertion asynchrone non attendue repasse
  en silence au lieu d'échouer. Rien ne le compense ; c'est la ligne à rouvrir quand #2405
  livre.
- **Un bench qui ne tourne pas passe pour vert.** Le `bench()` de portée module ramène le piège
  du chantier 46 : un hook déclaré dans le `describe` ne s'applique pas aux benchmarks. La
  vérification est explicite — le bench doit rendre l'ordre de grandeur « PNJ compris ».
- **Beta.** Sept ruptures avant la 1.0, dont le retrait du wrapper lint/format. Les versions
  sont épinglées exactement (`vite-plus@0.3.1`, image `:0.3.1`, `setup-vp@v1.19.0`) pour que
  chaque montée soit une décision.
- **La couverture de lint change de forme.** La catégorie `correctness` d'oxlint est plus large
  que celle de Biome : 61 diagnostics dans des familles que le dépôt n'a jamais fait passer
  (26 règles du compilateur React, 34 type-aware). Elles sont listées et désactivées avec leur
  volume. À l'inverse, oxlint ne signale pas les `<g>` SVG ni les objets de scène three.js que
  Biome signalait : douze justifications d'accessibilité restent en prose, plus tenues par un
  outil.

## Alternatives écartées

**Ne rien adopter et prendre les gains à part.** oxlint et oxfmt s'installent seuls, `test.projects`
est natif à vitest, un cache Playwright en CI est trois lignes. Cette voie gardait vitest 5 et
évitait la beta — mais laissait l'orchestration, la version de Node et l'image Docker dans
l'état bricolé qui est précisément le problème.

**N'utiliser Vite+ que comme orchestrateur** (`vp run -r`, en gardant vitest 5 par paquet).
Techniquement possible : `vp run` lance les scripts `package.json`, donc chaque paquet garde sa
copie. Mais il ne reste alors ni `vp test`, ni rapport unifié, ni `vp check` — un task runner
sans le reste, pour un dépôt dont la CI n'a que deux jobs et aucun build.

**Attendre la 1.0.** L'échéance existe (#2405) mais n'est pas tenue, et la PR #2612 montre que
le sujet est repoussé plutôt que planifié. Attendre revient à garder l'assemblage manuel pour
une date inconnue.
