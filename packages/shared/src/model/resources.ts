export const RESOURCES = [
  "energy",
  "ore",
  "metals",
  "components",
  "food",
  "goods",
  "credits",
  "science",
  /**
   * Matière exotique (chantier 45.5) — la seule ressource qu'aucun bâtiment ne produit.
   *
   * Elle ne s'extrait pas d'un gisement : elle se récolte autour d'une **singularité**, et
   * seule une colonie partageant son système en reçoit. C'est ce qui donne une raison
   * d'aller coloniser un monde gelé autour d'un trou noir, où rien d'autre ne pousse.
   *
   * Hors marché, comme les crédits et la science : elle ne s'achète pas, ne se contracte pas
   * et aucune faction n'en produit. Sa rareté est **géographique**, et un prix la
   * remplacerait par une rareté monétaire que n'importe quel empire riche contournerait.
   *
   * Son unique emploi est le coût d'un portail inter-galactique (`GATEWAY_COST`) : les
   * fontaines blanches sont le raccourci INTRA-galactique, et la matière qu'elles crachent
   * paie le passage INTER-galactique.
   */
  "exotic",
] as const;

export type ResourceId = (typeof RESOURCES)[number];
