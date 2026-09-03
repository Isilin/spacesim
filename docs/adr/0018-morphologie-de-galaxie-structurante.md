# 0018 — La morphologie de galaxie devient structurante

## Statut

Accepté

## Contexte

L'ADR [0016](0016-classes-d-etoiles-derivees.md) a posé une règle claire : la classe d'étoile
et la morphologie de galaxie se **dérivent** de l'identifiant, sans colonne ni migration, et
restent **purement cosmétiques** — « aucune de ces valeurs n'entre dans l'économie,
l'habitabilité, l'exploration ou le combat ».

Le chantier 36 a rendu la traversée univers → galaxie → système → corps continue, au pixel
près (ADR [0015](0015-carte-a-zoom-continu.md), [0017](0017-navigation-orbitale-et-etiquettes.md)).
Il a du même coup rendu visible une contradiction que la carte 2D masquait :

- au palier **univers**, `GalaxyCloud` peignait une spirale à bras de 160 étoiles, dérivée de
  la morphologie ;
- au palier **galaxie**, le générateur posait **7 à 14 systèmes tirés uniformément au hasard**
  dans un pavé de 880 × 580 × 200.

Les deux lois de forme n'avaient aucun rapport. On zoomait sur une spirale et on atterrissait
sur dix points sans structure : le palier univers promettait une galaxie que le palier galaxie
ne livrait pas. Aucune quantité de travail sur le fondu ne pouvait réconcilier deux objets qui
n'avaient en commun ni leur forme ni leur nombre.

## Décision

**La morphologie devient une entrée du générateur.** C'est elle qui décide où sont posés les
systèmes ; le nuage du palier univers n'est plus une illustration mais un **rendu des
positions réelles**, projeté par la même échelle que le palier galaxie
(`galaxyContentScale`). La correspondance entre les deux paliers cesse d'être une
ressemblance : c'est la même arithmétique de part et d'autre du fondu.

Trois conséquences suivent.

### 1. Le nombre de systèmes passe de 7-14 à 300-520

Une spirale ne se lit pas à quatorze points. Le berceau en compte 520, les autres galaxies
300 à 500 — l'ordre de grandeur d'une galaxie « Medium » de Stellaris. Le rayon du disque suit
`√n` (`GALAXY_RADIUS_PER_ROOT_SYSTEM`), ce qui tient la **densité constante** : la longueur
d'arête moyenne ne bouge pas (194,6 avant, 197,6 après), donc `JUMP_REFERENCE_LENGTH` et les
constantes de `balance.ts` gardent leur sens sans être retouchées. Juge : `travel.calibration.test.ts`.

### 2. Les bras ne sont pas seuls : 40 % des systèmes peuplent l'inter-bras

Un bras de galaxie est une onde de densité, pas un ruban de matière dans le vide. Poser tous
les systèmes sur les bras donnait deux longues chaînes que le graphe de sauts suivait en file
indienne — diamètre mesuré **276 sauts** sur 520 systèmes, soit un corridor et non un réseau.
Avec 40 % d'inter-bras, le graphe redevient un maillage à deux dimensions (diamètre médian 59)
et le contraste de densité, ≈ 4,5 pour 1, laisse la spirale parfaitement lisible.

### 3. La morphologie reste DÉRIVÉE, jamais persistée

`galaxyMorphology(id, systemCount)` ne lit que l'identifiant de la galaxie et son nombre de
systèmes, tous deux relus de la base. Aucune colonne, aucune migration : l'ADR 0002 tient. Le
client la retrouve à l'identique. Ce qui change par rapport à l'ADR 0016 n'est donc pas le
mécanisme mais la **portée** : la classe d'étoile reste une lecture d'après coup, la
morphologie est devenue une cause.

### 4. Deux flux RNG, et non un

La **géométrie** se tire de `layout:<galaxyId>` — l'identifiant seul. Le **contenu** (noms,
planètes, gisements, comptoirs) reste sur `seed:galaxy:<index>`, dérivé de la seed de partie.

Cette séparation n'est pas cosmétique : elle rend les positions re-dérivables sans connaître
la seed, et c'est elle qui a permis de cesser de transmettre la seed au client (voir plus bas)
sans rien perdre.

