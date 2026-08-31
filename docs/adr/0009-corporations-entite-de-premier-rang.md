# 0009 — Corporations : entité de premier rang, appartenance exclusive, coffre en crédits

## Statut

Accepté

## Contexte

Le chantier 32 vise le tissu social. L'état du dépôt à l'ouverture de sa vague B :

1. **Le seul lien entre joueurs est `Relation`** — une paire canonique `(empireA, empireB)`
   avec un état (`neutral` / `nap` / `alliance` / `war`). C'est une arête, pas un groupe :
   elle n'a ni membres, ni rôles, ni bien commun.
2. **Un vocabulaire de rôles existe déjà**, mais pour l'administration :
   `packages/protocol/src/admin.ts` définit des actions namespacées
   (`content.techs.write`) et une table `ROLE_PERMISSIONS` par rôle. La *forme* est bonne ;
   le contenu ne l'est pas — ce sont les pouvoirs des opérateurs du jeu.
3. **Les biens sont situés.** L'[ADR 0004](0004-logistique-deux-stocks-sol-orbite.md) impose
   que tout ce qui embarque passe par l'ascenseur orbital : une ressource est toujours
   quelque part, au sol ou en orbite d'un corps précis. Les crédits sont la seule valeur
   fongible et sans lieu.
4. **Les stations ont déjà une politique d'accès** (`StationMarketAccess`, chantier 25) :
   `closed` / `alliance` / `nap` / `public`, résolue par `canTradeAtStation` contre l'état
   de relation entre visiteur et propriétaire.

## Décision

### Une corporation est une entité de premier rang, pas une relation

`Corporation` a son identité, son nom, son coffre, et une table d'appartenance
`(empireId, corporationId, role)`. Représenter un groupe de *n* membres par des relations
deux à deux demanderait *n(n−1)/2* arêtes à maintenir cohérentes, et une arête n'a de
toute façon aucun endroit où porter un rôle ou un solde commun.

### Une corporation n'est pas un empire

Elle n'a ni colonie, ni flotte, ni recherche, ni brouillard. La réutilisation d'`Empire`
aurait traîné population, colonies, exploration et un `snapshotForEmpire` obligé de gérer
un empire sans corps — pour un gain nul, puisque rien de ce que fait une corporation ne
ressemble à ce que fait un empire.

### L'appartenance est exclusive

Un empire appartient à **au plus une** corporation. Deux appartenances rendraient
ambigus à la fois « le coffre » et la résolution des permissions, et ouvriraient une
faille évidente : rejoindre toutes les corporations pour accéder à toutes leurs stations.

### Les rôles reprennent la FORME des rôles admin, pas leur table

Actions namespacées (`corp.invite`, `corp.treasury.withdraw`…) et une table
rôle → permissions. Mais une énumération distincte : un rôle d'administration gouverne
les opérateurs du jeu, un rôle de corporation gouverne une organisation de joueurs.
Partager l'énumération ferait fuiter `content.techs.write` dans un contrôle de corporation
et rendrait toute évolution de l'une dépendante de l'autre.

Trois rôles suffisent au premier jet : `member` (voir), `officer` (inviter, exclure,
retirer du coffre), `founder` (tout, plus les rôles et la dissolution). Le fondateur est
unique et son rôle ne se retire pas — sinon une corporation peut se retrouver sans
personne pour la dissoudre.

### Le coffre ne contient que des crédits

Les ressources sont situées ([ADR 0004](0004-logistique-deux-stocks-sol-orbite.md)) : un
coffre de métaux sans lieu serait un téléporteur, et casserait exactement l'invariant
logistique que le jeu défend. Les crédits n'ont pas de lieu — ils vivent déjà dans
`Colony.resources.credits` et se déplacent sans convoi.

Le dépôt et le retrait passent donc par une colonie du membre, comme toute autre
transaction de crédits, et le solde du coffre est une valeur unique portée par la
corporation.

### Le « hangar commun » est un palier d'accès, pas un entrepôt

Le besoin — mettre du matériel en commun — est satisfait sans violer l'ADR 0004 en
ajoutant un palier `corp` à `StationMarketAccess` : les membres commercent à la station
d'un autre membre, **en s'y rendant**. Le partage garde un coût logistique, ce qui est le
propre du jeu.

Un entrepôt possédé *par la corporation elle-même* reste hors périmètre : il suppose
qu'une corporation possède des structures, donc qu'elle ait un territoire, une file de
construction et une position — une décision d'un autre ordre, à prendre séparément.

## Conséquences

- `canTradeAtStation` prend un argument de plus (même corporation ou non). Le palier
  `corp` est plus restrictif qu'`alliance` : il se place entre `closed` et `alliance`.
- Les changements d'appartenance (invitation reçue, exclusion, dissolution) passent par le
  journal d'empire ([ADR 0008](0008-journal-d-evenements-d-empire.md)) : ils arrivent
  typiquement pendant que le joueur concerné n'est pas là.
- La corporation est **partagée, pas redactée** : son nom et son étiquette sont publics,
  comme un nom d'empire. Seuls le solde du coffre et la liste détaillée des rôles ne
  partent qu'à ses membres.
- Aucune corporation PNJ : les empires PNJ n'en créent ni n'en rejoignent. Rien ne les
  ferait jouer, et il faudrait leur inventer une politique.

## Alternatives écartées

**Étendre `Relation` avec un état `corporation`.** Zéro table nouvelle — et zéro endroit
où mettre un rôle, un solde, un nom. Le graphe complet à maintenir à chaque départ de
membre est un coût permanent pour une économie ponctuelle.

**Une corporation = un empire d'un genre nouveau (`kind: "corp"`).** Réutilise la
persistance et les projections existantes, mais impose de rendre facultatif tout ce qui
définit un empire, et fait apparaître des corporations dans les classements et le
brouillard.

**Un coffre à ressources.** Attendu par les joueurs, mais il téléporte de la matière entre
membres et vide l'ADR 0004 de son sens. Le palier `corp` donne le même service en gardant
le trajet.
