# 0015 — Carte à zoom continu, paliers imbriqués sans rebasage

## Statut

Accepté — **partiellement renversée** par l'ADR
[0017](0017-navigation-orbitale-et-etiquettes.md), qui retire le zoom-au-curseur et le
panoramique, et fait du double-clic un vol sans fiche.

## Contexte

La carte avait **quatre niveaux** — univers, galaxie, système, corps — choisis par une
chaîne de ternaires sur un niveau déduit des segments de l'URL. Changer de niveau démontait
un canvas pour en monter un autre, et `FitCamera` claquait la caméra d'un cadrage à l'autre.
Aucune transition, aucun fondu : le seul mouvement de toute la carte était l'inertie
d'`OrbitControls`.

Le niveau corps était par ailleurs le seul des quatre à n'être pas de la 3D : un schéma SVG
figé de 320 px, sans zoom, où les lunes restaient à leur angle initial et n'avançaient
jamais — alors que la simulation les fait tourner depuis l'ADR
[0006](0006-univers-volumetrique-deux-echelles.md).

Côté sélection, un clic écrivait `?focus=` et le détail apparaissait dans un panneau latéral
fixe de 340 px. Sélectionner une galaxie n'ouvrait **rien** : le panneau ne calculait de
contenu qu'à partir du niveau galaxie. Ceintures et sites de scan n'avaient aucun
gestionnaire de clic.

La demande est un zoom continu à la Stellaris : une seule carte, traversée sans rupture, où
sélectionner ouvre une infobox posée sur l'objet et où l'ouverture pleine se fait en modale
sans quitter la carte.

Deux décisions écrites encadrent ce travail, et il les renverse toutes deux :
`docs/design.md` acte « LOD par niveau de carte » (chantier 31) et « double-clic réservé à
l'ouverture des sous-cartes » (polish carte du 24/07/2026).

## Décision

### Des paliers imbriqués, rendus à plat

Mesuré sur le générateur : l'amas s'étend sur ~3 700 unités quand une lune se rend à un
rayon de 5 dans le repère de son système. Composés, les facteurs d'imbrication donnent un
rapport d'échelle de ~10⁶ entre les deux bouts de la carte — un seul espace de coordonnées
est exclu.

Chaque palier garde donc **son propre repère local**. Les placements sont cumulés depuis la
racine et appliqués **à plat** : chaque couche vit dans un `<group position scale>` frère
des autres, jamais imbriqué dans le précédent. Démonter un palier ne déplace alors rien de
ce qui reste à l'écran — c'est la propriété qui rend le franchissement invisible.

Au plus **deux paliers voisins** sont montés à la fois, et les seuils de fondu sont calés
pour que la couche démontée soit déjà entièrement transparente : le fondu ne masque pas le
franchissement, il le rend sans objet.

### Pas de rebasage de caméra

La parade classique à un tel rapport d'échelle est le *floating origin* : rebaser la caméra
à chaque franchissement. **Il n'y en a pas**, pour deux raisons vérifiées à l'écriture du
code.

three.js ne passe jamais de position monde au shader : il compose
`modelViewMatrix = matrixWorldInverse × matrixWorld` en float64 côté CPU et n'envoie que le
résultat — une translation **relative à la caméra**, donc petite dès que l'objet est regardé
de près. La dérive de sommets que le rebasage devait éviter n'existe pas sur ce chemin de
rendu.

Et le rebasage coûterait un défaut bien réel : un `setState` depuis `useFrame` ne prend effet
qu'à l'image suivante, si bien qu'une image serait rendue avec la nouvelle caméra et l'ancien
graphe — un éclair à chaque palier, précisément ce qu'on cherchait à éviter.

Ce qui reste sensible à l'échelle, ce sont les **plans de coupe**. `MapCanvas` ne fixait que
`far` ; le `near` par défaut de three.js vaut 0,1 et découperait purement et simplement une
lune regardée à 0,02 unité. Ils suivent désormais la distance de vue, en gardant `far / near`
sous 10⁵.

### La bande se définit par deux distances de cadrage

La progression entre deux paliers se mesure entre `fitDistance()` du palier courant et
`fitDistance()` de l'enfant **déjà imbriqué**. La déduire du seul facteur d'échelle
supposerait que parent et enfant se cadrent à la même distance dans leurs repères respectifs,
ce qu'aucune paire de paliers ne vérifie — un système ne se cadre pas comme la galaxie qui le
contient.

### L'URL décrit la caméra, pas une hiérarchie

