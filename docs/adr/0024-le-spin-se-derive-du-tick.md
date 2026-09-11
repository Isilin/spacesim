# 0024 — Le spin se dérive du tick, comme la position

## Statut

Accepté

## Contexte

L'[ADR 0006](0006-univers-volumetrique-deux-echelles.md) a fait des positions orbitales une
fonction pure du numéro de tick : rien n'est persisté, tout se dérive. Le chantier 50 ajoute une
seconde grandeur — la rotation propre des corps —, et trois constats en ont décidé la forme.

- **Les orbites sont réglées pour le jeu, pas pour l'œil.** Le chantier 31.9 a calé
  `PLANET_KEPLER_CONSTANT` sur la période synodique (médiane 19,5 h) : attendre la conjonction
  raccourcit un transfert de 21 %, et un ETA annoncé au départ reste exact. Une planète y
  parcourt un degré par minute ; à l'écran, un pixel toutes les vingt secondes environ.
  Personne n'avait jamais vu une orbite bouger.
- **Le jour était plus long que l'année.** `bodyPhysicals` tirait une durée du jour de 8 à 90 h
  pour des révolutions de 2 à 51 h, et recalculait la révolution par une seconde loi de
  Kepler, incompatible avec celle que l'écran applique.
- **Le tick fractionnaire calait.** Borné à zéro, il figeait toute la scène après chaque tick
  pendant le retard d'horloge du client, puis la faisait bondir. Rien ne bougeait assez vite
  pour que cela se voie.

## Décision

1. **Le spin se dérive, il ne se stocke pas.** `SpinElements` — obliquité, nœud de l'axe,
   période, phase, sens — se tire de l'identifiant du corps, dans le flux `body:${id}` de
   `bodyPhysicals`, hors du générateur ; l'angle vaut `spinAngleAt(el, tick)`. Ni colonne, ni
   octet sur le fil.
2. **Deux échelles de temps, assumées.** L'orbite reste réglée pour la stratégie ; le spin, qui
   ne décide de rien, est réglé pour être vu — 24 à 240 ticks par tour. Une contrainte les lie :
   un jour libre est toujours plus court que la révolution la plus rapide du jeu.
3. **Le verrouillage par marée se lit de la géométrie.** Une planète l'est sous un rayon qui
   suit `M^(1/3)` ; une lune, sous 40 unités de sa planète. Verrouillé, un corps tourne au
   rythme de son orbite depuis sa phase orbitale, et garde sa face. Seul le verrouillage
   stellaire coûte en habitabilité, et seulement à qui manque d'atmosphère : c'est la seule
   sortie du générateur qui change (version 13).
4. **Deux renversements.** Les sites de scan orbitent (`sitePosition(site, tick)`), contre la
   décision du chantier 31.11. L'excentricité entre dans le modèle pour une seule famille
   dérivée, les géocroiseurs, par un type à part (`EccentricElements`) — jamais pour les corps
   du générateur.
5. **Le tick fractionnaire n'est pas borné.** Continu en l'heure du client quel que soit le
   décalage d'horloge : la seule forme qui ne cale pas.

## Conséquences

- Le mouvement devient visible sans toucher la calibration d'aucune mécanique :
  `orbits.calibration.test.ts` n'a pas bougé.
- Le verrouillage devient une observation : sur une même vue, un monde verrouillé reste figé
  quand son voisin tourne.
- Les galaxies déjà matérialisées gardent leur habitabilité en base pendant que leur fiche,
  dérivée de l'identifiant, affiche le verrouillage. Acceptable avant le lancement du serveur
  officiel ; ce ne le serait plus après.
- Le palier système écrit davantage par image : un scalaire par corps, quatre-vingt-dix
  matrices par ceinture, deux géocroiseurs au plus.
- Sous « réduire les animations », les rotations décoratives se figent et les positions
  avancent par pas de tick.

## Alternatives écartées

- **Accélérer les orbites** : viderait la seule mécanique du jeu où attendre paie, et casserait
  sa calibration.
- **Une échelle de temps visuelle distincte de la simulée** : la carte mentirait sur la position
  réelle d'un corps, et `intraSystemCost` contredirait l'écran — ce que `geometry.ts` interdit
  dès son en-tête.
- **Persister le spin** : aucun lecteur n'en a besoin, et l'ADR 0003 refuse d'écrire ce qui se
  dérive.
- **L'excentricité dans `OrbitalElements`** : chemin chaud de tous les corps et du coût de
  trajet, migration et bump, pour un gain décoratif.
- **Faire tourner les galaxies au palier univers** : le nuage de points y est le positionnement
  réel des systèmes. Le tourner désalignerait les paliers que le zoom continu enchaîne, et une
  galaxie tourne en différentiel — ce serait enrouler ses bras.
- **Faire tourner les singularités** : leur disque tourne déjà, et un horizon absolument noir
  n'a aucune face à montrer.
