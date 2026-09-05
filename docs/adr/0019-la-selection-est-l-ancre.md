# 0019 — La sélection est l'ancre de la caméra

## Statut

Accepté — **partiellement renversée** par l'ADR
[0020](0020-deux-modes-de-camera.md), qui retire l'élection au curseur — la carte ne désigne
plus rien à la place du joueur — et le recentrage automatique qui la suivait, retour élastique
du panoramique compris. Ce qui reste : la sélection est l'ancre, et le recentrage ne suit
qu'elle.

## Contexte

L'ADR [0017](0017-navigation-orbitale-et-etiquettes.md) a donné une carte qui se traverse à la
molette sans rupture. À l'usage, un défaut domine tous les autres, décrit manette en main :
**la vue ballotte de droite à gauche et de haut en bas avant de réussir à centrer sa cible.**

Ce n'était pas un réglage à ajuster, mais une boucle de rétroaction fermée sans amortissement.
`TierCamera` faisait deux choses à chaque image :

1. il **élisait** sa cible — le candidat le plus proche du centre du cadre, sans hystérésis ni
   temps de garde ;
2. il **tirait** le cadre vers cette cible.

Le second déplaçait le point depuis lequel le premier mesurait. Deux objets à peu près
équidistants suffisaient donc à faire basculer l'élection d'une image à l'autre, ce qui
inversait la traction. Et chaque bascule ne coûtait pas qu'un glissement latéral : elle
changeait le cadrage de l'enfant, donc la progression dans la bande, donc les bornes de dolly —
la vue glissait *et* le zoom hoquetait.

Trois aggravations s'y ajoutaient. Au palier univers, élection et recentrage ne visaient pas le
même point : les candidats donnaient l'origine d'une galaxie, le recentrage le centre de la
boîte englobante de ses systèmes. Le recentrage ne s'appliquait qu'en descente active, donc par
rafales — s'arrêter en cours de bande laissait la cible décentrée jusqu'au cran suivant. Et sa
constante était une fraction **par image**, deux fois et demie plus rapide sur un écran à
144 Hz que sur un écran à 60 — le défaut que `dollyEase` avait déjà corrigé pour le zoom.

Sous ces symptômes, une seule cause : **trois autorités se disputaient `controls.target`** —
l'élection par image, le recentrage, le vol — et aucune ne savait ce que le joueur voulait.

L'ADR 0017 avait posé le bon diagnostic — le panoramique et le zoom-au-curseur faisaient perdre
de vue l'objet sur lequel on zoomait — mais en avait tiré la mauvaise conclusion. Retirer le
panoramique n'a pas rendu la cible fiable : il l'a rendue **automatique**. C'est le zoom qui
choisissait ce qu'on visait. Une entrée, deux sens.

## Décision

### La sélection est l'ancre

Une seule notion remplace les trois. Ce que le joueur a sélectionné est ce que la caméra vise,
et **le zoom ne choisit plus jamais quoi viser** — il ne fait que la profondeur.

L'invariant, précisément : `anchors` est **l'ascendance** jusqu'au palier courant, plus la
sélection **quand elle est l'enfant immédiat de ce palier**. L'ascendance n'est écrite que par
le franchissement descendant, le saut externe et le double-clic ; le créneau de visée n'est
écrit par personne — il est *lu* de `selectedId`. Les deux fonctions qui le portent,
`slotIdFor` et `pathFor`, sont pures et testées à l'unité.

Cette séparation est ce qui rend l'invariant tenable. L'ascendance ne doit jamais avoir de
trou : sans elle, le cadrage d'un corps retombe sur celui de l'amas. La visée, elle, peut
parfaitement être nulle — c'est « rien à viser », le dolly est alors borné à la frontière du
palier.

### Trois façons de viser, toutes explicites

- **Cliquer** un objet, dans la scène ou dans la liste. Immédiatement : le délai de 250 ms
  disparaît.
- **La molette**, au premier cran d'une bande, quand rien n'est visé : on élit l'objet le plus
  proche du curseur, et on le **sélectionne**. Une élection par bande, jamais par image.
- **Glisser** au panoramique : ce qu'on trouve au relâchement devient la sélection.

