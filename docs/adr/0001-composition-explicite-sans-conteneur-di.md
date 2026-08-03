# 0001 — Composition explicite au boot, pas de conteneur DI

## Statut

Accepté

## Contexte

`GameEngine` câble une douzaine de services par domaine (industry, logistics, gateway,
contract, market, exploration, fleetService, diplomacy, objective, station, bootstrap,
devService) plus le `TickRunner`, avec de vrais cycles de dépendances : Gateway/Contract/Market
ont besoin de `reserveShip`/`insertMission` (Logistics), qui a elle-même besoin de
`resolveSaleAt`/`persistGateway` (Market/Gateway) pour résoudre les missions qui traversent son
domaine. Ce niveau de câblage croisé est exactement le genre de situation où un conteneur
d'injection de dépendances (NestJS, InversifyJS, tsyringe...) peut sembler la solution standard.

## Décision

`composeEngine()` (`apps/server/src/runtime/composition.ts`, ~260 lignes) est une factory
explicite, appelée une fois au boot — aucun conteneur, aucune réflexion, aucun décorateur. Les
cycles sont cassés par des fermetures PARESSEUSES sur des variables locales `let` déclarées
avant d'être affectées : l'ORDRE DE CONSTRUCTION des services n'importe pas, seul l'ORDRE
D'AFFECTATION des variables compte, puisqu'une fermeture capture une variable, pas sa valeur au
moment de la capture.

## Conséquences

- Aucune nouvelle dépendance runtime, aucun nouveau paradigme (pas d'interfaces+tokens+providers
  à apprendre).
- Le câblage complet se lit dans un seul fichier, du haut vers le bas — pas de magie à tracer à
  l'exécution.
- Ajouter un service = l'ajouter manuellement à `composeEngine` et fournir ses dépendances à la
  main — mécanique mais explicite, zéro configuration cachée.
- Le patron de fermeture paresseuse sur `let` non encore affectée demande un temps de
  compréhension réel à la première lecture — documenté en commentaire en tête de fonction, pas
  optionnel.

## Alternatives écartées

- **Conteneur DI générique (NestJS, InversifyJS...)** — l'indirection (interfaces, tokens,
  providers, résolution à l'exécution) coûte plus qu'elle ne rapporte à cette échelle
  (une douzaine de services) : nouveau paradigme + taxe d'apprentissage pour une petite équipe,
  pour un problème que la composition explicite résout directement.
- **Références circulaires via `this.xxx` dans le constructeur de `GameEngine`** (patron
  d'avant chantier 19.9) — fonctionnait, mais couplait tout dans un constructeur god-object.
  L'extraction vers des classes de service autonomes + une fonction de composition découple la
  testabilité (chaque service instanciable/testable seul) du câblage.
