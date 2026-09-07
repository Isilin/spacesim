# 0021 — Le ciel devient une donnée de jeu

## Statut

Accepté — remplace [0016](0016-classes-d-etoiles-derivees.md) et renverse le point 3 de
[0018](0018-morphologie-de-galaxie-structurante.md).

## Contexte

L'ADR [0016](0016-classes-d-etoiles-derivees.md) a doté le ciel des énumérations qui lui
manquaient — six classes d'étoiles, quatre morphologies de galaxie — en les **dérivant** de
l'identifiant plutôt qu'en les persistant. Elle a délimité leur portée sans ambiguïté :

> « **Purement cosmétique** — Aucune de ces valeurs n'entre dans l'économie, l'habitabilité,
> l'exploration ou le combat. Elles n'existent que pour que deux systèmes ne se ressemblent pas.
> C'est dit ici parce que rien dans le code ne l'empêcherait — et que la tentation d'en faire un
> modificateur de gisement serait la première à venir. »

Et elle a désigné, à l'avance, l'endroit où la décision inverse se prendrait :

> « **En faire une donnée de jeu deviendrait coûteux.** Si une classe devait un jour modifier un
> rendement ou une portée, il faudrait la persister […] Cette ADR est le point où cette bascule se
> déciderait. »

La bascule est demandée. Le chantier 45 introduit huit familles d'objets astronomiques — types de
galaxies, de trous noirs, de trous blancs, d'étoiles, de planètes, de lunes, de ceintures — et
exige qu'ils **agissent** : sur l'habitabilité et la colonisation, sur les gisements et les
rendements, sur l'énergie et l'industrie, sur le danger et le coût de trajet. Les quatre.

Trois faits encadrent la décision.

1. **Le ciel actuel est plat.** Six types de planètes en une énumération qui confond une taille et
   un climat, une étoile implicite par système, des ceintures d'astéroïdes sans aucun champ de
   type, deux notions de trou noir sans parenté — une valeur de `StarClass` et un cœur galactique
   dérivé de `systemCountOf`. Seize types en tout, pour un univers de ~80 000 systèmes.
2. **L'ADR 0016 avait raison sur le mécanisme, pour la portée qu'elle visait.** Un habillage
   dérivé ne coûte ni colonne ni migration, et rend le même résultat client et serveur. Ce qui
   change n'est pas la qualité du mécanisme : c'est que la portée le rend intenable. Rééquilibrer
   une fonction de dérivation qui pilote l'économie réécrirait rétroactivement des systèmes déjà
   colonisés — exactement ce que l'ADR [0002](0002-univers-materialise-en-db.md) interdit.
3. **L'ADR [0018](0018-morphologie-de-galaxie-structurante.md) a déjà entamé la brèche** sans la
   nommer. Sa décision 3 dit « la morphologie reste **dérivée**, jamais persistée » — mais sa
   décision principale en fait une **entrée du générateur**, donc une cause. Le corpus porte donc
   déjà une tension : une valeur qui décide où sont les systèmes n'est plus vraiment un habillage.

## Décision

### 1. Le type devient une donnée de jeu, et se persiste

La classe d'une étoile, le type d'une galaxie, la classe et la variante d'un corps, le type d'une
ceinture entrent dans l'économie et deviennent des colonnes. `starClassOf()` et
`galaxyMorphology()` disparaissent : ce ne sont plus des lectures d'après coup, ce sont des
tirages du générateur, figés à la matérialisation comme le reste de la galaxie.

### 2. L'identité se persiste, les effets se dérivent du catalogue — au sens strict

La base ne stocke **que l'identifiant de type**. Tout ce qui est chiffré — habitabilité,
emplacements, gisements, rendements, dangers, couleurs — vit dans `packages/shared/src/content/astro/`
et se calcule à la lecture, depuis le couple `(type, hash de l'identifiant du corps)`.

C'est le patron que `bodyPhysicals()` applique déjà au rayon, à la gravité et à l'atmosphère,
étendu à ce qui compte pour le jeu. Trois colonnes **disparaissent** de `universe_bodies` —
`habitability`, `slots`, `deposits` — au lieu que d'autres s'y ajoutent, et `loadUniverse` cesse
de parser du JSON stocké en `text`.

Le tirage individuel ne se perd pas pour autant : il se rejoue à l'identique depuis l'identifiant
du corps, qui est stable. Deux mondes `rocky/arid` du même système continuent de ne pas se valoir.

### 3. Le générateur ne lit que les tables statiques

