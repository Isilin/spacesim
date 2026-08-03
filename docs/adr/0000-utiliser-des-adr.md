# 0000 — Utiliser des ADR

## Statut

Accepté

## Contexte

Les décisions structurantes de SpaceSim (pas de conteneur DI, univers matérialisé en DB,
persistance write-behind, logistique deux stocks...) vivaient uniquement dans l'historique de
conversation ou en commentaires épars dans le code. Une session future n'a aucun moyen de
retrouver *pourquoi* une décision a été prise, seulement *ce qui* a été fait — et risque de la
relitiger sans le contexte qui l'a motivée la première fois.

## Décision

Documenter les décisions structurantes sous forme d'Architecture Decision Records dans
`docs/adr/`, format MADR-lite (gabarit : `template.md`). Une ADR par décision, jamais modifiée
après coup sauf pour la marquer dépréciée/remplacée — l'historique de décision est un log, pas
un document vivant.

## Conséquences

- Chaque décision structurante future (à commencer par celles du chantier 27 lui-même :
  Zod-first avant OpenAPI, orval plutôt que hooks à la main, o11y gratuit plutôt que
  self-hosted) devient candidate à une ADR une fois exécutée.
- `CLAUDE.md` pointe vers `docs/adr/` plutôt que de ré-argumenter chaque choix inline.
- Charge additionnelle minime : une ADR est courte (quelques paragraphes), pas un document de
  conception complet.

## Alternatives écartées

- **Tout documenter dans CLAUDE.md** — écarté explicitement (chantier 27.0) : produirait un
  fichier encore plus long à relire à chaque session, alors que l'objectif est l'inverse.
- **Ne rien documenter, se fier à `git log`/`git blame`** — insuffisant : un message de commit
  explique *quoi*, rarement *pourquoi* face à quelles alternatives.
