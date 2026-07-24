import { TECH_IDS, TECHS, type TechBranch, type TechId } from "../content/techs.js";

/** Position d'une tech dans l'arbre affiché. */
export interface TechPosition {
  branch: TechBranch;
  /** Profondeur = longueur du plus long chemin de prérequis (0 = racine). */
  depth: number;
  /** Rang parmi les techs de même branche et même profondeur (ordre stable). */
  row: number;
}

const depthCache = new Map<TechId, number>();

/**
 * Profondeur d'une tech dans le graphe de prérequis : longueur du **plus long**
 * chemin depuis une racine. Le plus long, et non le plus court, pour qu'une tech
 * apparaisse toujours à droite de tous ses prérequis quand on la dessine.
 *
 * Mémoïsée : le contenu est statique, le calcul n'a lieu qu'une fois par tech.
 */
export function techDepth(id: TechId): number {
  const cached = depthCache.get(id);
  if (cached !== undefined) return cached;
  const tech = TECHS[id];
  if (!tech) return 0;
  // Garde-fou anti-cycle : la valeur provisoire empêche une récursion infinie si le
  // contenu venait à être mal saisi (validateTree signale le problème par ailleurs).
  depthCache.set(id, 0);
  const depth =
    tech.requires.length === 0 ? 0 : Math.max(...tech.requires.map((r) => techDepth(r) + 1));
  depthCache.set(id, depth);
  return depth;
}

/**
 * Position de chaque tech : branche en ligne, profondeur en colonne, rang pour
 * départager les ex æquo. L'ordre de `TECH_IDS` fixe les rangs — disposition stable
 * d'un rendu à l'autre.
 */
export function techLayout(): Map<TechId, TechPosition> {
  const layout = new Map<TechId, TechPosition>();
  const counters = new Map<string, number>();
  for (const id of TECH_IDS) {
    const tech = TECHS[id];
    const depth = techDepth(id);
    const key = `${tech.branch}:${depth}`;
    const row = counters.get(key) ?? 0;
    counters.set(key, row + 1);
    layout.set(id, { branch: tech.branch, depth, row });
  }
  return layout;
}

/** Prérequis directs manquants pour lancer une tech. */
export function missingPrereqs(id: TechId, researched: readonly TechId[]): TechId[] {
  return (TECHS[id]?.requires ?? []).filter((r) => !researched.includes(r));
}

/**
 * Chaîne complète à rechercher pour atteindre `target`, prérequis d'abord.
 * Vide si la tech est déjà acquise. C'est ce qui permet de cliquer une tech
 * verrouillée et de planifier tout ce qui y mène.
 */
export function researchPath(target: TechId, researched: readonly TechId[]): TechId[] {
  const done = new Set<TechId>(researched);
  const path: TechId[] = [];
  const seen = new Set<TechId>();

  const visit = (id: TechId) => {
    if (done.has(id) || seen.has(id)) return;
    seen.add(id);
    const tech = TECHS[id];
    if (!tech) return;
    for (const req of tech.requires) visit(req);
    path.push(id);
  };

  visit(target);
  return path;
}

/** Coût cumulé en science d'une chaîne de recherche. */
export function pathCost(path: readonly TechId[]): number {
  return path.reduce((sum, id) => sum + (TECHS[id]?.cost ?? 0), 0);
}

/** Durée cumulée d'une chaîne de recherche, en ms. */
export function pathDurationMs(path: readonly TechId[]): number {
  return path.reduce((sum, id) => sum + (TECHS[id]?.durationMs ?? 0), 0);
}

/** Toutes les techs dont `id` est un prérequis, direct ou non (pour la mise en valeur). */
export function descendants(id: TechId): TechId[] {
  const out: TechId[] = [];
  for (const candidate of TECH_IDS) {
    if (candidate !== id && researchPath(candidate, []).includes(id)) out.push(candidate);
  }
  return out;
}

/**
 * Contrôle d'intégrité du contenu : prérequis inconnus et cycles. Testé en CI —
 * une faute de frappe dans `requires` casserait silencieusement la progression.
 */
export function validateTree(): string[] {
  const problems: string[] = [];
  for (const id of TECH_IDS) {
    for (const req of TECHS[id].requires) {
      if (!TECHS[req]) problems.push(`${id} exige une tech inconnue : ${req}`);
    }
  }

  // Détection de cycle par parcours en profondeur avec pile d'exploration.
  const state = new Map<TechId, "visiting" | "done">();
  const visit = (id: TechId, stack: TechId[]) => {
    if (state.get(id) === "done") return;
    if (state.get(id) === "visiting") {
      problems.push(`cycle de prérequis : ${[...stack, id].join(" → ")}`);
      return;
    }
    state.set(id, "visiting");
    for (const req of TECHS[id]?.requires ?? []) visit(req, [...stack, id]);
    state.set(id, "done");
  };
  for (const id of TECH_IDS) visit(id, []);
  return problems;
}