Les catalogues deviennent éditables en administration (chantier 45, palier 3), et cette édition ne
doit pas pouvoir désynchroniser une galaxie de frontière d'une galaxie déjà matérialisée. La règle
qui l'en empêche est structurelle, pas disciplinaire : chaque définition de catalogue a **deux
moitiés**, et une seule est exposée.

- **Entrées de génération** — poids de tirage, fourchettes de masse, plages de taille, variantes
  plausibles, emplacements permis. Lues **uniquement** par `packages/shared/src/universe.ts`, gelées
  par `GENERATOR_VERSION`, **jamais éditables**.
- **Effets et habillage** — multiplicateurs d'habitabilité, de gisement, d'énergie, pénalités de
  trajet, dangers, couleurs, libellés. Lus par la simulation et le rendu au moment de l'usage.
  **Ce sont les seuls que le CMS expose.**

Faire porter cette frontière par les schémas Zod de `packages/protocol/src/content.ts` transforme
l'intention en fait vérifié par le compilateur.

### 4. La causalité s'inverse : l'étoile d'abord, les corps ensuite

L'ADR 0016 tirait la classe d'étoile **après** les planètes et la conditionnait à elles — « un trou
noir avec cinq mondes habitables serait absurde ». C'était la seule façon de rester plausible quand
la classe était une lecture d'après coup.

Le générateur tire désormais les corps centraux **en premier** — leur nombre, leurs classes, leurs
masses — puis en dérive la luminosité totale, la zone habitable, la ligne des glaces, et enfin le
nombre et les types de corps. L'étoile cesse de commenter le système : elle le cause.

La contrainte de plausibilité ne disparaît pas, elle **change de sens**. Elle était une règle de
relecture ; elle devient un garde-fou de génération, et un verrou de calibration
(`habitability.calibration.test.ts`) qui fige la distribution d'habitabilité de l'univers. Sans lui,
tirer l'étoile en premier peut faire dériver l'économie entière sans que rien ne le signale.

### 5. L'habitabilité cesse d'être tirée : elle se calcule

C'est la conséquence que l'inversion rend inévitable, et le vrai contenu de « structurant ».

`sim/exploration/bodies.ts` porte aujourd'hui trois béquilles, honnêtement documentées : la
température vient de `BASE_TEMP[type]` et la distance à l'étoile ne l'écarte que de ±45 °C « à
dessein », `temperatePull` tire la fiche vers 15 °C quand l'habitabilité est haute pour que la
fiche « corrobore la donnée de jeu, pas la contredise », et l'atmosphère est pondérée par
l'habitabilité. Les trois existent pour la même raison : l'habitabilité est tirée **indépendamment**
de la physique, et il faut ensuite les réconcilier.

Une chaîne causale unique, sans boucle, les rend inutiles :

```
classe d'étoile + masse  →  luminosité, température effective, éruptions, rayonnement
        ↓ Σ L / d²
    irradiance  →  zone habitable, ligne des glaces
        ↓ × (1 − albédo de la variante)
    température d'équilibre  (278,5 × (S(1−a))^¼ — équilibre radiatif réel)
        ↓  croisée avec  rayon × densité → gravité → VITESSE DE LIBÉRATION
    rétention atmosphérique  (paramètre d'échappement de Jeans)
        ↓
    atmosphère + pression  →  effet de serre  →  TEMPÉRATURE DE SURFACE
        ↓  croisée avec gravité, rayonnement, magnétosphère
    HABITABILITÉ
```

L'habitabilité tombe de la physique au lieu d'être décrétée. Une naine rouge ne nourrit pas la même
colonie qu'une géante bleue non pas parce qu'un coefficient le dit, mais parce que sa zone habitable
est trente fois plus proche et que ses éruptions décapent l'atmosphère d'un monde dont la vitesse de
libération est trop basse.

Les trois béquilles sont **supprimées**, pas adaptées. La vitesse de libération, l'albédo,
l'irradiance et la magnétosphère sont les grandeurs charnières qui manquaient : ce sont elles qui
relient gravité et atmosphère, étoile et température, type de corps et survie d'un voile gazeux.
Tout reste dérivé — la chaîne ne coûte pas une colonne.

## Conséquences

**Une régénération d'univers, et une seule.** Persister ces types demande de régénérer. C'est
gratuit aujourd'hui — `docker compose down -v`, et `loadOrBootstrap` en recrée un au boot — et
impossible après le lancement du serveur officiel. Cette ADR est l'endroit où cette fenêtre est
dépensée. Elle ne se rouvrira pas.

