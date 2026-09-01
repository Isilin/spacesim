# 0017 — Navigation orbitale, et les noms dans la scène

## Statut

Accepté

## Contexte

L'ADR [0015](0015-carte-a-zoom-continu.md) a donné une carte qui se traverse sans rupture.
À l'usage, six choses gênent, toutes constatées manette en main :

- Les noms vivaient dans une colonne de 210 px prise en permanence sur la carte. Lire la
  carte demandait un aller-retour permanent entre le canvas et cette liste.
- Le double-clic ouvrait une fiche **en plus** de voler. Son premier clic ouvrait l'infobox,
  aussitôt remplacée par la modale : la carte clignotait à chaque descente, et la modale
  étant bloquante, il fallait Échap entre deux.
- Le panoramique et le zoom-au-curseur déplaçaient la cible n'importe où, y compris dans le
  vide entre deux objets. On perdait de vue l'objet sur lequel on zoomait.
- Le zoom sautait. `OrbitControls` amortit la rotation mais applique le dolly d'un bloc, et
  son pas fixe de ~5 % par cran demandait une trentaine de crans par palier — plus de cent
  de l'amas à une lune.
- Le nœud d'un système avait une taille fixe en unités **monde** : il grossissait en zoomant,
  puis cédait la place à une étoile ~35× plus petite dans le même repère.
- Un disque coloré à 0,12 d'opacité recouvrait les étoiles de chaque galaxie.

## Décision

### La caméra tourne autour de ce qu'elle regarde

Panoramique et zoom-au-curseur sont retirés. La cible est posée au centre du palier courant,
et **seul un vol la déplace**. La molette ne fait plus que la profondeur, le glisser que
l'orbite.

**Viser passe donc par le double-clic.** C'est la conséquence directe et il faut la nommer :
quand l'objet convoité n'est pas au centre, il n'y a plus moyen de l'amener sous le curseur
en glissant. Le double-clic vole jusqu'à lui, et la molette continue depuis là.

Le recentrage progressif de `TierCamera` change de rôle sans changer de code : il ne corrige
plus la dérive du curseur, il **réalise** la visée en amenant la cible sur l'ancre à mesure
qu'on s'engage dans la bande.

### Le zoom se calibre sur la bande, et glisse

`OrbitControls` perd le dolly. Un cran vaut désormais `bandSpan / 12` : la largeur de la
bande à traverser divisée par le nombre de crans qu'on veut y mettre. Le seul réglage est ce
nombre de crans — la seule quantité qui ait un sens pour le joueur — et la vitesse **suit
l'échelle** sans qu'aucune valeur absolue n'ait à être choisie. Un défilement soutenu
accélère jusqu'à ×2,5, plafonné : traverser d'un trait et s'arrêter à une profondeur précise
sont deux gestes différents.

La molette écrit une distance *visée* ; l'image en cours s'en rapproche, en **logarithme** —
un zoom se vit en octaves, et une interpolation linéaire irait vite au loin et s'endormirait
de près dans une même course. Mesuré : neuf crans pour descendre d'un palier, contre une
trentaine.

### Les noms sont des objets de scène, pas du DOM

Les étiquettes doivent être cliquables. Un élément DOM cliquable est opaque aux événements,
**molette comprise** — c'est le défaut corrigé au chantier 35.12 sur l'infobox, où une seule
boîte suffisait à rendre la carte insensible au zoom là où le joueur regardait. Multiplié par
des dizaines d'étiquettes posées sur les objets qu'on vise, il rendrait la carte
impraticable.

Un sprite se clique par le raycast et laisse la molette au canvas, puisqu'il **est** le
canvas. Il évite en prime le repositionnement DOM que drei fait à chaque image pour chaque
`<Html>`.

Un nom n'apparaît qu'au-delà d'un seuil de **taille apparente** — une vingtaine de pixels de
large. C'est ce seuil, et lui seul, qui borne le nombre d'étiquettes à l'écran : un univers
plein compte deux cents galaxies.

**La texture d'un nom se crée à sa première apparition**, jamais au montage de la couche.
Rastériser vingt noms dans un canvas 2D puis les téléverser coûtait un pic d'une demi-seconde
qui tombait exactement au moment où l'on arrive dans un système — pour des étiquettes dont
deux seulement se voyaient.