`/map?at=<id>&z=<profondeur>&open=<id>` remplace les quatre routes imbriquées. Un chemin de
segments ne sait pas dire « à mi-chemin entre la galaxie et le système », et c'est
précisément l'état que la carte doit pouvoir rendre après un rechargement. `at` nomme l'objet
dans lequel la caméra **est**, la fraction de `z` décrivant déjà la descente en cours.

L'écriture de l'URL **ne supprime jamais** ce qui est visé : seul un geste explicite le fait.
La carte publie sa position en continu, et déduire une intention de navigation d'un changement
d'URL faisait boucler les deux sens l'un sur l'autre.

### Sélectionner, ouvrir

Un clic simple ouvre une infobox ancrée sur l'objet ; un clic dans le vide la referme, via
`onPointerMissed` de R3F — la seule API qui sache dire que le rayon n'a rencontré aucun objet.
Un double-clic **vole** jusqu'à l'objet ~~**et** ouvre sa fiche~~ — l'ADR 0017 lui a retiré
l'ouverture de fiche, qui rendait la modale bloquante après chaque descente.

Une infobox posée sur la carte est **transparente aux événements**, son bouton excepté. Elle
est ancrée sur l'objet qu'on vient de choisir, donc sur celui vers lequel on va zoomer :
opaque, elle avale la molette et la carte cesse de répondre exactement là où le joueur
regarde. Le décalage latéral ne suffit pas — il ne traite que le cas où le curseur tombe sur
l'ancre.

Elle ne prend pas le focus, sous peine de retirer à la section les raccourcis de caméra. Sa
fermeture au clavier ne peut donc pas venir du `Popover` lui-même, qui lie sa touche à son
propre nœud : c'est la page qui écoute Échap tant qu'une sélection existe.

## Conséquences

- **Sélectionner ne déplace pas la cible de la caméra**, contrairement à ce que prévoyait le
  plan. Le geste demandé est « simplement sélectionner ouvre l'infobox » ; faire paner la vue
  à chaque clic le contredirait. Viser se fait à la molette — elle suit le curseur — ou au
  double-clic, qui vole.
- ~~**Le double-clic ne peut plus s'enchaîner** pour descendre~~ — **corrigé par l'ADR
  0017** : le double-clic vole désormais sans ouvrir de fiche, et les descentes
  s'enchaînent. La fiche s'obtient par le bouton de l'infobox.
- Le palier corps devient une vraie scène 3D, et `BodyView` perd son schéma orbital : il
  disait la même chose que la carte, en figé.
- Le fil d'Ariane disparaît, faute de niveaux à remonter. Le retour se fait à la molette, ou
  par la recherche et les raccourcis de `MapNav`.
- Deux paliers dessinés pendant une transition. Mesuré : la transition univers→galaxie coûte
  environ 5 % du budget d'images par rapport au repos.
- Tout ce qui se calcule par image — profondeur, opacités, suivi d'un corps en orbite — est
  tenu **hors de l'état React**. Un `setState` par image re-rendrait l'arbre soixante fois par
  seconde. Seules les décisions discrètes (quel objet est visé, quand monter l'enfant, quand
  franchir) traversent React, et elles se comptent sur les doigts d'une main par traversée.
- Une caméra 3D ne laisse aucune trace dans le DOM : `data-map-tier` et `data-map-depth`
  s'ajoutent à `data-map-fits` (chantier 31.24) comme seuls points observables de l'extérieur.
  Tous trois sont écrits depuis la **même** horloge, la boucle d'images — le palier venait
  d'un effet React et pouvait rester en retard d'un commit sur la profondeur.

## Alternatives écartées

- **Rebasage de caméra type *floating origin*** — écarté, voir ci-dessus : il corrige un
  défaut que three.js n'a pas, et en introduit un qu'il n'avait pas.
- **Un seul espace de coordonnées, sans imbrication** — écarté : ~10⁶ de rapport d'échelle,
  au-delà de ce que tiennent le float32 des matrices GPU et le tampon de profondeur.
- **Imbriquer les couches les unes dans les autres** plutôt que de les rendre à plat —
  écarté : démonter un parent déplacerait alors la transformée de son enfant, ce qui est
  exactement le saut qu'on cherche à éviter.
- **Garder la hiérarchie de chemin dans l'URL** en la réinterprétant comme une ancre —
  écarté : elle ne sait pas encoder une profondeur intermédiaire, et elle mentirait sur la
  nature de la vue.
- **Cascade de franchissements pour les sauts explicites** — écarté après mesure : laisser la
  caméra redécouvrir les paliers un par un faisait dépendre l'arrivée d'une course entre la
  boucle de rendu et les rendus de React, et la traversée s'arrêtait par intermittence au
  palier intermédiaire. Un saut sait où il va ; il pose son palier d'arrivée.