**Rééquilibrer un catalogue déplacera des colonies en cours.** C'est le prix direct de la décision
2 au sens strict. Changer le multiplicateur d'habitabilité d'une variante après le lancement
déplace le plafond de population de toute colonie qui l'occupe, et le rendement de toute mine
qu'elle porte. Contrepartie assumée : un rééquilibrage de contenu est un acte de conception qui se
mesure et s'annonce, pas un ajustement discret. Le verrou de calibration est là pour qu'il ne
puisse pas passer inaperçu.

**Ce qui reste dérivé, et le restera.** La frontière doit pouvoir se lire ici, sans ouvrir le code :

| Dérivé de l'identifiant | Persisté |
|---|---|
| `bodyPhysicals()` — rayon, gravité, température, atmosphère | `Galaxy.typeId` |
| `sitesOfSystem()` — épaves, anomalies, caches | `Star.classId`, `Star.mass` |
| Positions orbitales (`bodyPositionAt`, ADR 0006) | `Planet.classId`, `variantId`, `hostStarId` |
| Habillage du cœur galactique (voir plus bas) | `AsteroidBelt.typeId` |
| Habitabilité, emplacements, gisements (décision 2) | Les singularités errantes |

**Le cœur galactique reste un habillage pur.** Il est le seul objet de ce chantier à ne recevoir
aucune mécanique, et c'est délibéré : dérivé **et** mécanique, une réédition de catalogue changerait
rétroactivement le rendement d'une galaxie vivante. Le code le permet déjà — rien ne vit sous le
cœur, `MapScene` le déclare non descendable — donc rien ne peut en dépendre.

**La charge utile se tient par le brouillard, pas par la compression.** Les corps centraux ajoutent
~110 Ko par galaxie détaillée. `redactUniverse` doit vider `stars` sur un système inexploré, comme
il vide déjà `planets` et `belts`. Ce n'est pas un contournement mais le contrat de brouillard
appliqué avec cohérence : l'ADR 0016 documentait déjà qu'un système redacté rend la classe la plus
banale. La compression n'est pas une issue — `perMessageDeflate` a été essayé, mesuré et retiré.

**Deux ADR à relire différemment.** L'ADR 0016 est remplacée : son mécanisme reste juste pour un
habillage, sa portée ne vaut plus. La décision 3 de l'ADR 0018 est renversée sur le mécanisme — la
morphologie se persiste maintenant — mais sa décision principale est **confirmée et étendue** : la
morphologie était déjà une cause, elle le reste, et sept autres familles la rejoignent.

## Alternatives écartées

**Rester dérivé et accepter le reflow.** Zéro colonne, zéro migration, la fenêtre de l'ADR 0002 non
dépensée. Écarté : la première correction d'équilibrage réécrirait l'économie de systèmes colonisés.
C'est précisément le scénario que l'ADR 0016 avait anticipé, et la raison pour laquelle elle avait
posé la limite au cosmétique.

**Persister aussi les caractéristiques chiffrées.** Masse, température, luminosité, coefficients en
colonnes. L'univers serait totalement figé, donc immunisé au rééquilibrage rétroactif. Écarté :
c'est l'immunité d'un jeu qu'on ne peut plus régler. Un jeu persistant qui ne sera jamais
réinitialisé a davantage besoin de pouvoir corriger son contenu que de garantir que rien ne bouge —
et les paliers de coefficients sont exactement ce qu'on veut pouvoir corriger.

**Garder les tirages persistés et n'ajouter que les multiplicateurs par-dessus** (hybride). Les
colonnes `habitability`, `slots`, `deposits` restaient le tirage individuel, les coefficients du
catalogue s'appliquaient à la lecture. C'était le compromis : rééquilibrable sans UPDATE, tirage
gelé. Écarté au profit du strict, pour que la règle « l'identité en base, les effets au catalogue »
n'ait aucune exception à retenir — une frontière sans cas particulier est une frontière qu'on ne
franchit pas par mégarde. Le coût est nommé plus haut, et consigné plutôt que découvert.

**Un domaine CMS pour les corps astronomiques dès maintenant.** L'ADR 0007 les en excluait
explicitement — « `PLANET_TYPES` est une énumération de modèle, pas un domaine de contenu ». Cette
exclusion tombe, mais par paliers : les catalogues arrivent en constantes structurées, et ne
basculent au CMS qu'une fois la taxonomie stabilisée par l'usage. Concevoir un canal de contenu
pour des tables qui bougeront encore aurait coûté deux fois.
