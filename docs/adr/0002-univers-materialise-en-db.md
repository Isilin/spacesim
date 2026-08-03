# 0002 — Univers matérialisé en DB, générateur non-invalidant

## Statut

Accepté

## Contexte

SpaceSim vise un univers unique, persistant et multijoueur qui ne sera **jamais réinitialisé**
une fois le serveur officiel lancé, tout en restant extensible à l'infini (chaque galaxie se
génère depuis `seed:galaxy:<index>` sur une spirale d'angle d'or, sans bord). Ces deux
contraintes ensemble excluent une approche naïve où le contenu d'une galaxie serait dérivé à la
volée depuis le générateur à chaque lecture : corriger un bug ou rééquilibrer le générateur
changerait alors rétroactivement des galaxies déjà visitées et exploitées par des joueurs.

## Décision

Le générateur (`packages/shared/src/universe.ts`, `GENERATOR_VERSION`) ne sert qu'à
**matérialiser** des galaxies neuves à l'ouverture de la frontière (`growUniverse` →
`appendGalaxies`, transactionnel) dans les tables `universe_*`. Une fois matérialisée, une
galaxie ne change plus jamais par régénération — la DB fait autorité, pas le générateur. Toute
correction de l'univers déjà créé passe par un UPDATE ciblé. Modifier le générateur n'affecte
que les galaxies futures ; un changement de son flux de sortie doit bumper `GENERATOR_VERSION`
et régénérer la fixture gelée (`universe.fixture.json`) dans le même commit.

## Conséquences

- L'invariant "univers jamais réinitialisé" est respecté par construction, pas par discipline
  d'équipe.
- Le générateur peut évoluer librement (bug fix, rééquilibrage) sans aucune contrainte de
  rétrocompatibilité vis-à-vis des mondes déjà matérialisés — le risque est nul pour l'existant.
- Contrainte à respecter partout ailleurs : tout habillage dérivé (`bodyPhysicals`) doit se
  calculer depuis l'id stable du corps, jamais en re-consommant le flux du générateur, sous
  peine de reflow silencieux de galaxies existantes lors d'un changement futur du générateur.
- La discipline fixture-gelée + bump de version devient un process réellement bloquant (testé),
  pas une convention informelle.

## Alternatives écartées

- **Génération à la volée depuis le seed, sans matérialisation** — casse l'invariant serveur dès
  la première correction de bug du générateur : une galaxie déjà explorée changerait sous les
  pieds des joueurs.
- **Matérialiser tout l'univers d'un coup au démarrage** — impossible par construction : la
  spirale est sans bord (infinie), seule une matérialisation à la demande (`ensureFrontier`)
  tient dans une base de données finie.
