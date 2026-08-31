# 0014 — Densité décorative des objets manufacturés

## Statut

Accepté

## Contexte

L'[ADR 0013](0013-registre-holographique-des-apercus.md) a donné aux aperçus d'objets
manufacturés un registre holographique et des silhouettes autorées par classe. Elle n'a pas
donné de **densité**. Les chiffres, relevés après livraison du chantier 33 :

| Objet | Pièces rendues |
|---|---|
| Coque standard nue | 10 |
| Croiseur de bataille nu | 12 |
| Croiseur de bataille entièrement garni | 27-31 |
| Station à cinq zones et cinq installations | 33 |

Aucune de ces pièces n'est du **détail de surface** : ni plaque, ni couture de panneau, ni
trappe, ni radiateur, ni greeble. Le diagramme **2D** du même vaisseau, lui, porte quinze à
vingt-quatre éléments autorés à la main (`HULL_ART` : contour, plaques, nacelles, accents,
greebles, lignes de détail). La vue 3D est donc, en densité, plus pauvre que la vue 2D
qu'elle est censée compléter.

La cible demandée — un concept art de vaisseau *hard-surface*, en version holo — se compte
en **centaines** de pièces par objet. Or un plan de vaisseau compte une dizaine de modules
et une station une dizaine de zones. **Il n'y a pas assez de données dans le modèle de jeu
pour justifier une pièce sur dix.** C'est cette tension que l'ADR tranche.

L'ADR 0007 énonce en conséquence :

> le lien « mon vaisseau ressemble au plan que j'ai conçu » est préservé

Prise au pied de la lettre — *tout ce qu'on voit correspond à une donnée* — cette phrase
plafonne le rendu à une trentaine de pièces pour toujours.

## Décision

**On sépare la structure signifiante de la surface décorative, et on autorise la seconde.**

### La structure reste signifiante

Continuent de porter une information de jeu, et ne bougent pas :

- le profil de coque, dérivé de la classe de châssis ;
- les modules montés, leur **rôle** (la forme) et leur **emplacement** (la couleur et la
  position) ;
- les tuyères, seule lueur du vaisseau, comptées par le profil et le palier de tonnage ;
- les zones bâties d'une station, leur type, leurs coursives, leurs installations ;
- les zones en file, rendues en fantôme.

Retirer un module retire ce qu'il ajoutait. Cette promesse-là est intacte.

### La surface est décorative

Plaques, coutures de panneau, trappes, ailettes de radiateur, grappes d'antennes, greebles :
**aucun ne veut dire quoi que ce soit individuellement.** Compter les trappes d'une coque
n'apprend rien sur le vaisseau. C'est de l'habillage, et l'ADR l'assume comme tel plutôt que
de laisser croire à une information qui n'existe pas.

### Mais la décoration reste une empreinte du plan

Le détail décoratif est tiré de `seedOf` sur l'**identité du plan** — classe de châssis et
liste de modules. Deux plans différents ne se décorent pas pareil ; un même plan se décore
toujours pareil, sans que rien ne soit persisté. Ce n'est pas du bruit aléatoire : c'est une
signature.

La promesse forte de l'ADR 0007 — *tout ce qu'on voit vient d'une donnée* — est donc
remplacée par une promesse faible mais vérifiable : **la décoration est une fonction du
plan.** Le chantier 34 en fait un test.

### La densité impose de fusionner les géométries

Trois cents pièces rendues une par une, ce sont six cents appels de rendu et neuf cents
matériaux pour un seul objet. Les pièces sont donc **fusionnées par teinte** en un maillage
et un jeu d'arêtes par teinte, à la construction. Ce n'est pas une optimisation
opportuniste : sans elle la densité visée est inatteignable, et c'est ce qui la rend
structurante.

Les arêtes de chaque pièce sont calculées **avant** la fusion, sur la pièce isolée : c'est
la seule façon de préserver le seuil d'angle propre à chacune, qui est ce qui distingue une
couture de panneau d'un fil de fer.

## Conséquences

- **Le nombre de pièces n'est plus une information.** Il devient un paramètre de rendu, avec
  une fourchette attendue par classe, gardée par des tests — la densité ne peut plus
  repartir vers le bas sans qu'on le voie.
- **Les fonctions de composition restent pures.** `shipLayout`, `stationLayout` et la
  nouvelle bibliothèque de détail ne connaissent ni three.js ni le DOM. C'est ce qui permet
  de tester la densité et son déterminisme sans harnais WebGL (ADR 0013).
- **La lecture en additif a un plafond.** Le mélange additif est indépendant de l'ordre —
  c'est pourquoi il a été choisi — mais il s'accumule : au-delà d'un certain nombre de faces
  superposées, le centre de l'objet vire au blanc. L'opacité de base des faces baisse en
  conséquence, et **ce sont les arêtes qui portent la lecture**. Trop d'arêtes tue aussi la
  lecture : la densité a un optimum, pas un maximum.
- **Le budget d'images devient une contrainte de conception**, plus une simple vérification.
  L'e2e mesure sur un pilote OpenGL logiciel ; si le seuil tombe, c'est la densité ou la
  fusion qu'on ajuste, jamais l'assertion.
- **Le repli générique de l'ADR 0007 reste obligatoire.** Un châssis ou un type de zone
  inconnu du moteur rend une forme neutre — décorée, mais neutre.
- Ce que ça rend plus difficile : **expliquer une forme**. Devant une saillie de coque, la
  réponse « c'est décoratif » est désormais possible, et elle n'était pas possible avant.
  C'est le prix assumé.

## Alternatives écartées

**Ne décorer que là où une donnée le justifie.** La promesse forte de l'ADR 0007, tenue.
Elle plafonne un vaisseau garni à une trentaine de pièces, très loin de la cible, et laisse
la 3D moins dense que le diagramme 2D d'à côté. C'est exactement le statu quo qui a fait
naître ce chantier.

**Inventer des données pour justifier le détail** — sous-modules, points d'ancrage, niveaux
d'usure. Le rendu cesserait d'être décoratif, au prix d'un modèle de simulation gonflé pour
des raisons d'apparence, persisté à jamais dans un univers qui ne se réinitialise pas
(ADR 0002). Faire porter à la simulation le coût d'un choix esthétique est le mauvais sens
de la dépendance.

**Des fichiers d'assets modélisés.** La contrainte de l'ADR 0007 est inchangée et n'est pas
rouverte ici : pas de pipeline d'assets, pas de budget d'artiste, et une station dont la
forme dépend de ce que le joueur a bâti ne se modélise pas à l'avance.

**Du bruit procédural sur la coque** — déplacement, texture. Écarté par l'ADR 0007 pour la
bonne raison : le bruit ne fabrique pas d'identité. Il ajouterait de la matière sans ajouter
de lecture, et en holo, la lecture vient de l'arête franche — que le bruit détruit.

**Instanciation plutôt que fusion.** Un `InstancedMesh` par forme réduirait aussi les appels
de rendu, et il est le bon outil quand les mêmes pièces se répètent à l'identique. Nos
pièces varient toutes en dimensions ; il faudrait une matrice d'échelle non uniforme par
instance, qui fausse les normales, donc la frange de Fresnel — l'effet même sur lequel le
registre repose.