## Conséquences

### Ce qu'on gagne

- La promesse du palier univers est tenue : on descend dans la galaxie qu'on regardait.
- La morphologie porte enfin une information — une elliptique se joue autrement qu'une
  spirale barrée, parce que son graphe de sauts est autre.
- Une galaxie matérialisée **avant** ce chantier (positions uniformes) reste cohérente avec
  elle-même : son nuage vient de ses positions, quelles qu'elles soient. L'ADR 0002 n'impose
  aucune reprise.

### Ce qu'on paie

- **Charge réseau.** L'univers part en entier à chaque `hello` et à chaque changement
  d'exploration, sans pagination : 6 Ko pour quatre galaxies avant, 227 Ko après. D'où le
  **condensé** — une galaxie que le joueur ne peut ni atteindre ni explorer n'est plus
  transmise qu'en fiche, compte de systèmes et nuage de 150 points. Un joueur neuf reçoit
  ~73 Ko au lieu de 227. Verrou : `universe.payload.test.ts`.
- **La seed ne part plus au client.** Elle partait, avec un générateur déterministe livré dans
  le paquet du navigateur : n'importe quel client pouvait reconstruire les planètes et les
  gisements que le brouillard prétend cacher. Le type `ClientUniverse` rend l'omission
  vérifiable par le compilateur.
- **Mémoire du serveur.** 1,59 Mo de tas par galaxie, soit ~320 Mo au plafond de
  `MAX_GALAXIES` contre ~9 Mo avant. Mesuré, assumé, et écrit à côté de la constante.
- **Rendu.** Cinq cents nœuds et un millier d'arêtes par galaxie ont imposé l'instanciation,
  une géométrie de nœud grossière (8×6 segments), un raycast rayon-sphère plutôt que
  rayon-triangles, et un budget d'étiquettes. Sans quoi le palier galaxie tombait à 10
  images par seconde. Juge : `map3d.spec.ts`, qui mesure désormais AUSSI le palier galaxie.
- **Traverser une galaxie coûte ~8× plus de sauts** (diamètre médian 7 → 59). Les constantes
  par saut n'ont **pas** été divisées pour autant : la mesure montre qu'un trajet ordinaire ne
  s'allonge pas — les empires démarrent groupés (`STARTER_CLUSTER_RADIUS`) et leurs voisins
  restent à quelques sauts. Seule la traversée complète coûte plus cher, ce qui est
  précisément ce qu'une galaxie plus vaste doit signifier. Diviser aurait rendu la logistique
  de proximité quasi gratuite et vidé de son sens la couche orbitale de l'ADR
  [0004](0004-logistique-deux-stocks-sol-orbite.md).

### Ce qui reste ouvert

- Le condensé rend une galaxie hors de portée **visible mais vide** : on peut y descendre et
  n'y trouver que son nuage. Acceptable tant qu'aucun portail ne l'ouvre ; à revoir si le jeu
  donne un jour une raison d'inspecter une galaxie qu'on ne peut pas atteindre.
- `MAX_GALAXIES` est maintenu à 200 sur la foi d'une mesure de tas synthétique. Le chiffre à
  suivre est celui d'un serveur réel en charge.

## Alternatives écartées

- **Garder le pavé et densifier.** Aurait divisé la longueur d'arête moyenne par six, donc le
  prix d'un saut, et obligé à recalibrer `JUMP_REFERENCE_LENGTH` et tout `balance.ts` — une
  dérive d'économie pour un choix de forme.
- **Garder un nuage procédural partageant la même loi que le générateur.** Correspondance de
  forme, mais pas de position : au fondu, les points n'auraient pas coïncidé, et il aurait
  fallu tenir deux implémentations synchronisées de la même loi.
- **Comprimer les trames WebSocket (`perMessageDeflate`) plutôt que découper l'envoi.** Essayé,
  mesuré à un facteur quatre sur ces données, puis retiré : comprimer 270 Ko par joueur et par
  poussée coûtait assez de latence pour qu'un aller-retour dépasse cinq secondes (A/B sur les
  specs à deux sessions). Le bon levier n'est pas de comprimer un envoi trop gros, c'est de ne
  pas l'envoyer.
