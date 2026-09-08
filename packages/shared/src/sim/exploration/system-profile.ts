import { WIDE_BINARY } from "../../constants.js";
import {
  isDrifter,
  starsOf,
  type CentralBody,
  type CentralBodyKind,
  type StarSystem,
} from "../../model/universe.js";

/**
 * Fiche de lecture d'un système (chantier 47).
 *
 * ## Ce qu'elle remplace
 *
 * Le plan du chantier 45 la promettait en contrepartie de la disparition de `starClassOf` :
 * « garder une fonction de LECTURE qui décrit le système d'après ce qui y a été posé — c'est
 * ce qu'on attendait de "types de systèmes solaires" sans qu'un champ soit nécessaire ». Elle
 * n'a pas été livrée, et l'infobox est restée sur `starClass: string` — un champ, un type,
 * structurellement incapable de nommer les deux corps d'une binaire.
 *
 * ## Pourquoi ici et pas dans le client
 *
 * C'est une lecture pure du modèle, et elle doit être **la même** dans l'infobox de la carte
 * et dans le panneau de système : deux endroits qui divergeraient à la première évolution.
 * `shared` n'a pas d'i18n, donc elle ne rend que des identifiants et des comptes ; la phrase,
 * ses accords et l'ordre de ses segments sont de la langue et vivent dans `apps/web`.
 *
 * ## Ce qu'elle ne fait pas
 *
 * Elle n'invente rien sous le brouillard. Un système inexploré n'a ni corps centraux ni
 * mondes : `known` est faux, et l'appelant se tait plutôt que d'annoncer « 0 monde », qui
 * affirmerait quelque chose de faux.
 */

/** Disposition des corps centraux — lue des deux bandes de séparation, jamais d'un champ. */
export type Arrangement = "single" | "tight" | "wide";

export interface SystemGroup {
  kind: CentralBodyKind;
  typeId: string;
  count: number;
}

export interface SystemProfile {
  /** Faux si le brouillard a vidé le système : la fiche se tait au lieu de deviner. */
  known: boolean;
  arrangement: Arrangement;
  bodies: readonly CentralBody[];
  /**
   * Les corps groupés par (nature, type), dans l'ordre du premier rang.
   *
   * C'est ce qui permet « deux naines rouges » plutôt que « une naine rouge, une naine
   * rouge ». Le groupement est neutre en langue, il vit donc ici et non dans le libellé.
   */
  groups: readonly SystemGroup[];
  planets: number;
  moons: number;
  belts: number;
  /** Errant : une singularité, aucun monde. Lu d'`isDrifter`, jamais redéclaré. */
  drifter: boolean;
  /** Au moins une singularité — la seule chose qui fasse récolter de la matière exotique. */
  exotic: boolean;
  /** Meilleure habitabilité connue, ou -1 si le système n'annonce aucun monde. */
  bestHabitability: number;
}

export function systemProfile(system: StarSystem): SystemProfile {
  const bodies = starsOf(system);
  const planets = system.planets.filter((p) => p.kind === "planet").length;
  const moons = system.planets.filter((p) => p.kind === "moon").length;
  const habitabilities = system.planets.map((p) => p.habitability);

  const groups: SystemGroup[] = [];
  for (const body of bodies) {
    const same = groups.find(
      (g) => g.kind === body.kind && g.typeId === body.typeId,
    );
    if (same) same.count++;
    else groups.push({ kind: body.kind, typeId: body.typeId, count: 1 });
  }

  return {
    known: bodies.length > 0,
    arrangement: arrangementOf(bodies),
    bodies,
    groups,
    planets,
    moons,
    belts: system.belts.length,
    drifter: isDrifter(system),
    exotic: bodies.some((b) => b.kind !== "star"),
    bestHabitability:
      habitabilities.length > 0 ? Math.max(...habitabilities) : -1,
  };
}

/**
 * Serrée ou large, jamais l'entre-deux.
 *
 * Le seuil ne se réinvente pas : `WIDE_BINARY[0]` est la borne que le générateur emploie, et
 * la bande intermédiaire n'est jamais tirée — c'est ce qui rend la question binaire au lieu
 * d'approximative.
 */
function arrangementOf(bodies: readonly CentralBody[]): Arrangement {
  if (bodies.length <= 1) return "single";
  const separations = bodies.map((b) => b.orbitRadius).filter((r) => r > 0);
  if (separations.length === 0) return "single";
  return Math.min(...separations) >= WIDE_BINARY[0] ? "wide" : "tight";
}
