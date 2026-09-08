import {
  GATE_AVOIDANCE_PENALTY,
  GATEWAY_JUMP_WEIGHT,
  HOSTILE_SYSTEM_PENALTY,
  JUMP_REFERENCE_LENGTH,
} from "../../constants.js";
import {
  primaryOf,
  type ClientUniverse,
  type Galaxy,
  type StarSystem,
} from "../../model/universe.js";
import { whiteHoleType } from "../../content/astro/white-hole-types.js";
import { distance3 } from "./geometry.js";

/**
 * Graphe de saut et recherche d'itinéraire (chantier 31.10). Séparé de `travel.ts`, qui
 * ne s'occupe que de convertir un coût en durée, en crédits et en carburant.
 *
 * Une arête pèse sa longueur 3D divisée par `JUMP_REFERENCE_LENGTH` — voir
 * [ADR 0006](../../../../../docs/adr/0006-univers-volumetrique-deux-echelles.md) et le
 * verrou `travel.calibration.test.ts`.
 */
export interface Arc {
  readonly to: string;
  /** Coût réel de l'arête, en équivalent-saut. */
  readonly weight: number;
  /** Portail inter-galactique plutôt que saut ordinaire. */
  readonly gate: boolean;
}

export type Graph = Map<string, Arc[]>;

/** Coût utilisé par la RECHERCHE — distinct du coût réel, qui reste `arc.weight`. */
export type ArcCost = (arc: Arc) => number;

function addArc(
  graph: Graph,
  a: string,
  b: string,
  weight: number,
  gate: boolean,
) {
  graph.set(a, [...(graph.get(a) ?? []), { to: b, weight, gate }]);
  graph.set(b, [...(graph.get(b) ?? []), { to: a, weight, gate }]);
}

/**
 * Coût forfaitaire d'un pont d'Einstein-Rosen, en équivalent-saut (chantier 47).
 *
 * Forfaitaire pour la même raison qu'un portail : la longueur 3D d'un pont n'a aucun sens,
 * ses deux bouches étant appariées par leur distance en SAUTS et non par leur position. Le
 * modèle le dit déjà — « une arête de saut est pondérée par sa longueur 3D réelle, ce qui n'a
 * aucun sens pour un pont ».
 *
 * Deux fois moins cher qu'un portail (`GATEWAY_JUMP_WEIGHT`) : un portail franchit un abîme
 * inter-galactique et se construit, un pont se trouve. Reste au-dessus d'un saut ordinaire —
 * traverser une singularité n'est pas gratuit.
 */
const BRIDGE_WEIGHT = 2;

/**
 * Surcoût d'une bouche instable.
 *
 * `permanent` était le dernier champ de catalogue sans lecteur après le chantier 45.5 : « ce
 * qui distingue un raccourci fiable d'une curiosité » ne distinguait rien. Une fontaine
 * naissante reste franchissable, mais l'attente d'une ouverture se paie dans le prix — le
 * lecteur le moins cher qui soit honnête, et qui ne demande aucun modèle temporel.
 */
const INTERMITTENT_BRIDGE = 1.8;

/**
 * Graphe d'une galaxie seule — aucun portail, donc aucune arête de portail.
 *
 * `bridges` par défaut à **faux**, comme `extraLinks` l'est pour les portails, et pour la même
 * raison : `travel.calibration.test.ts` mesure la géométrie de base contre un compte de sauts,
 * et des raccourcis ajoutés d'un seul côté feraient chuter le rapport sans qu'il y ait de
 * défaut. Le jeu passe `true`, la calibration garde le graphe nu.
 */
export function galaxyGraph(galaxy: Galaxy, bridges = false): Graph {
  const byId = new Map(galaxy.systems.map((s) => [s.id, s]));
  const graph: Graph = new Map();
  for (const [a, b] of galaxy.links) {
    const sa = byId.get(a);
    const sb = byId.get(b);
    if (sa && sb)
      addArc(graph, a, b, distance3(sa, sb) / JUMP_REFERENCE_LENGTH, false);
  }
  if (bridges)
    for (const [a, b] of galaxy.bridges) addBridge(graph, byId, a, b);
  return graph;
}

/**
 * Un pont, si ses deux bouches existent.
 *
 * Le poids se lit de la bouche de FONTAINE : c'est elle qui s'ouvre ou non, un trou noir
 * n'étant jamais intermittent. `pairBridges` garantit une paire fontaine ↔ trou noir, mais le
 * sens n'est pas fixé dans la donnée — on cherche donc laquelle des deux l'est.
 */
