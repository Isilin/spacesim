# 0003 — Persistance write-behind (RAM autoritaire + WriteSet + Persister)

## Statut

Accepté

## Contexte

La simulation (ticks toutes les 5s) et les commandes WebSocket doivent rester réactives et
garder leur logique en fonctions pures synchrones — introduire de l'`await` vers la DB au
milieu d'un calcul de tick complexifierait toute la logique de jeu pour un gain de sûreté
marginal, tout en payant une latence réseau/disque sur le chemin critique.

## Décision

La RAM fait autorité. Les repositories écrivent dans un `WriteSet` en mémoire
(`apps/server/src/runtime/persistence/write-set.ts`, keyé `(table, pk)`, dernière valeur
gagne) plutôt que dans la DB directement. Un `Persister`
(`apps/server/src/runtime/persistence/persister.ts`) draine et flushe ce tampon en une seule
transaction, sérialisée par chaînage de promesses (`tail`) — jamais deux flush concurrents.
`notify()` (diffusion WS) part avant la fin du flush : les appelants (fin de commande, fin de
lot de ticks) invoquent le flush en fire-and-forget. Un crash perd au pire le travail depuis le
dernier flush ; un flush qui échoue remet ses entrées dans le `WriteSet` pour réessai, sans
jamais perdre silencieusement une écriture.

## Conséquences

- La logique de simulation et de traitement des commandes WS reste 100% synchrone — aucune
  intrusion d'`async` dans le cœur du jeu.
- Fenêtre de perte de données bornée en cas de crash (une commande ou un lot de ticks) —
  compromis assumé et documenté, pas une garantie zéro-perte.
- `lastFlushAt`/`lastFlushError` doivent être surveillés opérationnellement : un flush qui
  échoue en boucle est un mode de défaillance réel à monitorer, pas juste théorique.
- La sérialisation par chaînage de promesses corrige un bug réel d'une version antérieure
  (chantier 20.3, couple inFlight/queued) où l'`await flush()` d'un appelant pouvait se résoudre
  avant qu'un flush de rattrapage chaîné, dont il dépendait implicitement, ait réellement
  terminé.

## Alternatives écartées

- **Écriture synchrone en DB à chaque commande/tick** — latence réseau/disque sur le chemin
  critique de la simulation, contraire à l'objectif d'un tick fluide à 5s.
- **Event sourcing / CQRS complet** — bien plus de mécanique (rejeu d'un log d'événements,
  snapshots périodiques) pour un problème que le write-behind résout avec une classe d'une
  quarantaine de lignes (`WriteSet`) et un peu plus pour le `Persister`.
