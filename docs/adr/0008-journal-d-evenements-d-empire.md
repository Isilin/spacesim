# 0008 — Journal d'événements d'empire : durable, structuré, borné

## Statut

Accepté

## Contexte

SpaceSim est un univers persistant multijoueur dont le serveur tourne en continu : le tick
avance que le joueur soit connecté ou non. Aujourd'hui **rien ne lui dit ce qui s'est passé
en son absence.**

L'état du dépôt au moment de la décision :

1. **Tout passe par le snapshot.** `snapshotForEmpire()` reconstruit à chaque tick une vue
   complète et redactée de l'empire. Un événement n'y laisse aucune trace : une flotte
   détruite disparaît simplement de `fleets`, un claim perdu disparaît de `territories`.
   Le joueur voit l'état d'après, jamais la transition.
2. **Une seule archive existe.** `StoredBattle` est persisté et poussé dans le snapshot —
   mais c'est un journal de combat, pas un canal d'événements : il ne couvre que les
   batailles, il est **partagé par toute la partie** (`runtime.battleLog`, sans redaction),
   et rien ne distingue ce qui a déjà été lu.
3. **Le serveur ne parle pas la langue du joueur.** Le chantier 27.19 a tranché ce point
   sur les contrats : `Contract.issuerFactionId` existe précisément parce qu'un
   `issuerName` figé à la création restait dans la locale du serveur. Le client résout
   l'affichage par id.
4. **La RAM fait autorité** ([ADR 0003](0003-persistance-write-behind.md)), la DB est un
   miroir écrit en arrière-plan par `WriteSet`/`Persister`.

Le chantier 32 empile corporations, communication, standings et carnet d'ordres. Aucune de
ces mécaniques n'est perceptible par un joueur hors ligne sans canal d'événements durable :
une offre acceptée, une guerre déclarée, un vote de corporation se produisent pendant qu'il
dort. Le journal est donc le préalable de tout le reste, et non une commodité d'affichage.

## Décision

### Un événement est une donnée structurée, jamais une phrase

`EmpireEvent` porte un `kind` et des champs typés (ids, quantités, noms d'entités
joueur). **Le serveur ne formate aucun libellé** : le client rend l'événement dans la
locale du joueur, exactement comme il résout déjà `FACTION_LABELS` par id.

Conséquence assumée : ajouter un `kind` impose d'ajouter sa traduction dans `apps/web`,
et le typage i18n (`commonEn: typeof commonFr`) le rend obligatoire à la compilation. Un
`message: string` construit côté serveur aurait été plus court à écrire et aurait figé la
langue du serveur dans une donnée persistée à vie — dans un univers qui ne se réinitialise
jamais, c'est irréversible.

### Durable et redacté par empire

Table `empire_events`, propriétaire unique `EmpireEventRepository`, écrite via le
`WriteSet` comme le reste. Chaque ligne porte son `empireId` : la projection filtre comme
`objectivesForEmpire`, jamais de fuite vers un tiers. Un même fait — une bataille — produit
**deux** événements, un par camp, avec des `kind` distincts (`battle_won` / `battle_lost`) ;
c'est ce qui permet de rédiger le contenu selon le point de vue sans exposer celui de
l'adversaire.

### Borné, des deux côtés

Le journal est le seul objet du snapshot qui **croît sans jamais décroître** avec le temps
de jeu. Deux bornes :

- **En base** : au-delà de `EMPIRE_EVENT_KEEP` (200) événements pour un empire, les plus
  anciens **déjà lus** sont supprimés. Les non-lus ne sont jamais purgés — c'est précisément
  ce que le joueur absent doit retrouver.
- **Sur le fil** : le snapshot ne transporte que les `EMPIRE_EVENT_PAGE` (50) plus récents,
  plus un compteur de non-lus. Un joueur revenu après trois semaines n'a pas besoin de
  recevoir deux cents lignes à chaque tick pour comprendre qu'il s'est fait attaquer.

Ces deux constantes sont dans `packages/shared/src/constants.ts`, pas en dur dans une
requête : c'est un réglage de jouabilité, pas un détail d'implémentation.

### Lu / non-lu par événement, pas un curseur

Un `readAt: number | null` par ligne, et non un `Empire.lastSeenAt` unique. Le curseur
serait plus compact, mais il rend impossible de marquer une ligne lue sans marquer tout ce
qui la précède — or l'usage réel d'une boîte de réception est de traiter une entrée et de
laisser les autres en attente. C'est aussi ce qui permet à la purge de distinguer ce qu'on
peut jeter.

## Conséquences

- Les services de domaine gagnent un émetteur (`emit(event)`) injecté par `composeEngine`,
  au même titre que `persistColony` — pas de dépendance vers l'`InboxService` lui-même
  ([ADR 0001](0001-composition-explicite-sans-conteneur-di.md)).
- Un événement émis pendant un tick suit le chemin normal du write-behind : RAM d'abord,
  flush en transaction ensuite. Il n'y a pas de garantie de livraison plus forte que celle
  du reste de l'état, et il n'en faut pas — un événement perdu au crash décrit un fait qui
  a lui-même été perdu.
- Le `battleLog` partagé reste en place et n'est pas absorbé : c'est un journal public de
  combats, utile en soi, et le remplacer imposerait une migration de données pour un gain
  nul.

## Alternatives écartées

**Notifications éphémères poussées sur le WebSocket.** Zéro persistance, très simple —
et strictement inutile pour un joueur hors ligne, qui est exactement le cas à traiter.

**Dériver l'historique du journal de combat et des tables existantes.** Aucune écriture
nouvelle, mais seuls les combats sont archivés : un contrat honoré, une recherche finie ou
un claim perdu ne laissent aucune trace reconstructible. Et la reconstruction coûterait un
balayage à chaque connexion.

**Un `message: string` rendu par le serveur.** Voir ci-dessus : fige la locale du serveur
dans une donnée persistée à vie.
