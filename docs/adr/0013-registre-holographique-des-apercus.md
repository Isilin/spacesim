# 0013 — Registre holographique pour les aperçus d'objets manufacturés

## Statut

Accepté

## Contexte

L'[ADR 0007](0007-habillage-3d-procedural-et-parametrique.md) a fixé deux registres
visuels, **par niveau de carte** :

| Niveau | Registre |
|---|---|
| Univers, galaxie | Abstrait et schématique |
| Système, corps | Semi-réaliste |

Elle n'a rien dit d'une troisième surface, qui n'existait pas encore quand elle a été
écrite : l'**aperçu d'un objet manufacturé**. `ModelPreview` (chantiers 31.20-31.21) n'est
pas un niveau de carte — c'est un canvas de 220 px, un seul objet, en rotation lente, monté
dans le concepteur de vaisseaux (`ShipDesigner.tsx`) et dans la vue des stations
(`StationsView.tsx`), **à côté du diagramme 2D éditable du même objet**.

Deux faits du dépôt cadrent la décision :

1. **L'ADR 0007 s'est désigné son propre risque principal** :
   > « Les objets manufacturés risquent de se ressembler si les paramètres de forme sont
   > trop pauvres. C'est le risque principal de cette décision. »

   Ce risque s'est réalisé. Six châssis se distinguent par trois nombres
   (`HULLS: [longueur, largeur, hauteur]`), quatre types de zone de station par une hauteur
   d'extrusion. Une frégate militaire et un cargo lourd sont le même cylindre.

2. **Le diagramme 2D voisin est déjà un hologramme.** `ShipHullDiagram` dessine un contour
   cyan de 2 px sur un lavis cyan dégradé de 0,26 à 0,05 d'opacité, avec des coutures de
   coque à 0,35 et une unique lueur réservée à la sélection. Les deux représentations du
   même vaisseau sont côte à côte à l'écran et ne parlent pas la même langue : l'une est un
   schéma technique lumineux, l'autre un objet gris métallisé.

## Décision

### Un troisième registre, `holo`, pour les aperçus d'objets manufacturés

Volumes translucides teintés qui conservent la silhouette, arêtes vives lumineuses
par-dessus, frange de Fresnel sur les faces vues de biais, bandes de balayage lentes et de
faible amplitude.

Il ne s'applique **qu'aux objets manufacturés en aperçu**. Les corps astronomiques gardent
leur shader procédural et le registre semi-réaliste ; les niveaux de carte gardent les deux
registres de l'ADR 0007, qui reste vraie pour ce qu'elle décrit.

La question à laquelle répond ce registre n'est pas celle de l'ADR 0007. Celle-ci demandait
« à quelle distance regarde-t-on » ; celle-ci demande **« regarde-t-on un lieu ou une pièce
d'ingénierie »**. Un vaisseau en cours de conception n'a pas encore été construit — le
montrer comme un objet éclairé par une lumière physique est un contresens ; c'est un plan.

### La silhouette de coque est autorée par `ChassisKind`, le reste est dérivé

C'est déjà ce que fait la 2D, et elle le dit :

> « Composé à la main (pas de génération aléatoire) pour un rendu maîtrisé. »
> — `ShipHullDiagram.tsx`

Un profil de coque par `ChassisKind` — une liste d'anneaux `[z, rayon]` — donne six
silhouettes reconnaissables. C'est la mitigation directe du risque que l'ADR 0007 s'était
désigné : du bruit procédural ne fabrique pas une identité, une poignée de profils écrits à
la main oui, et six profils ne sont pas un pipeline d'assets.

Tout le reste reste **dérivé des données** : les modules montés, leur rôle, l'échelle par
tonnage, les zones bâties, les installations, les files de construction.

### Les modules prennent leur forme du `ModuleRole`, pas du `SlotType`

Le modèle porte déjà **huit** rôles (`weapon`, `defense`, `propulsion`, `cargo`, `mining`,
`habitat`, `support`, `sensor`) et seulement quatre types d'emplacement. Le rendu actuel
n'utilise que les quatre. Passer aux huit double le vocabulaire de formes **sans inventer
aucune donnée** — elle est déjà renseignée pour les vingt-deux modules du jeu.

Le `SlotType`, lui, gouverne la **position** de la pièce sur la coque : armes en avant,
propulsion à l'arrière, utilitaire ventral, défense latérale.

### La géométrie est calculée par des fonctions pures, hors du rendu

`shipLayout(chassisId, modules)` et `stationLayout(station)` renvoient des listes de pièces
en données simples ; les composants React ne font que les rendre.

Le dépôt n'a **aucun** test de composant three.js et aucun mock — la seule couverture du
rendu est l'e2e. Plutôt que d'ajouter un harnais WebGL pour tester une décision de forme,
on sort la décision du rendu. C'est la même séparation que `bounds.ts`, testé sans
navigateur depuis le chantier 31.24.

### Les couleurs viennent des jetons de thème

Le rendu 3D code aujourd'hui en dur des hexadécimaux qui étaient ceux du `ui-brief` avant
que `tokens.css` ne fixe les valeurs définitives, et la 2D et la 3D se contredisent même sur
la couleur d'un emplacement de propulsion. Une seule source : `tokens.css`, lue une fois au
montage, avec repli sur une valeur littérale pour les contextes sans DOM stylé.

## Conséquences

- **Trois registres à tenir** au lieu de deux. Le coût est réel mais borné : le registre
  `holo` ne concerne que deux composants, tous deux montés dans le même `ModelPreview`.
- Le **budget de lueur** du `ui-brief` (« une seule intensité, réservée aux accents »)
  s'applique : une constante d'intensité unique dans le matériau, jamais de lueur ad hoc.
- Les faces translucides imposent `depthWrite: false` et un tri correct ; les arêtes, elles,
  écrivent la profondeur. Les arêtes portent la lisibilité, les faces l'atmosphère.
- L'affectation d'une installation à une zone précise est une **dérivation de rendu** :
  `Station.installations` est un compte par type à l'échelle de la station, aucune donnée ne
  dit quelle zone héberge quoi. La répartition est déterministe et doit être documentée
  comme telle, pas présentée comme un fait de simulation.
- Le repli générique de l'ADR 0007 reste obligatoire : un `chassisId` ou un `zoneTypeId`
  inconnu du moteur rend une forme neutre, jamais rien et jamais une exception.

## Alternatives écartées

**Étendre le registre `lit` aux aperçus.** Aucun registre nouveau à maintenir — et un
vaisseau jamais construit rendu comme un objet photographié sous une lampe, à côté d'un
schéma lumineux qui dit le contraire.

**Fil de fer pur, sans faces.** Très marqué « schéma technique », et illisible dès qu'une
station dépasse une dizaine de zones : les arêtes du fond se confondent avec celles du
premier plan et la silhouette disparaît.

**Blueprint complet avec cotes et étiquettes.** Le plus informatif, et il demande du texte
en 3D. `<Text>` de drei passe par troika, qui charge une police depuis un CDN ;
`tokens.css` interdit explicitement la dépendance réseau, et les polices du design system
n'ont pas encore de `@font-face`.

**Générer les coques procéduralement plutôt que d'autorer six profils.** Déjà écarté par
l'ADR 0007 pour la bonne raison — « une station et un cuirassé ont besoin d'une silhouette
identifiable, que du bruit procédural ne donne pas » — et c'est précisément le manque de
silhouette qui a fait naître ce chantier.