### Le chemin accessible se replie sans disparaître

La liste DOM passe en surimpression, derrière un bouton, l'état retenu d'une session à
l'autre. Elle reste **le seul chemin clavier et lecteur d'écran** vers les objets : un canvas
WebGL ne publie ni structure ni texte, et les sprites du paragraphe précédent sont tout aussi
opaques. Les étiquettes doublent sa lecture visuelle, elles ne la remplacent pas.

La sortir du flux la met aussi hors du chemin de la molette : l'écouteur de zoom vit sur la
section du canvas, dont le panneau n'est pas un descendant.

### Un point reste un point, une galaxie reste des étoiles

Le nœud d'un système garde sa taille **à l'écran** pendant tout le palier galaxie, et ne
converge vers la taille de l'étoile réelle que dans la bande, pendant que le fondu échange
les deux couches.

Les galaxies perdent leur disque peint. Leurs étoiles passent en mélange additif et gardent
une taille en **pixels** : en dézoomant elles se resserrent sans rapetisser, et se fondent
d'elles-mêmes en une lueur. C'est ce que le disque simulait. Il reste dans la scène pour
porter le clic, mais n'écrit plus rien — `visible={false}` l'aurait retiré du raycast et
rendu les galaxies incliquables.

## Conséquences

- **L'ADR 0015 est renversée sur deux points qu'elle avait écrits noir sur blanc.** Le
  zoom-au-curseur (« sans cela le zoom continu est inutilisable dès qu'on veut choisir sa
  galaxie ») : il l'était surtout parce que rien d'autre ne visait, et le double-clic s'en
  charge mieux. Le double-clic bloquant (« il faut la refermer pour continuer à naviguer ») :
  les descentes s'enchaînent désormais.
- **Le clic simple attend un quart de seconde.** C'est le prix pour qu'un double-clic
  n'ouvre pas au passage une infobox qu'il va remplacer.
- **Deux étiquettes voisines peuvent se chevaucher.** Aucune déconfliction n'est faite : elle
  demanderait un placement par image sur des rectangles écran, et le seuil de taille
  apparente limite déjà le nombre d'étiquettes simultanées.
- **Un test de budget d'images doit laisser la scène se poser.** Celui du chantier 31.17
  mesurait dans la seconde suivant le montage d'une couche, donc le montage lui-même : la
  même configuration rendait 17 ou 60 images selon l'humeur de la machine. La mesure ne
  voulait rien dire tant qu'elle n'attendait pas.
- Le budget est tenu : univers 51-61 (référence 59-62), système 37-55 (référence 37-48),
  **conteneur `app` arrêté** — laissé debout, il dispute le processeur au pilote OpenGL
  logiciel et fait tomber la mesure de moitié.

## Alternatives écartées

- **Étiquettes en `<Html>` de drei** — écarté : cliquables, elles seraient opaques à la
  molette sur toute leur surface, et posées précisément sur les objets qu'on vise. C'est le
  défaut du 35.12 multiplié par le nombre d'objets nommés.
- **Garder le zoom-au-curseur avec la cible verrouillée** — écarté : les deux se
  contredisent, le zoom-au-curseur ne fonctionnant qu'en déplaçant la cible.
- **Régler la vitesse de zoom en pourcentage par cran** — écarté : la carte couvre six ordres
  de grandeur, et un pas absolu est imperceptible au palier univers et brutal au palier
  corps. Le nombre de crans par palier, lui, se règle une fois.
- **Supprimer la liste DOM** puisque les noms sont dans la scène — écarté : elle est le seul
  accès clavier et lecteur d'écran aux objets, et les sprites n'y changent rien.
- **Rastériser toutes les étiquettes au montage** — écarté après mesure : la moitié du budget
  d'images de la première seconde, pour des noms dont deux se voient.
- **Ne pas nommer les lunes au palier système** pour alléger — écarté après mesure : une fois
  la rastérisation rendue paresseuse, elles ne coûtent plus rien, et la demande était de
  nommer tout ce qui dépasse le seuil.
