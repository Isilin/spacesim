/**
 * Pont entre les jetons de design et le rendu 3D (chantier 33.2).
 *
 * Le rendu 3D codait ses couleurs en dur, et pas les bonnes : les hexadécimaux repris du
 * `ui-brief` (`#4fc1ff`, `#e0b64f`…) datent d'avant que `packages/ui/src/tokens.css` ne
 * fixe les valeurs définitives (`#4fd8ff`, `#ffb04f`…). Deux sources de vérité pour la même
 * palette, et c'est la 3D qui avait la périmée — au point que le même emplacement de
 * propulsion était vert dans le diagramme 2D et ambre dans le modèle 3D.
 *
 * Voir [ADR 0013](../../../../docs/adr/0013-registre-holographique-des-apercus.md).
 */

import { zoneColorToken } from "../zonePalette.js";

/**
 * Cache de résolution. `getComputedStyle` force un recalcul de style : l'appeler par pièce
 * et par image coûterait cher pour une valeur qui ne bouge pas — le thème est unique et
 * sans mode clair (`ui-brief`, contrainte non négociable).
 */
const resolved = new Map<string, string>();

/**
 * Valeur d'une custom property CSS, avec repli obligatoire.
 *
 * Le repli n'est pas une précaution de style : ces fonctions tournent aussi sous Vitest,
 * où aucune feuille n'est chargée et où `getComputedStyle` rend une chaîne vide. Sans lui,
 * three.js recevrait `""` et rendrait du noir.
 */
export function themeColor(token: string, fallback: string): string {
  const cached = resolved.get(token);
  if (cached !== undefined) return cached;

  let value = "";
  if (typeof document !== "undefined") {
    value = getComputedStyle(document.documentElement)
      .getPropertyValue(token)
      .trim();
  }
  // Validation stricte, et pas seulement « non vide » : `getPropertyValue` rend la valeur
  // BRUTE d'une custom property, sans la substituer. Un jeton défini comme `var(--ko)` ou
  // `color-mix(…)` reviendrait tel quel, et `THREE.Color` ne sait pas le lire. On ne lit
  // donc que des jetons hexadécimaux de base.
  const color = /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback;
  resolved.set(token, color);
  return color;
}

/** Vide le cache — utile aux tests qui changent de thème simulé. */
export function resetThemeCache(): void {
  resolved.clear();
}

/**
 * Palette du registre holographique. Les replis sont les valeurs actuelles de `tokens.css`,
 * recopiées ici pour que le rendu reste juste hors navigateur ; en navigateur, c'est
 * `tokens.css` qui gagne.
 */
export const HOLO = {
  /** Teinte de structure : coque nue, moyeu, coursives. */
  structure: () => themeColor("--cyan", "#4fd8ff"),
  /** Trait des pièces provisoires (zone en file de construction). */
  ghost: () => themeColor("--border-bright", "#2f5670"),
  /** Plan de grille sous l'objet. */
  grid: () => themeColor("--border", "#22384c"),
} as const;

/**
 * Couleur d'un type d'emplacement, alignée sur le diagramme 2D (`styles.css`, les
 * `--slot-*`) : les deux vues du même vaisseau sont côte à côte à l'écran, elles ne peuvent
 * pas colorer un emplacement différemment.
 */
export function slotColor(slot: string): string {
  // On lit les jetons de BASE, pas les alias `--slot-*` : depuis le chantier 33.2 ceux-ci
  // valent `var(--ko)` etc., et une custom property qui en référence une autre revient
  // telle quelle par `getPropertyValue`. Les deux couches pointent le même jeton, donc
  // elles ne peuvent pas diverger.
  switch (slot) {
    case "weapon":
      return themeColor("--ko", "#ff5f5f");
    case "defense":
      return themeColor("--cyan", "#4fd8ff");
    case "propulsion":
      return themeColor("--ok", "#5ee08a");
    case "utility":
      return themeColor("--amber", "#ffb04f");
    default:
      // Repli générique obligatoire (ADR 0007) : un type inconnu reste visible.
      return themeColor("--muted", "#5d7590");
  }
}

/**
 * Repli hexadécimal de chaque jeton de la palette de zones, pour les contextes sans DOM.
 * Valeurs recopiées de `tokens.css`.
 */
const ZONE_FALLBACK: Record<string, string> = {
  "--amber": "#ffb04f",
  "--cyan": "#4fd8ff",
  "--violet": "#b98bff",
  "--ok": "#5ee08a",
  "--ko": "#ff5f5f",
};

/**
 * Couleur d'un type de zone de station — **même hachage que le diagramme 2D**
 * (`zonePalette.ts`). Les deux vues de la même station sont affichées l'une au-dessus de
 * l'autre : une table par id aurait rendu grise en 3D toute zone créée par un admin, alors
 * qu'elle est colorée en 2D.
 */
export function zoneColor(zoneTypeId: string): string {
  const token = zoneColorToken(zoneTypeId);
  return themeColor(token, ZONE_FALLBACK[token] ?? "#5d7590");
}
