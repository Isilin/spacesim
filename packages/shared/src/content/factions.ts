import type { ResourceId } from "../model/resources.js";

export const FACTION_IDS = ["ferride", "ostara_league", "aether_cartel"] as const;

export type FactionId = (typeof FACTION_IDS)[number];

export interface FactionDef {
  id: FactionId;
  /** Nom d'affichage — canonique ici pour que le serveur puisse l'utiliser aussi
   * (ex. émetteur d'un contrat de faction, chantier 15) sans dupliquer le lore côté client. */
  name: string;
  /** Couleur d'affichage (carte, contrats). */
  color: string;
  /** Production PNJ par tick économique : le stock monte, le prix baisse. */
  produces: Partial<Record<ResourceId, number>>;
  /** Consommation PNJ par tick économique : le stock descend, le prix monte. */
  consumes: Partial<Record<ResourceId, number>>;
}

/**
 * Trois factions marchandes aux profils complémentaires : chacune vend sa
 * spécialité à bas prix et paie cher ce qui lui manque — les routes d'arbitrage
 * émergent des profils. Descriptions/lore étendu côté client (labels.ts).
 */
export const FACTIONS: Record<FactionId, FactionDef> = {
  // Consortium industriel : forges orbitales, affamé de vivres.
  ferride: {
    id: "ferride",
    name: "Consortium Ferride",
    color: "#ff8c42",
    produces: { metals: 45, components: 12, ore: 25 },
    consumes: { food: 40, goods: 25 },
  },
  // Ligue agraire : greniers de la galaxie, dépendante de l'industrie.
  ostara_league: {
    id: "ostara_league",
    name: "Ligue Agraire d'Ostara",
    color: "#7ec850",
    produces: { food: 55, goods: 30 },
    consumes: { metals: 30, components: 8, energy: 25 },
  },
  // Cartel de l'énergie : réacteurs et minerai brut, friand de produits finis.
  aether_cartel: {
    id: "aether_cartel",
    name: "Cartel de l'Éther",
    color: "#a78bfa",
    produces: { energy: 55, ore: 35 },
    consumes: { components: 10, goods: 30 },
  },
};
