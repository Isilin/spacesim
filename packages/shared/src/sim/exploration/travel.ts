import { DEFAULT_BALANCE, type BalanceConstants } from "../../balance.js";
import { INTRA_SYSTEM_REFERENCE_LENGTH } from "../../constants.js";
import { SHIPS, type ShipDef } from "../../content/ships.js";
import type {
  ClientUniverse,
  Galaxy,
  StarSystem,
} from "../../model/universe.js";
import { findGalaxyOfSystem } from "../../universe.js";
import { bodyPositionAt, distance3 } from "./geometry.js";
import { galaxyGraph, priceOf, shortestPath, universeGraph } from "./route.js";

/**
 * Coût de trajet (chantier 31.6). Ce n'est plus un compte de sauts : chaque arête pèse
 * sa longueur 3D réelle, divisée par `JUMP_REFERENCE_LENGTH` — calée pour que l'arête
 * moyenne d'un univers généré vaille ≈ 1. La valeur retournée reste donc à l'échelle du
 * compte de sauts d'avant, ce qui laisse intactes les constantes de `balance.ts` qui la
 * multiplient. Une arête courte coûte ~0,5, une longue ~1,9 : la géométrie pèse enfin.
 *
 * Voir [ADR 0006](../../../../../docs/adr/0006-univers-volumetrique-deux-echelles.md).
 */
/** Coût de trajet entre deux systèmes d'une même galaxie, -1 si inaccessible. */
export function travelCostInGalaxy(
  galaxy: Galaxy,
  fromSystemId: string,
  toSystemId: string,
): number {
  if (fromSystemId === toSystemId) return 0;
  const graph = galaxyGraph(galaxy);
  const path = shortestPath(graph, fromSystemId, toSystemId);
  const priced = path && priceOf(graph, path);
  return priced ? priced.cost : -1;
}

/**
 * Coût de trajet dans l'univers. `extraLinks` = liaisons de portail actives
 * (sim/gateways) ; sans elles, les galaxies restent isolées (-1 entre galaxies).
 *
 * Retourne le coût du chemin le moins cher. Pour proposer un CHOIX au joueur (éviter
 * les portails, contourner un territoire hostile), voir `routeCandidates` — le solveur
 * ne doit pas trancher seul, sans quoi la géométrie ne produit aucune décision.
 */
export function travelCostInUniverse(
  universe: ClientUniverse,
  fromSystemId: string,
  toSystemId: string,
  extraLinks: readonly [string, string][] = [],
): number {
  const from = findGalaxyOfSystem(universe, fromSystemId);
  const to = findGalaxyOfSystem(universe, toSystemId);
  if (!from || !to) return -1;
  // Cas courant : même galaxie, pas besoin du graphe global.
  if (from.id === to.id && extraLinks.length === 0) {
    return travelCostInGalaxy(from, fromSystemId, toSystemId);
  }
  const graph = universeGraph(universe, extraLinks);
  const path = shortestPath(graph, fromSystemId, toSystemId);
  const priced = path && priceOf(graph, path);
  return priced ? priced.cost : -1;
}

/**
 * Coût du trajet **entre deux corps d'un même système**, en équivalent-saut (chantier
 * 31.8). Additionnable au coût de graphe : une seule unité, donc les formules qui
 * multiplient `jumps` restent inchangées.
 *
 * Dépend du tick : les corps orbitent, deux planètes en conjonction sont bien plus
 * proches qu'en opposition. C'est la seule mécanique du jeu où attendre le bon moment
 * paie.
 *
 * `INTRA_SYSTEM_REFERENCE_LENGTH` est délibérément très supérieure à
 * `JUMP_REFERENCE_LENGTH` : traverser un système doit rester une fraction du prix d'un
 * saut interstellaire, jamais son équivalent. Retourne 0 si un corps est inconnu —
 * l'appelant a déjà validé ses entités, et un coût nul dégrade proprement vers le
 * comportement d'avant le chantier 31.
 */
