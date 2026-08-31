# 0012 — Carnet d'ordres adossé à des avoirs de station

## Statut

Accepté

## Contexte

Le marché du jeu tient en une courbe. `resolveSale`/`resolvePurchase`
(`sim/economy/market.ts`) calculent un prix à partir de `stock / TARGET_STOCK`, borné
entre 0,4 et 2,5 fois un prix de base. Les comptoirs PNJ et les stations de joueur
utilisent la même mécanique ; une station de joueur ajoute seulement une politique d'accès
et une taxe (chantier 25).

Conséquence : **aucun joueur ne peut faire de prix**. Il n'y a ni ordre limite, ni
market-making, ni arbitrage — donc aucun jeu pour un joueur non combattant au-delà de
« produire et vendre au cours ».

Deux mécanismes existants cadrent la réponse :

1. **`Contract`** (chantier 14) est déjà un ordre d'achat déguisé : « je paie *p* par unité
   pour *n* unités livrées à ma colonie », avec **séquestre des crédits à la publication**
   pour qu'une offre publique soit toujours honorable. Le précédent d'escrow est donc posé.
2. **[ADR 0004](0004-logistique-deux-stocks-sol-orbite.md)** : une ressource est toujours
   quelque part, et tout ce qui embarque passe par l'ascenseur orbital. Un marché qui
   téléporte de la matière viderait de son sens l'invariant que le jeu défend.

## Décision

### Le carnet d'ordres remplace la courbe pour les places JOUEUR, et elles seules

Les comptoirs PNJ gardent leur courbe : c'est exactement ce qu'on attend d'une liquidité
non joueuse — toujours disponible, à un prix qui punit les déséquilibres. Elle sert de
plancher et de plafond au marché joueur, ce qui empêche un carnet vide de bloquer
l'économie.

### Les ordres sont adossés à des AVOIRS déposés à la station

Un `StationHolding` est ce qu'un empire a garé dans une station donnée : des ressources et
des crédits, distincts du stock du propriétaire. C'est la pièce qui manquait — sans elle,
seul le propriétaire d'une station pourrait y vendre.

- Poser une **vente** exige d'avoir la marchandise **dans son avoir à cette station**.
- Poser un **achat** séquestre les crédits **immédiatement**, comme `Contract`.
- Une exécution déplace marchandise et crédits **entre avoirs de la même station**.
- Rapatrier un avoir demande un **convoi**, comme tout le reste.

Le coût logistique est donc préservé de bout en bout : le marché ne téléporte rien, il
change seulement qui possède quoi **à un endroit donné**. C'est aussi ce qui rend
l'arbitrage géographique possible — acheter ici et revendre là suppose de traverser
l'espace, ce qui est le jeu.

### L'appariement est pur, déterministe, et vit dans `packages/shared`

`matchOrders` prend un carnet et un ordre entrant, rend les exécutions. Aucune I/O, aucune
date, aucun aléa : c'est la partie du marché qu'on doit pouvoir prouver, et le seul endroit
où une erreur crée de la monnaie.

Règles de priorité, dans cet ordre : **prix**, puis **ancienneté**. Le prix d'exécution est
celui de l'ordre **au repos**, jamais celui de l'entrant — c'est ce qui récompense
d'afficher un prix et de prendre le risque d'attendre.

### Le séquestre est intégral et immédiat

Un ordre d'achat retient `quantité × prix` dès la pose ; un ordre de vente retire la
marchandise de l'avoir dès la pose. Un ordre annulé rend ce qui restait. Sans cela, un
carnet afficherait des offres qu'un clic peut révéler creuses, et l'annulation deviendrait
une arme.

## Conséquences

- `Station.resources` reste le stock du **propriétaire** ; les avoirs des visiteurs sont
  une table à part. Les confondre aurait rendu impossible de dire à qui appartient quoi.
- La taxe de station (chantier 25) s'applique à l'exécution, prélevée sur le vendeur, et va
  au propriétaire de la station. Poser un carnet chez soi reste rentable.
- Le palier d'accès (`marketAccess`, chantiers 25/32.10/32.20) gouverne le droit de
  **poser un ordre**, pas seulement celui de commercer au cours. Une station fermée n'a
  pas de carnet visible pour un étranger.
- `Contract` n'est pas absorbé : il vise une **colonie**, pas une station, et il paie une
  livraison plutôt qu'un échange sur place. Les deux coexistent comme le comptant et le
  gré à gré coexistent ailleurs.

## Alternatives écartées

**Un carnet sans avoirs, où les ordres de vente puisent dans le stock du propriétaire.**
Une table de moins — et un marché où un seul joueur par station peut vendre, ce qui n'est
pas un marché.

**Des ordres qui déclenchent un convoi à l'exécution.** Séduisant (pas d'avoirs à gérer),
mais l'exécution deviendrait conditionnelle à un voyage qui peut échouer ou arriver dans
dix minutes : le carnet afficherait des prix qui ne veulent rien dire.

**Remplacer aussi la courbe des comptoirs PNJ.** Un carnet vide au lancement du serveur
officiel signifierait une économie morte, sans aucun prix de référence. La courbe PNJ est
le filet.

**Un appariement au prix de l'entrant.** Plus simple à écrire, et il punit exactement le
comportement qu'on veut encourager : afficher un prix et attendre.
