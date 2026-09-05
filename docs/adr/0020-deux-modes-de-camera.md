# 0020 — Deux modes de caméra, et une sélection qui attrape ce qui est petit

## Statut

Accepté

## Contexte

L'ADR [0019](0019-la-selection-est-l-ancre.md) a supprimé le ballotage en confiant la visée à la
sélection. Essayée manette en main, la carte laisse trois gênes.

**La rotation roule au lieu de tourner.** Le monde de la carte est **Z-haut** de bout en bout :
le plan galactique est XY, l'épaisseur est `MAP_DEPTH` en Z, les systèmes se posent en
`cos → x, sin → y`, l'inclinaison d'une orbite est une rotation autour de X, et les
`gridHelper` portent un `rotation-x` de π/2 pour compenser le Y-haut natif de three.js. Mais
`camera.up` valait `(0,1,0)`, le défaut, **nulle part surchargé**. Un glisser horizontal faisait
donc tourner l'azimut autour de Y : la composante Z passait de `+0,8·d` à `−0,8·d`, la caméra
plongeait sous le disque, et l'image roulait. Le joueur attend un lacet et un tangage.

**L'élection au curseur n'est pas fiable.** Elle désignait l'objet le plus proche du curseur au
premier cran de molette, puis y recentrait. Elle se trompe de cible assez souvent pour que le
joueur préfère ne rien avoir : *pas d'auto-centrage.*

**Presque rien n'est cliquable.** Étoile, comptoir, stations, avant-postes, flottes, sites de
scan, ceintures n'ont **aucun** gestionnaire dans la scène : ils ne sont atteignables que par
leur étiquette ou par la liste DOM. Et ce qui l'est le devient de moins en moins en dézoomant —
le disque de saisie d'une galaxie est un `circleGeometry` qui ne fait pas face à la caméra, donc
quasi impossible à toucher vu par la tranche.

## Décision

### Deux modes, selon qu'on a désigné quelque chose

| | rien de sélectionné — **libre** | un objet sélectionné — **ciblé** |
|---|---|---|
| Molette | homothétie autour du **centre du palier**, qui reste immobile à l'écran | dolly vers la cible, qui ne bouge pas |
| Glisser gauche | rotation autour du **centre du palier** | rotation autour de la **cible** |
| Descendre d'un palier | **impossible** : le zoom se borne à la frontière | c'est la visée qui ouvre la descente |

Remonter reste toujours possible, sans rien avoir sélectionné : sinon le joueur serait piégé au
fond d'un système. Les deux modes se lisent d'une phrase — libre, j'explore ; ciblé, j'entre.

### Le monde est Z-haut, la caméra aussi

`camera.up = (0,0,1)`, posé à la création **et** réaffirmé après chaque mesure de R3F, qui
n'applique les props `camera` qu'une fois. `lookAt` construit son orientation à partir de `up` :
un `up` perdu ne casse rien, il roule simplement l'image, et cela ne se voit pas dans un test.
Le calcul de cadrage passe de `cross(forward, [0,1,0])` à `[0,0,1]` — fortuitement identique
pour la direction de vue actuelle, qui est dans le plan YZ, mais faux en principe et incohérent
avec le même calcul dans `ModelPreview`, déjà en Z-haut.

Un glisser **horizontal** tourne alors autour de Z, la verticale du monde : on fait le tour du
pivot à élévation constante. Un glisser **vertical** tourne autour de l'axe droit de la caméra,
horizontal par construction : on monte et on descend au-dessus du pivot, borné avant le pôle.
Jamais de roulis.

### La rotation est écrite à la main, parce qu'`OrbitControls` ne sait pas pivoter décentré

Il appelle `lookAt(target)` à chaque `update()` : sa cible est **toujours** au centre de
l'écran. Tourner autour d'un point qui n'est pas la cible lui est donc structurellement
impossible — il ramènerait ce point au centre. Or en mode libre le pivot est le centre du
palier, que le panoramique peut avoir décentré.

`orbitAround(pose, pivot, yaw, pitch)` fait tourner la **paire** caméra/cible rigidement autour
du pivot. Leur vecteur tourne d'autant, si bien que le `lookAt` qui suit rend exactement l'image
tournée, et le pivot reste où il est à l'écran. La fonction est pure, dans `tiers.ts`, donc
testable sans WebGL — et le test qui compte énonce la décision elle-même : **un lacet ne change
pas l'élévation au-dessus du plan galactique.** C'est la définition formelle de « yaw et non
roll ».

Le bornage du tangage est **exact et non approché** : l'axe droit est perpendiculaire au vecteur
de vue, donc la rotation se fait dans le plan qui contient ce vecteur et la verticale, et change
l'élévation d'exactement l'angle demandé.

Une seule implémentation sert les deux modes — seul le pivot change. Deux raisons : un ressenti
identique, et un seul chemin à tester. `enableRotate={false}` ; il ne reste à `OrbitControls`
que le panoramique, ce qui est mince pour une dépendance, mais le sien translate en espace écran
et serait le seul gain à le réécrire.

### Le pivot est le centre du palier, le zoom est une homothétie

Sans sélection, on tourne et on zoome autour du **centre de la zone où l'on est** — l'amas, la
galaxie, le système. C'est `parentFocus.center`, que la caméra recevait déjà pour se cadrer. La
carte devient un tourne-disque autour de ce qu'on regarde.

Le pivot fut un instant le point du plan focal **sous le curseur**, pour que le clic désigne ce
autour de quoi on tourne. Trop malin, et écarté à l'essai : le joueur ne savait plus autour de
quoi il tournait. Le centre d'un palier a en prime l'avantage de ne pas bouger — il n'y a rien à
figer au début d'un geste ni à reprendre à chaque cran, et l'intersection rayon/plan focal
disparaît avec lui.

