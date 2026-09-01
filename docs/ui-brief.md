# Brief design system — SpaceSim (chantier 21)

Ce document est le point de départ de l'itération visuelle dans **claude.ai/design**
(projet « SpaceSim — Design System »). Il décrit la direction retenue, ce que le design
system doit livrer, et les contraintes non négociables. Les cartes du projet montrent
l'**état actuel** de l'app (groupes « Fondations », « Écrans actuels », « Contrôles
actuels ») : c'est la base sur laquelle réagir.

## Le produit

Jeu de gestion spatiale par navigateur, inspiré d'EVE Online : univers persistant unique,
colonies, logistique orbitale, marché entre factions, flottes, diplomatie. L'interface est
un **poste de commandement** : beaucoup de données denses (ressources, taux, files de
production, tables de marché), une carte SVG à 4 niveaux (univers → galaxie → système →
corps), 6 onglets plats + la carte. Client React + CSS vanilla.

## Direction retenue : HUD immersif type EVE / Elite Dangerous

Évolution assumée depuis l'esthétique actuelle « terminal sombre monospace » vers un
habillage de vaisseau spatial :

- **Typographie à deux voix** : une typo *display* pour titres/navigation (anguleuse,
  technique — à proposer), la monospace conservée pour **toutes les données chiffrées**
  (alignement des colonnes = lisibilité du jeu).
- **Cadres anguleux** : coins coupés (clip-path) sur les panneaux et boutons, filets fins,
  éventuels marqueurs d'angle (brackets) sur les panneaux focalisés.
- **Glow budgété** : une seule intensité de lueur, réservée aux accents (état actif,
  alerte, sélection carte). Jamais sur le texte courant.
- **Palette sombre** : fond très sombre bleuté (base actuelle `#0a0e14` appréciée),
  accent principal cyan (`#4fc1ff` actuel, ajustable), et promotion des couleurs
  aujourd'hui orphelines en **accents sémantiques** : violet `#b48fe0` (influence,
  portails, recherche), ambre `#e0b64f`/`#e3b341` (stations, commerce, utilitaire),
  vert `#56d364` (positif/colonies), rouge `#f85149` (négatif/danger/armes).

### Questions ouvertes — à trancher pendant l'itération claude.ai/design

1. **Scanlines / bruit CRT** : oui (très subtil, sur les panneaux seulement) ou non ?
2. **Intensité des coins coupés** : discrète (4-6 px, panneaux seulement) ou marquée
   (boutons et chips aussi) ?
3. **Typo display** : laquelle ? (piste : industrielle/carrée, licence libre, latin étendu)
4. **Le violet et l'ambre** : accents pleins (fonds de badge) ou filaires (bordures) ?

## Livrables attendus du design system

### 1. Tokens (échelles complètes)

L'existant n'a que 8 variables de couleur et AUCUNE échelle. Il faut :

- `--color-*` : fonds (3 niveaux : page / panneau / surélevé), bordures (2), textes (3 :
  principal / secondaire / désactivé), accents sémantiques (cyan, violet, ambre, vert,
  rouge) chacun avec variante fond/bordure/glow.
- `--space-1..8` : échelle d'espacement (base 4 px).
- `--text-*` : échelle typographique (aujourd'hui : tailles en dur 11/12/13/14/15/16/18/20 px)
  + `--font-display` / `--font-mono`.
- `--radius-*` + le paramètre de coin coupé.
- `--glow-*`, `--shadow-*`, `--motion-*` (durées/courbes).

### 2. Composants (avec le nombre d'usages actuels mesuré dans l'app)

| Composant | Remplace | Usages |
|---|---|---|
| Button (primary/ghost/link, 2 tailles) | 5 recettes CSS dupliquées | ~45 |
| ListRow (ligne de liste dense) | 8 classes identiques (.building, .queue-item, .milestone…) | ~45 |
| Panel (avec titre) | ~10 classes de panneau | ~15 |
| RowHeader (titre + valeur à droite) | .queue-head et 5 cousines | ~26 |
| Field / Select / NumberInput | ~11 recettes de champ | ~40 |
| ProgressBar (2 hauteurs, variantes ok/over) | 2 implémentations | ~10 |
| Tabs (route et locale) | 3 implémentations | 3 barres |
| Badge (ok/ko/info/neutral + accents) | 6 classes (.deposit, .shortage, .level…) | ~15 |
| Table (données de marché) | 3 styles de table | 3 |
| Stat (libellé + valeur + delta) | .stat topbar + .resource-cell | ~13 |
| Toast (info/erreur, empilables) | 2 recettes | 2 |
| SectionTitle (uppercase espacé) | 5 copies | 5 |
| EmptyState | ~15 `<p class="muted">Aucun…</p>` | ~15 |
| Gauge (jauge avec dépassement) | composant local ShipDesigner | 4 |

Hors design system (restent dans l'app, mais consomment les tokens) : la carte 3D et son
infobox, le schéma de coque, le graphe de recherche. La carte était quatre vues SVG
(univers/galaxie/système/corps) ; elle est passée en `react-three-fiber` au chantier 31, puis
en carte unique à zoom continu au chantier 35 (ADR 0015).

## Contraintes non négociables

- **Thème sombre unique** (pas de mode clair).
- **Contraste AA** minimum sur tout texte porteur d'information ; `:focus-visible` net partout.
- **CSS vanilla** : custom properties + classes, variantes par `data-variant`/`data-size`.
  Pas de CSS-in-JS, pas de Tailwind, pas de lib de composants tierce.
- **Densité** : c'est un outil de pilotage — l'information dense actuelle doit rester
  dense. Pas d'aération « site vitrine ».
- Les données chiffrées restent en monospace.
- Labels UI en français.

## Boucle de travail

1. Tu itères la direction dans claude.ai/design (cartes tokens + composants clés).
2. Quand une direction te convient, signale-le en session : je tire les cartes qui font
   foi, j'en extrais tokens et specs, j'implémente dans `packages/ui`.
3. Je repousse des cartes « implémenté » à côté des cartes « direction » pour comparaison,
   vague par vague (A : Button/Field/Badge — B : Panel/ListRow/Progress — C : Tabs/Table/
   Stat/Toast — D : Gauge/ZoomableSvg).