L'élection au curseur n'est pas le zoom-au-curseur que l'ADR 0017 a retiré, et la distinction
porte tout : la caméra ne dérive pas vers le curseur, elle recentre sur l'objet désigné. Le
curseur ne sert qu'à désigner, une fois.

Elle se fait en **espace écran**, pas par un cône angulaire dans la scène. Un cône se règle sur
une tangente, donc sur le demi-champ vertical : sur un écran large, un objet près du bord
gauche est parfaitement visible et pourtant hors du cône, et il faudrait le rattraper par le
rapport d'image — c'est-à-dire refaire à la main ce que la matrice de projection contient déjà.
En coordonnées normalisées, **c'est le cadre qui borne**, et le critère devient littéralement ce
que le joueur veut dire.

### Le panoramique revient, sur le bouton droit

`enablePan`, et rien d'autre : `mouseButtons` garde son défaut, où le bouton droit panoramique
déjà. C'est le chemin que la bibliothèque teste elle-même, et le bouton droit n'a qu'un défaut
de navigateur à neutraliser — le menu contextuel — dont `OrbitControls` se charge. Le bouton du
milieu aurait déclenché le défilement automatique de Chrome sous Windows, à supprimer par un
`preventDefault` qu'aucun test n'atteint.

Glisser devient une façon de viser, et non plus un moyen de se perdre : le ressort ramène la
vue sur ce qu'elle vise. Si le glisser n'a rien rencontré, la visée précédente est conservée et
c'est vers elle qu'on revient — le retour élastique.

### Le recentrage est un filtre, pas un ressort

`smoothFactor(halfLife, dt)` est partagé par le dolly et par le recentrage : il n'y a plus deux
amortissements différents dans le même fichier, et la demi-course en secondes est la seule
unité de raideur qui ait un sens.

C'est un **filtre exponentiel**, délibérément, et non le ressort amorti de `maath/easing` qu'on
aurait pu prendre tout fait. Sa source tranche la question : `damp` retient une **vitesse** d'une
image à l'autre. Or les deux grandeurs lissées ici — la distance de vue et la cible — sont
déplacées à chaque image par d'autres mécanismes : le vol, le franchissement, le suivi d'un
corps en orbite. Un ressort lirait ces déplacements comme un mouvement qu'il a produit, et en
rendrait l'élan au premier relâchement.

Le recentrage vise `selection.at` — **la fonction qui place déjà l'infobox**. Élection et
recentrage ne peuvent donc plus diverger : ce n'est plus une coïncidence à maintenir, c'est le
même appel, et la boîte est posée là où la caméra arrive.

### Plus aucun pilotage clavier de la caméra

`CameraKeys` disparaît, et avec lui `role="application"`, le `tabIndex` et l'indice clavier de
la section. Un rôle qui confisque le clavier au lecteur d'écran sans plus rien en faire lui
refuse ses propres raccourcis en échange de rien. L'accès clavier **aux objets** reste entier
par `MapList`, que l'ADR 0017 pose déjà comme le seul chemin accessible.

### Les événements souris passent à `@use-gesture/react`

L'écouteur de molette posé à la main, son `passive: false`, son `preventDefault` et la
normalisation des amplitudes sortent du code du jeu. La bibliothèque ramène l'événement en
pixels quel que soit son `deltaMode` — Firefox compte en **lignes** sur une molette, et la
valeur brute y vaut trois au lieu de cent, ce que notre code lisait comme un micro-défilement
de pavé tactile. Le même appel porte l'`onDrag` qui suspend le ressort et distingue le
panoramique de la rotation : un seul endroit décrit ce que la souris est en train de faire.

Ce qui reste à nous est du domaine : le pas de zoom calibré sur la bande (`bandSpan / 12`),
l'accélération au défilement soutenu, l'élection, l'invariant d'ancre.

## Conséquences

- **Le double-clic sélectionne d'abord, puis vole.** C'est ce qui rend son premier clic
  inoffensif : l'infobox décrit la cible du vol et la suit, au lieu d'être ouverte puis
  remplacée. Il n'y a plus de contradiction à arbitrer, donc plus de quart de seconde à payer
  sur chaque clic simple.
- **Le premier cran de molette ouvre une infobox**, puisqu'il sélectionne. Le budget d'images
  se mesure donc désormais avec un `<Html>` de drei à l'écran.
