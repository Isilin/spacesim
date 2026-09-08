import {
  blackHoleType,
  starsOf,
  whiteHoleType,
  type StarSystem,
} from "@spacesim/shared";
import { astroOverrides } from "../state/astro-content.js";

/**
 * Teinte d'un nœud de système au palier galaxie (chantier 37.12, extrait au 46).
 *
 * ## Pourquoi une fonction et non un `useMemo`
 *
 * Elle vivait en ligne dans `GalaxyLayer`, donc hors de portée de tout test. C'est ce qui a
 * laissé passer le défaut que ce chantier corrige : écrite au palier 45.1, la lecture de la
 * singularité ne pouvait attraper que des errants, eux seuls portant `stars`. Le palier 45.2
 * en a donné à TOUS les systèmes, et une étoile tombait alors dans `blackHoleType()`, dont le
 * repli générique est le trou noir stellaire — **tout système exploré rendait son orange**.
 *
 * Rien ne pouvait le dire : les types étaient justes, et la valeur rendue restait une couleur
 * valide. Seule une fonction pure, comparée à ce qu'elle doit rendre cas par cas, peut
 * attraper cette espèce-là.
 *
 * ## L'ordre des clauses est l'ordre des priorités
 *
 * Ce que le joueur a besoin de savoir en premier passe devant : sa sélection, ses colonies,
 * ses stations, les territoires. La nature de l'objet ne parle qu'ensuite — et la neutralité
 * en dernier, où seul compte le contraste exploré/inexploré.
 */

/** Sélection courante — passe avant tout le reste. */
const SELECTED = "#8fd8ff";
const COLONIZED = "#7cf09a";
const WITH_STATION = "#f5cf7a";

/**
 * Les deux teintes neutres, relevées au chantier 37.12.
 *
 * Elles valaient `#7f95ad` et `#3a4757` quand une galaxie comptait quatorze systèmes largement
 * espacés ; à cinq cents, la vue se remplit surtout d'inexplorés, et un gris ardoise à 22 % de
 * luminance rendait la galaxie éteinte. L'ORDRE est conservé — un système exploré reste plus
 * clair qu'un inexploré, c'est ce que la couleur dit ici — mais le plancher se situe désormais
 * au-dessus du seuil où un point cesse de ressembler à une étoile.
 */
const EXPLORED = "#dce8f5";
const UNEXPLORED = "#8ea4bb";

export interface SystemNodeState {
  selected: boolean;
  colonized: boolean;
  withStation: boolean;
  /** Teinte de territoire, ou `undefined` si le système n'est revendiqué par personne. */
  territory: string | undefined;
  explored: boolean;
}

export function systemNodeColor(
  system: StarSystem,
  state: SystemNodeState,
): string {
  if (state.selected) return SELECTED;
  if (state.colonized) return COLONIZED;
  if (state.withStation) return WITH_STATION;
  if (state.territory) return state.territory;

  // Un errant n'est pas une étoile : il porte la teinte de sa singularité, et le brouillard la
  // lui retire tant qu'il n'est pas exploré — un système inexploré n'annonce jamais ce qu'il
  // abrite (`redactUniverse` vide `stars`, donc l'ancre manque et la clause ne s'ouvre pas).
  //
  // `kind !== "star"` n'est pas une précaution : sans elle, une étoile tombe dans
  // `blackHoleType()` et rend le repli stellaire. Voir l'en-tête du fichier.
  const anchor = starsOf(system)[0];
  if (anchor && anchor.kind !== "star") {
    const overrides = astroOverrides();
    return anchor.kind === "whiteHole"
      ? whiteHoleType(anchor.typeId, overrides).halo
      : blackHoleType(anchor.typeId, overrides).halo;
  }
  return state.explored ? EXPLORED : UNEXPLORED;
}