function addBridge(
  graph: Graph,
  byId: Map<string, StarSystem>,
  a: string,
  b: string,
): void {
  const sa = byId.get(a);
  const sb = byId.get(b);
  if (!sa || !sb) return;
  const mouth = [sa, sb]
    .map((s) => primaryOf(s))
    .find((body) => body?.kind === "whiteHole");
  const stable = mouth ? whiteHoleType(mouth.typeId).permanent : true;
  addArc(
    graph,
    a,
    b,
    BRIDGE_WEIGHT * (stable ? 1 : INTERMITTENT_BRIDGE),
    false,
  );
}

/**
 * Graphe de l'univers entier. Les portails reçoivent un poids forfaitaire : leur
 * longueur réelle se compte en centaines de milliers d'unités, la facturer rendrait
 * toute galaxie voisine inatteignable.
 */
export function universeGraph(
  universe: ClientUniverse,
  extraLinks: readonly [string, string][] = [],
  bridges = false,
): Graph {
  const byId = new Map(
    universe.galaxies.flatMap((g) => g.systems.map((s) => [s.id, s] as const)),
  );
  const graph: Graph = new Map();
  for (const galaxy of universe.galaxies) {
    for (const [a, b] of galaxy.links) {
      const sa = byId.get(a);
      const sb = byId.get(b);
      if (sa && sb)
        addArc(graph, a, b, distance3(sa, sb) / JUMP_REFERENCE_LENGTH, false);
    }
  }
  if (bridges)
    for (const galaxy of universe.galaxies)
      for (const [a, b] of galaxy.bridges) addBridge(graph, byId, a, b);
  for (const [a, b] of extraLinks)
    addArc(graph, a, b, GATEWAY_JUMP_WEIGHT, true);
  return graph;
}

/**
 * Tas binaire minimal — Dijkstra sur ~2 000 systèmes tournerait en O(V²) avec un
 * balayage linéaire, soit 4 M d'opérations à chaque commande de déplacement.
 */
class MinHeap {
  private readonly items: { cost: number; id: string }[] = [];

  get size(): number {
    return this.items.length;
  }

  push(cost: number, id: string): void {
    this.items.push({ cost, id });
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent]!.cost <= this.items[i]!.cost) break;
      [this.items[parent], this.items[i]] = [
        this.items[i]!,
        this.items[parent]!,
      ];
      i = parent;
    }
  }

  pop(): { cost: number; id: string } | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0 && last) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (
          left < this.items.length &&
          this.items[left]!.cost < this.items[smallest]!.cost
        )
          smallest = left;
        if (
          right < this.items.length &&
          this.items[right]!.cost < this.items[smallest]!.cost
        )
          smallest = right;
        if (smallest === i) break;
        [this.items[smallest], this.items[i]] = [
          this.items[i]!,
          this.items[smallest]!,
        ];
        i = smallest;
      }
    }
    return top;
  }
}

/**
 * Dijkstra rendant le chemin. `arcCost` permet de chercher selon un autre critère que
 * le coût réel (éviter les portails, contourner un territoire hostile) — le chemin
 * trouvé est ensuite **retarifé au coût réel** par `priceOf`, sinon on afficherait au
 * joueur un prix qui n'existe pas.
 */
export function shortestPath(
  graph: Graph,
  from: string,
  to: string,
  arcCost: ArcCost = (arc) => arc.weight,
): string[] | null {
  if (from === to) return [from];
  const best = new Map<string, number>([[from, 0]]);
  const previous = new Map<string, string>();
  const settled = new Set<string>();
  const heap = new MinHeap();
  heap.push(0, from);

  while (heap.size > 0) {
    const current = heap.pop()!;
    if (settled.has(current.id)) continue;
    settled.add(current.id);
    if (current.id === to) break;

    for (const arc of graph.get(current.id) ?? []) {
      if (settled.has(arc.to)) continue;
      const candidate = current.cost + arcCost(arc);
      if (candidate < (best.get(arc.to) ?? Number.POSITIVE_INFINITY)) {
        best.set(arc.to, candidate);
        previous.set(arc.to, current.id);
        heap.push(candidate, arc.to);
      }
    }
  }

  if (!settled.has(to)) return null;
  const path = [to];
  let cursor = to;
  while (cursor !== from) {
    const step = previous.get(cursor);
    if (step === undefined) return null;
    path.push(step);
    cursor = step;
  }
  return path.reverse();
}

/** Coût réel et nombre de portails d'un chemin donné — sert aussi à valider côté serveur. */
export function priceOf(
  graph: Graph,
  path: readonly string[],
): { cost: number; gates: number } | null {
  if (path.length === 0) return null;
  if (path.length === 1) return { cost: 0, gates: 0 };
  let cost = 0;
  let gates = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const arc = (graph.get(path[i]!) ?? []).find((a) => a.to === path[i + 1]);
    // Une arête absente = chemin forgé ou univers modifié depuis : on refuse.
    if (!arc) return null;
    cost += arc.weight;
    if (arc.gate) gates++;
  }
  return { cost, gates };
}