- **Sélectionner une feature efface la visée** — comptoir, station, ceinture, site n'ont pas de
  palier sous eux. Le cran suivant élit sous le curseur et remplace l'infobox. Le double-clic
  garde son rôle : il les ramène au centre.
- **Ouvrir une fiche efface la visée**, puisque `openSheet` vide la sélection pour qu'une
  seule boîte reste à l'écran. La caméra garde sa pose ; le prochain cran de molette élit sous
  le curseur. L'ancre survivait auparavant parce qu'elle était indépendante de la sélection —
  c'est exactement l'indépendance que cet ADR supprime.
- **Une descente engagée ne s'annule qu'en reculant.** Effacer la sélection referme l'infobox,
  mais la sélection *est* la visée : l'effacer en pleine descente viderait le créneau enfant et
  démonterait la couche au milieu du fondu qui la fait apparaître. La visée est donc retenue
  tant que la couche enfant est montée.
- **Un vol ne franchit plus de palier en chemin.** Il en traverse — c'est ce qu'on lui demande —
  mais il pose lui-même son palier d'arrivée, qu'il connaît. Le laisser franchir en passant
  était sans conséquence tant que le franchissement ne touchait qu'au palier ; depuis qu'il
  écrit l'ascendance, un franchissement parasite au palier univers y remettait `systemId` à
  zéro. Pour la même raison, un vol matérialise sa **destination entière** : `tier` décrit
  encore l'origine pendant qu'il dure.
- **`data-map-aim`** rejoint `data-map-fits`, `data-map-tier`/`data-map-depth` et
  `data-map-labels` sur la section hôte. Le ballotage était un changement de cible par image, et
  une cible de caméra ne laisse aucune trace dans le DOM : sans ce compteur, la régression est
  invisible et l'image d'arrivée est la même. `data-map-keys` disparaît avec le clavier.
- **Deux dépendances explicites** — `@use-gesture/react`, catalogué avec la famille 3D. Elle
  était déjà dans l'arbre en transitive de drei ; pnpm étant strict, l'importer demande de la
  déclarer.

## Alternatives écartées

- **`maath/easing` pour l'amortissement** — écarté après lecture de sa source : `damp` est un
  ressort à vitesse retenue, et les deux grandeurs lissées ici sont bougées à chaque image par
  d'autres mécanismes. Il rendrait l'élan d'un geste qui n'a pas eu lieu. Son epsilon est en
  outre absolu, là où la carte couvre six ordres de grandeur.
- **`camera-controls` (drei `<CameraControls>`)** — écarté pour ce chantier, malgré son
  `dollyTo`, son `setTarget` animé et son événement `rest`, qui remplaceraient d'un coup
  `OrbitControls`, notre dolly, `CameraJump` et `FitCamera`. Son pas de dolly est un
  `dollySpeed` scalaire, sans équivalent au calibrage par bande que l'ADR 0017 a justifié par
  mesure (9 crans contre 35) ; il possède la caméra, alors que le suivi d'orbite lui écrit
  dessus à chaque image ; et il déplacerait toute la vérification sensible au temps. Le chantier
  corrige un ballotage, il ne change pas de bibliothèque de caméra.
- **Une hystérésis sur l'élection par image** — écarté : cela traite le symptôme et laisse la
  boucle fermée. Le zoom continuerait de choisir ce qu'on vise.
- **L'élection par cône angulaire** — écarté : le demi-champ vertical exclut ce qui est visible
  près des bords d'un écran large, et le corriger par le rapport d'image refait à la main ce que
  la matrice de projection contient déjà.
- **Le panoramique au bouton du milieu** — écarté : le défilement automatique de Chrome sous
  Windows demanderait un `preventDefault` qu'aucun test ne couvre, et le bouton droit est la
  liaison par défaut d'`OrbitControls`.
- **Écrire notre propre panoramique** — écarté : celui d'`OrbitControls` translate en espace
  écran, donc du même nombre de pixels à toute distance. Rien à calibrer sur une carte qui
  couvre six ordres de grandeur.
- **Le zoom-au-curseur** — reste écarté, comme au 0017 : avec la sélection pour ancre il
  n'apporte plus rien, et il n'existe qu'en déplaçant la cible.
