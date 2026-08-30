# 0007 — Habillage 3D procédural et paramétrique, aucun fichier d'asset

## Statut

Accepté

## Contexte

L'ADR [0006](0006-univers-volumetrique-deux-echelles.md) décide du *modèle* : univers
volumétrique à deux échelles, positions dérivées du tick. Elle ne dit rien du *rendu* —
or passer la carte en `react-three-fiber` (chantier 31, vague D) pose immédiatement la
question de ce qu'on affiche réellement. Tous les corps doivent avoir une apparence :
galaxies, étoiles, planètes, lunes, astéroïdes, vaisseaux, stations.

Trois éléments du dépôt cadrent la réponse :

1. **L'univers est procédural.** `generateUniverse(seed, …)` produit ~2 000 systèmes et
   ~12 000 corps de façon déterministe. Livrer un fichier de géométrie par corps serait
   incohérent avec un univers qui n'existe pas avant d'être tiré.
2. **La représentation paramétrique existe déjà, en 2D.** `apps/web/src/ShipHullDiagram.tsx`
   construit une silhouette de vaisseau à partir de `chassisId` et des modules montés ;
   `StationDiagram.tsx` rend la grille hexagonale de croissance issue de
   `sim/industry/station-layout.ts`. Le lien « ce que je vois est ce que j'ai conçu »
   est déjà acquis et vaut d'être préservé.
3. **Les énumérations à habiller sont petites** : 6 `PlanetType`, 6 `ChassisKind`,
   4 `SlotType`, 4 types de zone de station, une poignée d'installations.

`docs/ui-brief.md` fixe par ailleurs une direction « poste de commandement » dense, thème
sombre unique, densité d'information non négociable — ce qui contraint le niveau de
réalisme atteignable sans dissonance avec le reste de l'application.

## Décision

### Aucun fichier d'asset 3D

Ni `.glb`, ni texture bitmap. Deux familles, deux traitements :

- **Astronomique** (galaxies, étoiles, planètes, lunes, astéroïdes) — **procédural**, par
  shader, dérivé du seed et des champs déjà modélisés (`PlanetType`, `habitability`,
  `deposits`). Même propriété que la génération d'univers : stable d'une session à
  l'autre sans rien persister.
- **Manufacturé** (vaisseaux, stations) — **paramétrique**, dérivé du contenu. Portage en
  3D de ce que font déjà les diagrammes 2D : géométrie de vaisseau issue du `ChassisKind`
  et des modules par `SlotType` (via `resolveBlueprint`), géométrie de station issue de
  la grille hexagonale (`computeGrowthPoints`).

### Deux registres visuels selon le niveau de carte

| Niveau | Registre |
|---|---|
| Univers, galaxie | Abstrait et schématique — c'est une carte de commandement, elle prolonge le HUD du `ui-brief`. |
| Système, corps | Semi-réaliste — sphères éclairées par l'étoile, ombres, atmosphères. |

Un registre unique aurait forcé un compromis perdant des deux côtés : un univers
semi-réaliste illisible en vue dense, ou une vue système schématique là où le joueur
s'attend justement à regarder quelque chose.

### L'apparence du contenu manufacturé est éditable dans le CMS

Les domaines de contenu qui ont déjà une table (`content_chassis`, `content_zone_types`,
`content_installations`, `content_ships`, `content_warships`) gagnent des champs
d'apparence — forme de base, teinte, échelle — éditables depuis `apps/admin`. C'est la
promesse du chantier 23 tenue jusqu'au bout : créer une entrée sans coder doit produire
quelque chose de présentable, pas un trou.

Un **repli générique est obligatoire** : toute entrée dont l'apparence est absente ou
inconnue du moteur doit rendre une forme neutre, jamais casser la vue.

Les corps astronomiques restent **hors** de ce mécanisme : `PLANET_TYPES` est une
énumération de modèle, pas un domaine de contenu. Les rendre éditables serait un nouveau
domaine CMS, à décider séparément.

### L'habillage vient après un rendu nu qui marche

La vague D du chantier 31 livre les trois vues en primitives neutres (sphères, points,
boîtes) ; l'habillage est la vague E. Un problème de performance et un problème d'art ne
se déboguent pas ensemble, et la mesure de performance sous primitives sert de référence
à la passe finale.

## Conséquences

- Zéro octet d'asset à produire, acquérir, licencier ou charger, pour ~12 000 corps.
  Pas de pipeline glTF, pas de compression Draco, pas de budget de téléchargement.
- Le coût se déplace vers l'écriture de shaders et de générateurs de géométrie, une
  compétence différente de la production d'assets — et du code, donc testable et
  révisable comme le reste.
- Le lien « mon vaisseau ressemble au plan que j'ai conçu » est préservé et devient plus
  fort qu'en 2D. Un pack d'assets autorés l'aurait cassé.
- Les objets manufacturés risquent de se ressembler si les paramètres de forme sont trop
  pauvres. C'est le risque principal de cette décision, et la raison pour laquelle
  l'apparence passe par le CMS : elle doit rester réglable sans redéployer.
- Deux registres visuels à tenir cohérents, donc deux jeux de matériaux et d'éclairage à
  maintenir plutôt qu'un.
- `apps/web` gagne une dépendance de rendu lourde (`three`, `@react-three/fiber`,
  `@react-three/drei`). Un canvas est opaque aux lecteurs d'écran : l'accessibilité
  clavier obtenue en 27.21 sur `ZoomableSvg` ne se transpose pas, il faut une liste DOM
  parallèle en plus d'une caméra pilotable au clavier.
- `ZoomableSvg` n'est pas supprimé : `ResearchView.tsx` et `StationDiagram.tsx`
  continuent de l'utiliser.

## Alternatives écartées

- **Modèles glTF autorés partout** — écarté : suppose de produire ou d'acquérir des
  assets (licences, poids, pipeline de chargement) et casse le lien entre le plan conçu
  par le joueur et ce qu'il voit. Incohérent avec un univers lui-même procédural.
- **Procédural partout, y compris les vaisseaux** — écarté : une station et un cuirassé
  ont besoin d'une silhouette identifiable, que du bruit procédural ne donne pas. Le
  contenu manufacturé a déjà un modèle de données riche (châssis, modules, zones), autant
  s'en servir.
- **Un registre visuel unique** — écarté, voir ci-dessus.
- **Habillage intégré à chaque vue** plutôt qu'en vague séparée — écarté : chaque étape
  serait présentable, mais on déboguerait géométrie, performance et art en même temps.
- **Apparence câblée en dur dans `apps/web`** — écarté : une entrée créée depuis l'admin
  n'aurait alors aucun visuel tant que personne ne code, ce qui vide de son sens la
  promesse du chantier 23.
