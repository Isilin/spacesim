# 0011 — Relations entre corporations et standings gradués

## Statut

Accepté

## Contexte

Après les vagues A à C du chantier 32, la politique du jeu tient dans deux objets :

1. **`Relation`** — une paire canonique empire↔empire avec quatre états
   (`neutral` / `nap` / `alliance` / `war`). C'est elle qui décide si `attackFleet` et
   `attackColony` sont permis (`atWar`), et quel palier d'accès de station un visiteur
   franchit (`canTradeAtStation`).
2. **`Corporation`** ([ADR 0009](0009-corporations-entite-de-premier-rang.md)) — un groupe
   d'empires avec des rôles et un coffre, dont le sigle est public.

Il manque exactement ce qui fait la politique d'un jeu de ce genre : **les corporations ne
peuvent pas se déclarer la guerre**, et rien ne permet à un tiers de lire une position
autrement qu'en binaire. Deux corporations rivales doivent aujourd'hui déclarer *n×m*
guerres individuelles, que chaque membre peut défaire seul en faisant la paix.

## Décision

### Une relation de corporation réutilise `RelationState`, elle n'invente pas son échelle

Mêmes quatre états, même paire canonique, mêmes règles de transition. Une seconde
énumération aurait imposé de traduire l'une dans l'autre à chaque contrôle
(`atWar`, `canTradeAtStation`) — et la question posée est identique : ces deux camps
peuvent-ils se tirer dessus, commercer, s'allier.

### La guerre de corporation prime sur la paix individuelle

`atWar(a, b)` devient vrai si **les empires** sont en guerre **ou** si **leurs
corporations** le sont. Un membre ne peut pas s'en extraire par une paix personnelle :
sinon la déclaration de guerre d'une corporation ne vaudrait rien, chacun la défaisant
pour son propre compte.

La conséquence est assumée : rejoindre une corporation, c'est hériter de ses guerres. Le
départ reste libre — c'est le prix et le contrepoids.

### Les standings sont gradués, portés par la corporation, et ils gouvernent une chose

Un standing est un entier de **−10 à +10** qu'une corporation attribue à un empire ou à
une autre corporation. Il est **public** : c'est tout son intérêt, il rend la position
d'un tiers lisible sans avoir à la deviner.

Un standing purement décoratif ne vaudrait pas sa table. Il gouverne donc un point précis
et un seul : un nouveau palier d'accès de station, `standing`, ouvert à quiconque le
propriétaire (ou sa corporation) note à `STANDING_TRADE_MIN` ou plus. C'est le palier qui
manquait — les autres décrivent des appartenances (`corp`, `alliance`, `nap`), aucun ne
décrit une **opinion**.

Il ne gouverne délibérément **pas** le droit d'attaquer : celui-ci est déjà décidé par
l'état de relation, et un second mécanisme concurrent rendrait la règle illisible.

### Les états de corporation ne se proposent pas, ils se posent

Contrairement aux pactes entre empires (qui exigent le consentement de la cible via
`RelationProposal`), un officier pose l'état que sa corporation adopte : `war` et
`neutral` unilatéralement, `nap` et `alliance` seulement si l'autre camp a déjà posé le
même — la réciprocité fait l'accord, sans machinerie de proposition en attente.

Cela évite de dupliquer tout l'étage `RelationProposal` pour les corporations, et
correspond mieux au fait qu'une corporation a des officiers : la décision est déjà
collective par la structure.

## Conséquences

- `atWar` est consulté par `FleetService` (attaques) et par la présence étrangère. Son
  élargissement change donc le jeu partout où la guerre compte, sans nouveau point
  d'appel.
- Les changements d'état d'une corporation passent par le journal d'empire
  ([ADR 0008](0008-journal-d-evenements-d-empire.md)) vers **tous les membres du camp
  d'en face** : une guerre déclarée pendant qu'ils dorment est exactement le cas que le
  journal existe pour couvrir.
- Une corporation dissoute emporte ses relations et ses standings (cascade en base) : ils
  ne décrivent plus rien.
- Aucun standing PNJ. La réputation de faction (`factionRep`, chantier 15) est un
  mécanisme distinct, déjà en place, et les mélanger ferait deux sources de vérité pour
  « ce que les PNJ pensent de moi ».

## Alternatives écartées

**Une échelle numérique unique remplaçant `RelationState`.** Plus élégante sur le papier —
et elle demande de rejouer tous les seuils de `canTradeAtStation`, `atWar`,
`declareWarReason`, plus une migration des relations existantes, pour une expressivité que
les quatre états couvrent déjà.

**Des standings qui gouvernent aussi le droit d'attaquer.** Deux mécanismes concurrents
pour la même question : un joueur ne saurait plus lequel regarde le jeu quand il clique
sur « attaquer ».

**Des propositions de pacte entre corporations, calquées sur `RelationProposal`.** Tout un
étage de plus (émission, réponse, annulation, expiration) pour un résultat que la
réciprocité obtient en deux gestes symétriques.
