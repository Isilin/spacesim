import type { ResourceId } from "./resources.js";

/**
 * Règle d'ascension d'une ressource (chantier 12) : ce qu'on garde au sol et dans
 * quel sens le surplus circule entre la surface et l'orbite.
 */
export interface LiftRule {
  /** Quantité conservée au sol (sens `up`) ou visée au sol (sens `down`). */
  keepGround: number;
  /** `up` : monter le surplus en orbite. `down` : redescendre l'orbite vers le sol. */
  direction: "up" | "down";
}

export type RouteRule =
  | { type: "maintain"; minAtDestination: number; keepAtSource: number }
  | { type: "fixed"; amount: number }
  | { type: "surplus"; keepAtSource: number };

/** Route logistique automatique : cycles aller-retour tant que la règle le demande. */
export interface Route {
  id: string;
  /** Colonie qui fournit les cargos, paie les frais et encaisse les ventes. */
  ownerColonyId: string;
  /** Source : colonie ou avant-poste minier (ressource forcée au minerai). */
  fromId: string;
  fromKind: "colony" | "outpost";
  /** Destination : colonie ou comptoir commercial. */
  toId: string;
  toKind: "colony" | "tradingPost";
  resource: ResourceId;
  rule: RouteRule;
  /** Vaisseaux réservés à la route (retirés du pool de la colonie propriétaire). Id de vaisseau
   * (ShipId, cf. model/industry.ts) — clé `string` ici pour éviter un import croisé. */
  ships: Partial<Record<string, number>>;
  /** Cycle en cours, null = au repos à la source. */
  activeCycle: { departedAt: number; arrivesAt: number; backAt: number; carrying: number } | null;
  paused: boolean;
}

/** Convoi cargo ponctuel entre deux colonies (vaisseau abstrait : coût + timer). */
export interface Transfer {
  id: string;
  fromColonyId: string;
  toColonyId: string;
  resources: Partial<Record<ResourceId, number>>;
  departedAt: number;
  arrivesAt: number;
}

/**
 * Mission de vaisseau abstrait.
 * probe : cible = système. colonize : cible = planète.
 * sell : cargaison vers un comptoir, créditée au prix spot à l'arrivée.
 * buy : budget crédits vers un comptoir ; buy_return : trajet retour chargé.
 * deliver_contract : cargaison vers la colonie d'un AUTRE empire (contrat, chantier 14).
 */
export interface Mission {
  id: string;
  kind:
    | "probe"
    | "colonize"
    | "sell"
    | "buy"
    | "buy_return"
    | "build_outpost"
    | "contribute_gateway"
    | "deliver_contract";
  fromColonyId: string;
  /** Id de système (probe), de planète (colonize) ou de comptoir/colonie (commerce). */
  targetId: string;
  departedAt: number;
  arrivesAt: number;
  /** sell / buy_return / deliver_contract : cargaison transportée. */
  cargo?: Partial<Record<ResourceId, number>>;
  /** buy : crédits emportés pour l'achat. */
  budget?: number;
  /** buy : ressource à acheter au spot. */
  buyResource?: ResourceId;
  /** buy : soute du cargo réservé — borne la quantité achetée. */
  capacity?: number;
  /** deliver_contract : contrat honoré, résolu contre l'empire émetteur à l'arrivée. */
  contractId?: string;
}
