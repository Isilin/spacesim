# 0004 — Logistique en deux stocks (sol/orbite)

## Statut

Accepté

## Contexte

Une colonie doit distinguer les ressources produites/consommées localement par ses bâtiments
de celles réellement exportables par un vaisseau — sans cette distinction, chaque opération de
cargo/vente aurait besoin de règles ad hoc pour déterminer quelles ressources locales sont
"disponibles" à l'export, mélangées à la logique de production.

## Décision

Chaque colonie a deux stocks séparés : `resources` (au sol, produit/consommé par les bâtiments)
et `orbitalResources` (en orbite, seule soute chargeable par un vaisseau). Le bâtiment
`orbital_dock` fixe la capacité et le débit de l'ascenseur entre les deux ; `liftRules` décide
de ce qui monte/descend. Tout ce qui embarque (convois, routes, ventes) passe par
`takeFromOrbit`/`deliverToOrbit` — sans dock, une colonie ne peut rien exporter.

## Conséquences

- Frontière nette : la logique de production/consommation ne raisonne jamais sur les vaisseaux ;
  la logique d'expédition ne touche jamais directement la production au sol.
- Introduit un vrai goulot d'étranglement délibéré (débit de l'ascenseur) comme levier de
  gameplay, pas juste un détail d'implémentation — une colonie peut être riche au sol mais
  bloquée à l'export.
- Ajoute un mode d'échec à tester explicitement : une colonie sans `orbital_dock` est
  légitimement et durablement incapable de commercer — doit être un état voulu, pas un bug
  silencieux.

## Alternatives écartées

- **Stock unique, tout directement exportable** — plus simple, mais supprime tout levier de
  gameplay autour de la logistique orbitale et casse la métaphore physique (un vaisseau ne peut
  pas littéralement charger depuis le sol d'une planète).
- **Stock unique + règles d'éligibilité par ressource** ("cette ressource est exportable, celle-
  là non") — moins de mécanique nouvelle, mais mélange une règle de disponibilité arbitraire
  dans la logique de production plutôt qu'un flux physique explicite (élévateur), moins lisible
  et moins débogable indépendamment.
