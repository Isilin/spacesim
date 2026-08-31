# 0010 — Communication : canaux bornés, courrier durable, silence livré avec

## Statut

Accepté

## Contexte

Le dépôt n'a **aucune** communication entre joueurs. `proposeRelation` est un bouton sans
conversation possible, et la vague B vient d'ajouter des corporations dont les membres ne
peuvent pas se parler.

Trois éléments cadrent la décision :

1. **Le journal d'empire existe déjà** ([ADR 0008](0008-journal-d-evenements-d-empire.md)) :
   durable, redacté par empire, borné, avec un compteur de non-lus et une pastille.
   C'est un canal de *faits*, pas de conversation.
2. **La modération existe à moitié.** Le chantier 23.4 a livré `warn` / `suspend` / `ban` /
   `unban` / `force_logout`, et a explicitement laissé le *mute* hors périmètre — **faute
   de chat à modérer**. Le statut d'un compte se calcule depuis l'historique des sanctions
   (`computeSanctionStatus`), sans seconde source de vérité.
3. **La géographie groupe déjà les joueurs.** Une galaxie contient les systèmes, et un
   empire y a des colonies ou n'en a pas — l'appartenance à une région n'est pas à
   inventer.

## Décision

### Deux canaux, définis par l'appartenance et non par un abonnement

- **`corp`** — les membres de sa corporation.
- **`galaxy`** — les empires ayant au moins une colonie dans cette galaxie.

Aucune table d'abonnement : l'appartenance se **dérive** de l'état du jeu. On ne peut ni
rejoindre ni quitter un canal, on y est parce qu'on y a quelque chose. C'est ce qui rend
la place publique galactique intéressante — les voisins y sont, qu'ils le veuillent ou
non — et ça supprime tout un étage de gestion (invitations, listes, nettoyage au départ).

### Un canal est borné et jetable ; le journal ne l'est pas

`CHAT_KEEP` (200) messages par canal, les plus anciens tombent. Le journal, lui, ne purge
jamais un non-lu : il porte des faits qu'on ne doit **pas** rater. Une conversation, si.
Confondre les deux aurait fait grossir sans fin un objet que personne ne relit.

Le snapshot transporte `CHAT_PAGE` (60) messages par canal auquel l'empire appartient —
deux canaux au plus, donc un plafond dur.

### Le courrier n'est pas du chat, et n'est pas non plus un événement

Le courrier est **dirigé, durable et lu une fois**. Il a un corps, un expéditeur
identifié, un état lu/non lu. Le loger dans `EmpireEvent` aurait été tentant, mais un
événement est purgé quand il a été lu et n'a pas de corps de texte : un message reçu il y
a trois mois doit pouvoir être relu.

En revanche il **réutilise le journal pour prévenir** : recevoir un courrier émet un
`mail_received`. Pas de deuxième mécanisme de notification, pas de deuxième pastille à
tenir cohérente.

### Le silence (`mute`) est livré AVEC le chat, et sur un axe distinct

Le chantier 23.4 avait raison de reporter le mute — il n'y avait rien à taire. Il devient
nécessaire au moment exact où le chat existe, et le livrer après aurait laissé une fenêtre
où le jeu offre une tribune sans aucun moyen d'y couper la parole.

`mute` s'ajoute aux `SANCTION_KINDS` mais **ne passe pas par `computeSanctionStatus`** :
ce calcul décide si un compte peut se connecter, et un joueur réduit au silence joue
normalement. Un second calcul, `computeMuteStatus`, lit le même historique — une seule
source de vérité, deux questions différentes.

Le silence est vérifié **à l'envoi, côté serveur**. Ne pas afficher le champ de saisie est
un confort, jamais la mesure.

### Pas de messagerie privée en temps réel dans cette vague

Le courrier couvre déjà le besoin de s'adresser à quelqu'un. Un canal privé synchrone
demanderait blocage individuel et signalement, c'est-à-dire un étage de modération de plus
que le mute — à décider quand le besoin se manifestera, pas d'avance.

## Conséquences

- Les messages sont **redactés par appartenance**, comme les relations : un canal de
  corporation ne part qu'à ses membres, un canal de galaxie qu'à ceux qui y ont une
  colonie. Un joueur qui perd sa dernière colonie d'une galaxie cesse d'en recevoir le
  canal — c'est cohérent avec « le canal est un lieu ».
- Les empires PNJ ne parlent ni ne reçoivent : ils n'ont personne pour lire, et il faudrait
  leur écrire une politique de conversation.
- Le corps des messages est du texte **écrit par des joueurs**. Il est borné en longueur et
  rendu comme texte, jamais interprété.

## Alternatives écartées

**Des abonnements explicites à des canaux nommés.** Plus souple, et immédiatement plus
lourd : création, droits, nettoyage, canaux morts. Rien dans le jeu ne demande encore un
canal qui ne soit pas déjà un groupe existant.

**Le courrier comme un `EmpireEvent` avec un corps.** Une table de moins — au prix d'un
événement qui n'est plus purgeable (le journal purge les lus) et d'un modèle qui mélange
« ce qui t'est arrivé » et « ce qu'on t'a écrit ».

**Le mute traité comme une suspension courte.** Réutilise tout l'existant, et empêche le
joueur de jouer alors qu'on voulait seulement le faire taire. La sanction ne
correspondrait pas à la faute.