export function intraSystemCost(
  system: StarSystem,
  fromBodyId: string,
  toBodyId: string,
  tick: number,
): number {
  if (fromBodyId === toBodyId) return 0;
  const from = system.planets.find((p) => p.id === fromBodyId);
  const to = system.planets.find((p) => p.id === toBodyId);
  if (!from || !to) return 0;
  return (
    distance3(
      bodyPositionAt(system, from, tick),
      bodyPositionAt(system, to, tick),
    ) / INTRA_SYSTEM_REFERENCE_LENGTH
  );
}

export function transferDurationMs(
  jumps: number,
  balance: BalanceConstants = DEFAULT_BALANCE,
): number {
  return balance.transferBaseMs + jumps * balance.transferMsPerJump;
}

export function transferCostCredits(
  jumps: number,
  balance: BalanceConstants = DEFAULT_BALANCE,
): number {
  return balance.transferBaseCredits + jumps * balance.transferCreditsPerJump;
}

// ── Convois (chantier 12) : le vaisseau employé compte enfin ──────────────────

/** Composition d'un convoi : nombre de vaisseaux par id (classe historique ou plan). */
export type ConvoyShips = Partial<Record<string, number>>;

/** Stats de convoi d'un id de vaisseau. */
export interface ConvoyStat {
  speedMult: number;
  fuelPerJump: number;
  capacity: number;
}

/** Provider par défaut : stats des classes civiles historiques (chantier 13 : plans → override). */
export function legacyConvoyStat(
  id: string,
  ships: Record<string, ShipDef> = SHIPS,
): ConvoyStat {
  const def = ships[id];
  return {
    speedMult: def?.speedMult ?? 1,
    fuelPerJump: def?.fuelPerJump ?? 0,
    capacity: def?.capacity ?? 0,
  };
}

function convoyEntries(ships: ConvoyShips): [string, number][] {
  return Object.entries(ships).filter(([, n]) => (n ?? 0) > 0) as [
    string,
    number,
  ][];
}

/**
 * Durée d'un convoi : celle du vaisseau le **plus lent**, un convoi ne se sépare pas.
 * Sans vaisseau précisé, on retombe sur le barème abstrait d'avant le chantier 12.
 */
export function convoyDurationMs(
  jumps: number,
  ships: ConvoyShips = {},
  statsOf: (id: string) => ConvoyStat = legacyConvoyStat,
  balance: BalanceConstants = DEFAULT_BALANCE,
): number {
  const entries = convoyEntries(ships);
  const slowest = entries.reduce(
    (max, [id]) => Math.max(max, statsOf(id).speedMult),
    0,
  );
  return transferDurationMs(jumps, balance) * (slowest || 1);
}

/**
 * Énergie brûlée par un convoi : chaque vaisseau paie ses sauts, plus une part liée à
 * la masse embarquée. Prélevée en orbite au départ — voyager coûte, et voyager chargé
 * coûte davantage.
 */
export function convoyFuel(
  jumps: number,
  ships: ConvoyShips,
  cargoMass = 0,
  statsOf: (id: string) => ConvoyStat = legacyConvoyStat,
  balance: BalanceConstants = DEFAULT_BALANCE,
): number {
  const perShip = convoyEntries(ships).reduce(
    (sum, [id, count]) => sum + statsOf(id).fuelPerJump * count,
    0,
  );
  const massPart = cargoMass * balance.fuelPerMassJump;
  return Math.ceil((perShip + massPart) * Math.max(1, jumps));
}

/**
 * Frais d'un convoi : frais de base par saut + péage par portail emprunté. Traverser
 * une galaxie n'est pas gratuit, sinon les anneaux lointains n'auraient pas de prix.
 */
export function convoyFees(
  jumps: number,
  portalsCrossed = 0,
  balance: BalanceConstants = DEFAULT_BALANCE,
): number {
  return (
    transferCostCredits(jumps, balance) +
    portalsCrossed * balance.gatewayTollCredits
  );
}

/** Capacité totale d'un convoi. */
export function convoyCapacity(
  ships: ConvoyShips,
  statsOf: (id: string) => ConvoyStat = legacyConvoyStat,
): number {
  return convoyEntries(ships).reduce(
    (sum, [id, count]) => sum + statsOf(id).capacity * count,
    0,
  );
}