`zoomAbout(pose, pivot, ratio)` homothétise la paire autour de ce point : son seul point
invariant est le pivot, donc le centre du palier ne bouge pas à l'écran. Le `ratio` est celui du
dolly, calculé par `zoomStep` et `dollyEase` comme avant — les bornes de palier et le calibrage
de la molette s'appliquent donc à l'identique dans les deux modes. Seule **l'application**
diffère.

### Le clic est exact d'abord, tolérant ensuite

Les gestionnaires de R3F gardent le chemin exact : cliquer le bord d'une planète qui remplit
l'écran doit la sélectionner, ce qu'un critère « le centre le plus proche » manquerait de loin.
`onPointerMissed` ne se déclenche que si le rayon n'a rencontré aucun objet gestionnaire — c'est
là que le repli rattrape : le plus proche du curseur **dans un rayon de dix-huit pixels**, ou
rien, et alors le clic désélectionne.

La comparaison se fait en **pixels** et non en coordonnées normalisées : celles-ci sont
anisotropes — l'axe x couvre la largeur du cadre — si bien qu'un rayon exprimé en NDC serait
plus large horizontalement sur un écran large.

Le pool de ce repli contient **tout ce qui est à l'écran au palier courant**, y compris les
lunes et tout le manufacturé d'un système. C'est ce qui rend sélectionnable ce qui n'a aucune
géométrie cliquable, sans ajouter un gestionnaire à chaque objet.

### Un seul repère visuel, pour tous les objets

Quatre équerres aux coins d'un carré, en sprite, à taille d'écran bornée entre un plancher — un
objet de trois pixels reste montré du doigt — et un plafond de 40 % de la hauteur du cadre. Il
remplace le grillage sphérique des planètes, qui ne valait que pour elles et qu'il avait fallu
désactiver en dur au palier corps parce qu'il recouvrait l'écran.

Un sprite et non du DOM, pour les raisons de l'ADR 0017 : il est aligné sur l'écran par
construction, ne coûte aucun repositionnement par image, et laisse passer la molette.

## Conséquences

- **Descendre d'un palier demande de viser.** C'est le prix du retrait de l'élection
  automatique, et il est explicite : quatre tests de bout en bout qui descendaient à la molette
  depuis le centre du canvas gagnent un clic de sélection.
- **`OrbitControls` ne fait plus que le panoramique.** La rotation, le zoom et le recentrage
  sont à nous. La dépendance tient encore par son panoramique en espace écran, juste à toute
  échelle ; si elle devait tomber, c'est la seule chose à réécrire.
- **Le retour élastique du panoramique change de cause.** Ce n'est plus une élection au
  relâchement — la carte ne désigne plus rien à la place du joueur — mais le ressort, qui suit
  la sélection et elle seule. Sans rien de sélectionné, un panoramique reste où on l'a laissé.
- **Le panoramique est le seul geste capable de décentrer la vue.** Après lui, la rotation
  pivote toujours autour du centre du palier — donc autour d'un point qui n'est plus au milieu
  de l'écran — et zoomer ramène progressivement la vue vers ce centre, l'homothétie contractant
  tout vers son pivot. C'est cohérent, le pivot étant le centre de la ZONE et non celui de
  l'image, mais ça se dit.
- **`electAnchor` disparaît**, avec ses tests : ses deux appelants étaient les deux élections
  automatiques.
- **`data-map-elevation`** rejoint la famille des témoins DOM. Un roulis ne laisse aucune trace
  observable, et l'image d'arrivée est la même : sans cet angle, la régression est invisible.
- **Le lint passe enfin**, et pour une raison de configuration : `biome.json` n'active que le
  groupe `a11y`, donc `correctness` — et avec lui `useExhaustiveDependencies` — ne tourne jamais.
  Trois suppressions étaient mortes par construction ; la quatrième, la seule utile, ne
  s'attachait pas à son élément parce que deux lignes de commentaire s'étaient glissées entre
  les deux.

## Alternatives écartées

- **Le pivot sous le curseur** — essayé, puis écarté : désigner le pivot en cliquant paraît
  puissant sur le papier, et se traduit à l'usage par une vue dont on ne sait plus autour de quoi
  elle tourne. Le centre du palier est prévisible, et il ne bouge pas.
- **Le glissement doux du point cliqué vers le centre** — écarté par le joueur avant l'essai : il
  voulait l'image strictement préservée. La contrainte reste, et c'est elle qui impose d'écrire
  la rotation : le panoramique peut décentrer le pivot, et `OrbitControls` le recadrerait.
- **Le pivot au centre de l'ÉCRAN** plutôt qu'au centre du palier — identique tant qu'on n'a pas
  fait de panoramique, et indéfendable ensuite : le centre de l'écran ne désigne rien.
- **Ajouter un `onClick` à chaque objet** plutôt qu'un repli tolérant — écarté : dix couches à
  modifier, et cela ne règle pas le fond, qui est qu'un objet de trois pixels est difficile à
  toucher même quand il porte un gestionnaire.
- **Comparer les distances en coordonnées normalisées** — écarté : anisotropes, donc un rayon
  en pixels y serait faux, et le corriger par le rapport d'image refait à la main ce que la
  projection contient déjà.
- **Allumer le groupe `correctness` de biome** pour que les suppressions redeviennent utiles —
  écarté ici : c'est un chantier sur tout le dépôt, pas une ligne dans celui-ci. Les
  justifications restent en commentaire, prêtes à redevenir des directives.
- **Garder la rotation d'`OrbitControls` en mode ciblé** (où le pivot est la cible, donc
  centré), et n'écrire la nôtre que pour le mode libre — écarté : deux ressentis différents pour
  un même geste, et deux chemins à tester.
