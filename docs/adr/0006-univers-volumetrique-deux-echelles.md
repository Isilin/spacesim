# 0006 — Univers volumétrique à deux échelles, positions dérivées du tick

## Statut

Accepté

## Contexte

La géométrie de l'univers est aujourd'hui décorative. `universe_galaxies.x/y` et
`universe_systems.x/y` sont des colonnes `integer` 2D ; `universe_planets.orbit_radius/
orbit_angle` décrivent une orbite polaire dont l'angle est **figé** — aucune planète ne
tourne. Ces coordonnées servent une fois, à la génération, pour tirer les liens de saut
(deux plus proches voisins puis forçage de connexité), après quoi plus aucune règle ne
les lit.

Tout le coût de déplacement passe par `jumpDistanceInUniverse()`, un BFS qui compte des
**sauts**, pas une distance. Six services en dépendent : `contract`, `exploration`,
`fleet`, `gateway`, `industry`, `logistics`. Autrement dit, deux systèmes voisins dans le
graphe coûtent le même prix qu'ils soient collés ou à l'opposé de la galaxie.

La demande est de rendre l'univers réellement tridimensionnel, dans l'interface **et**
dans les mécaniques. Trois contraintes encadrent ce travail :

1. **ADR 0003** — `TickRunner.run()` est une boucle synchrone et la RAM fait autorité,
   la DB étant écrite en arrière-plan via `WriteSet`/`Persister`. Des positions qui
   changent à chaque tick et qui seraient persistées saliraient ~12 000 corps par tick.
2. **ADR 0002** — une galaxie matérialisée ne change plus par régénération. La
   contrainte ne mord toutefois que sur un univers de production ; aucun serveur
   officiel n'est lancé à ce jour, seul un univers de dev jetable existe.
3. `universe.fixture.json` est gelé et `universe.fixture.test.ts` impose que toute
   régénération s'accompagne d'un bump de `GENERATOR_VERSION` dans le même commit.

## Décision

### Deux échelles, pas une

- **Entre systèmes** — le graphe de sauts est conservé, mais chaque arête est pondérée
  par sa **longueur 3D réelle**. `jumpDistanceInUniverse()` passe d'un BFS à un Dijkstra
  pondéré, en gardant sa signature.
- **Dans un système** — l'espace est **continu** en 3D, et les corps orbitent dans le
  temps. C'est à cette échelle seulement qu'une position est une coordonnée plutôt qu'un
  identifiant.

Un espace continu qui remplacerait le graphe partout emporterait avec lui l'exploration,
le brouillard, la revendication de système et la portée de combat — tous définis sur des
systèmes discrets. La séparation en deux échelles est ce qui rend la 3D réelle sans
re-spécifier le jeu entier.

### Les positions se dérivent, elles ne se stockent pas

Persisté, immuable, généré une fois : `orbitRadius`, `orbitAngle` (angle **initial**),
`inclination`, `ascendingNode`, et la vitesse angulaire `ω` dérivée du rayon.

Calculé à la demande : `bodyPositionAt(body, tick)`, fonction pure de la forme
`angle(t) = angle₀ + ω·t`. Une flotte en transit persiste
`{fromId, toId, departTick, arriveTick}` et sa position s'interpole à la lecture.

Le volume d'écriture reste donc celui d'aujourd'hui, `TickRunner.run()` reste
synchrone, et le rattrapage au boot (`catchUp()`) reste déterministe puisque la position
est fonction du seul numéro de tick.

### Le combat reste aspatial

`resolveBattle()` garde sa forme : résolution instantanée sur compositions de flottes et
directives, une fois les deux flottes dans le même système. La 3D intra-système ne pèse
pas sur le combat dans ce chantier.

### La régénération est libre, une fois

`GENERATOR_VERSION` est bumpé et `universe.fixture.json` régénéré dans le même commit.
L'univers de dev est jeté (`docker compose down -v`), ce qui est sans conséquence
aujourd'hui et impossible après le lancement officiel.

## Conséquences

- **Ce chantier a une échéance dure : avant le lancement du serveur officiel.** La
  régénération de l'univers et le recalibrage économique qu'entraîne le passage aux
  distances pondérées sont tous deux gratuits tant qu'aucun joueur n'existe, et
  irréalisables ensuite. C'est la vraie raison de le faire maintenant plutôt qu'après
  les chantiers 28-30.
- Le coût de trajet change de nature pour six services. Pour que le recalibrage reste
  une passe de réglage et non une réécriture, le poids des arêtes est **normalisé de
  sorte que l'arête moyenne vaille 1** : la valeur retournée reste comparable au compte
  de sauts actuel, et les constantes existantes gardent leur ordre de grandeur.
- Les orbites comptent dans la simulation : un transfert intra-système vers un corps en
  opposition coûte plus cher qu'à la conjonction. Les ETA deviennent variables, ce que
  le protocole et l'UI doivent exposer. L'ascenseur orbital (ADR 0004) n'est pas
  concerné — il est vertical, sol↔orbite d'un même corps.
- `apps/web` gagne une dépendance de rendu lourde (`react-three-fiber`). Un canvas est
  opaque aux lecteurs d'écran : l'accessibilité clavier obtenue en 27.21 sur
  `ZoomableSvg` ne se transpose pas, il faudra une liste DOM parallèle en plus d'une
  caméra pilotable au clavier. La parité mobile de 27.22 est également à re-vérifier
  sous WebGL.
- La numérotation ne suit pas l'ordre d'exécution : 29 (AdonisJS) et 30 (remplacement de
  `composeEngine`) sont déjà réservés par l'ADR 0005, ce chantier prend donc le **31**
  tout en s'exécutant avant eux. Même précédent qu'au chantier 27, où renuméroter avait
  été écarté.

## Alternatives écartées

- **3D de présentation seule** (caméra 3D sur un modèle resté 2D) — écartée par
  l'utilisateur : la demande porte explicitement sur les calculs et les mécaniques, pas
  seulement sur l'interface.
- **Espace continu partout, sans graphe de sauts** — écartée : supprimer les liens oblige
  à re-spécifier exploration, brouillard, revendication, portée de combat et logistique
  d'un seul coup. C'est un autre jeu, pas une évolution de celui-ci.
- **Distance euclidienne pure à la place du graphe pondéré** — écartée : le vol d'oiseau
  ignore la topologie que le joueur lit sur la carte, et rend les goulots d'étranglement
  stratégiques (systèmes de passage) sans effet.
- **Persister les positions orbitales à chaque tick** — écartée : ~12 000 corps salis par
  tick dans le `WriteSet`, en contradiction frontale avec l'ADR 0003, pour une
  information intégralement dérivable du numéro de tick.
- **Backfill d'un `z` sur l'univers existant** — inutile ici puisque la régénération est
  libre ; ce serait la seule voie après le lancement officiel.