/** Critère d'un itinéraire proposé au joueur. */
export type RouteKind = "cheapest" | "fewestGates" | "safest";

export interface TravelRoute {
  kind: RouteKind;
  /** Systèmes traversés, origine et destination comprises. */
  path: string[];
  /** Coût RÉEL du chemin, jamais le coût de recherche. */
  cost: number;
  gates: number;
}

/**
 * Itinéraires proposés au joueur. Sans ce choix, le solveur trancherait seul et la
 * pondération des arêtes du chantier 31.6 ne produirait aucune décision de jeu.
 *
 * Les doublons sont écartés : quand le trajet le moins cher évite déjà les portails et
 * l'espace hostile, une seule option est rendue — proposer trois fois le même chemin
 * sous trois noms serait un faux choix.
 */
export function routeCandidates(
  graph: Graph,
  from: string,
  to: string,
  hostileSystemIds: ReadonlySet<string> = new Set(),
): TravelRoute[] {
  const criteria: [RouteKind, ArcCost][] = [
    ["cheapest", (arc) => arc.weight],
    [
      "fewestGates",
      (arc) => arc.weight + (arc.gate ? GATE_AVOIDANCE_PENALTY : 0),
    ],
    [
      "safest",
      (arc) =>
        arc.weight +
        (hostileSystemIds.has(arc.to) ? HOSTILE_SYSTEM_PENALTY : 0),
    ],
  ];

  const routes: TravelRoute[] = [];
  const seen = new Set<string>();
  for (const [kind, arcCost] of criteria) {
    const path = shortestPath(graph, from, to, arcCost);
    if (!path) continue;
    const key = path.join(">");
    if (seen.has(key)) continue;
    const priced = priceOf(graph, path);
    if (!priced) continue;
    seen.add(key);
    routes.push({ kind, path, cost: priced.cost, gates: priced.gates });
  }
  return routes;
}

/** Résultat d'une demande de trajet : coût réel, ou la raison du refus. */
export type TravelPlan =
  | { ok: true; cost: number; gates: number; path: string[] }
  | { ok: false; reason: "unreachable" | "invalidRoute" };

/**
 * Tarifie un trajet, avec ou sans itinéraire imposé (chantier 31.10).
 *
 * Sans `route`, prend le chemin le moins cher — comportement d'avant le choix
 * d'itinéraire. Avec `route`, le chemin fourni est **validé puis retarifé sur le graphe
 * réel** : le serveur ne fait jamais confiance au client sur le prix, et un chemin dont
 * une étape n'est pas une arête existante est refusé. C'est ce qui rend sûr de laisser
 * le client calculer les itinéraires qu'il propose.
 */
export function planTravel(
  universe: ClientUniverse,
  fromSystemId: string,
  toSystemId: string,
  extraLinks: readonly [string, string][] = [],
  route?: readonly string[],
): TravelPlan {
  const graph = universeGraph(universe, extraLinks);
  if (route && route.length > 0) {
    if (route[0] !== fromSystemId || route[route.length - 1] !== toSystemId)
      return { ok: false, reason: "invalidRoute" };
    const priced = priceOf(graph, route);
    if (!priced) return { ok: false, reason: "invalidRoute" };
    return { ok: true, ...priced, path: [...route] };
  }
  const path = shortestPath(graph, fromSystemId, toSystemId);
  const priced = path && priceOf(graph, path);
  if (!path || !priced) return { ok: false, reason: "unreachable" };
  return { ok: true, ...priced, path };
}

/**
 * Systèmes tenus par un empire avec lequel on est en guerre (chantier 31.10).
 *
 * Alimente le critère « le plus sûr » de `routeCandidates`. Volontairement limité à
 * l'état `war` : un empire neutre ou sous pacte de non-agression n'a pas à rendre son
 * territoire évitable, sans quoi le contournement deviendrait le défaut partout.
 */
export function hostileSystemIds(
  territories: readonly { systemId: string; ownerId: string }[],
  relations: readonly { empireA: string; empireB: string; state: string }[],
  selfEmpireId: string,
): Set<string> {
  const enemies = new Set<string>();
  for (const relation of relations) {
    if (relation.state !== "war") continue;
    if (relation.empireA === selfEmpireId) enemies.add(relation.empireB);
    else if (relation.empireB === selfEmpireId) enemies.add(relation.empireA);
  }
  const systems = new Set<string>();
  for (const territory of territories) {
    if (enemies.has(territory.ownerId)) systems.add(territory.systemId);
  }
  return systems;
}
