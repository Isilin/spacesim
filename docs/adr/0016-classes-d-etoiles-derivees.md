# 0016 — Classes d'étoiles et morphologies dérivées de l'identifiant

## Statut

Accepté

## Contexte

L'ADR [0007](0007-habillage-3d-procedural-et-parametrique.md) a fixé que tout l'habillage
serait procédural, dérivé du seed et des champs déjà modélisés. Elle énumère ce qu'il fallait
habiller — galaxies, étoiles, planètes, lunes, astéroïdes, vaisseaux, stations — et note que
« les énumérations à habiller sont petites : 6 `PlanetType`, 6 `ChassisKind`… ».

Elle n'avait pas prévu que **certaines de ces énumérations n'existent pas**. Le modèle ne
porte ni classe d'étoile ni morphologie de galaxie : `StarBody` rendait la même étoile pour
les ~2 000 systèmes d'un univers plein, et `GalaxyCloud` la même spirale à deux bras pour
les 200 galaxies. La demande de peupler visuellement la carte — trous noirs compris — bute
donc sur une donnée absente.

Deux contraintes encadrent l'ajout :

1. **ADR [0002](0002-univers-materialise-en-db.md)** — une galaxie matérialisée ne change
   plus par régénération. Ajouter une colonne « classe d'étoile » demanderait de régénérer
   l'univers : gratuit aujourd'hui, impossible après le lancement du serveur officiel.
2. **ADR 0007** — l'apparence du contenu *manufacturé* est éditable au CMS, mais les corps
   astronomiques en sont explicitement exclus : « `PLANET_TYPES` est une énumération de
   modèle, pas un domaine de contenu ».

## Décision

### Dérivé de l'identifiant, jamais persisté

`starClassOf(system)` et `galaxyMorphologyOf(galaxy)` sont des fonctions **pures** de
`packages/shared`, qui tirent leur résultat d'un générateur pseudo-aléatoire semé par
l'identifiant. C'est le patron déjà en place : `bodyPhysicals()` tire rayon, gravité,
température et atmosphère de `hash(body.id)`, `sitesOfSystem()` tire les sites du seed sans
jamais les stocker.

Zéro colonne, zéro migration, zéro bump de `GENERATOR_VERSION`. Le résultat est identique
côté client et côté serveur, stable d'une session à l'autre, et l'extension de l'univers en
cours de partie (`ensureFrontier`) ne change pas le ciel des systèmes déjà visités.

### La classe se LIT du contenu

Un trou noir avec cinq mondes habitables serait absurde. Le tirage est donc **conditionné par
ce que le système contient déjà** :

- Les reliques — trou noir, pulsar, naine blanche — ne sont possibles que là où le meilleur
  monde reste sous 41 d'habitabilité. Le seuil vient des fourchettes du générateur, pas d'un
  réglage à vue : un monde tellurique naît entre 55 et 90, un gelé plafonne à 40. Sous 41 il
  n'y a que du gelé, du volcanique et du gaz — rien qui vaille d'être pris.
- La taille de l'étoile suit l'étendue de ses orbites, que le joueur voit déjà à l'écran.
- Une galaxie dense s'organise en spirale, une pauvre reste irrégulière.

La classe devient ainsi une **lecture** de la donnée existante plutôt qu'un tirage
indépendant qui la contredirait.

### Purement cosmétique

Aucune de ces valeurs n'entre dans l'économie, l'habitabilité, l'exploration ou le combat.
Elles n'existent que pour que deux systèmes ne se ressemblent pas. C'est dit ici parce que
rien dans le code ne l'empêcherait — et que la tentation d'en faire un modificateur de
gisement serait la première à venir.

## Conséquences

- Le rendu gagne six classes d'étoiles et quatre morphologies sans que le modèle bouge d'une
  ligne, donc sans invalider les parties en cours — ce que l'ADR 0002 rendait autrement
  impossible après le lancement.
- **En faire une donnée de jeu deviendrait coûteux.** Si une classe devait un jour modifier
  un rendement ou une portée, il faudrait la persister pour que le serveur en fasse foi, donc
  une colonne et une migration. Cette ADR est le point où cette bascule se déciderait.
- Les seuils sont calibrés sur les fourchettes du générateur : les changer changerait le ciel
  de tout l'univers d'un coup. Un test verrouille les deux propriétés qui comptent — aucune
  relique là où un monde est habitable, et des reliques rares **mais présentes**. La seconde
  a servi dès le premier réglage : l'univers de référence n'en comptait aucune.
- Le trou noir ne rend pas de lentille gravitationnelle. L'effet demande une passe qui
  échantillonne l'arrière-plan pour le courber, or le canvas est rendu en `alpha: true` et
  n'a pas d'arrière-plan — le fond vient du thème CSS, derrière le canvas. Il n'y a rien à
  courber, et une passe de post-traitement sur toute la carte ne s'échangerait contre rien de
  visible.

## Alternatives écartées

- **Ajouter les colonnes au générateur** — écarté : régénération de l'univers obligatoire,
  gratuite aujourd'hui et impossible après le lancement officiel (ADR 0002). Le bénéfice —
  une valeur en base plutôt qu'une fonction pure — serait nul tant que la classe reste
  cosmétique.
- **Tirer la classe indépendamment du contenu** — écarté : rien n'empêcherait un trou noir
  d'éclairer une colonie prospère, et la carte contredirait la fiche du système.
- **Ouvrir les classes au CMS** comme le contenu manufacturé — écarté : l'ADR 0007 exclut
  explicitement les corps astronomiques de ce mécanisme, et en faire un domaine de contenu
  est une décision séparée qui n'a pas de demande derrière elle.
- **Une lentille gravitationnelle en post-traitement** — écarté, voir ci-dessus : il n'y a
  pas d'arrière-plan à courber.
