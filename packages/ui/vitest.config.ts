import { defineConfig } from "vitest/config";

/**
 * Tests de composants du design system (chantier 43.7).
 *
 * Ce paquet n'avait ni test ni script `test` : il était donc invisible de `pnpm -r test`,
 * et l'absence ne se voyait nulle part — un paquet sans script est silencieusement sauté.
 * Il porte pourtant les trois composants les plus délicats du dépôt en accessibilité
 * (`Modal`, `Popover`, `ZoomableSvg`), seuls porteurs de logique et seuls porteurs de
 * suppressions `biome-ignore` a11y.
 *
 * Les CSS Modules ne sont pas traités (`css` reste à sa valeur par défaut) : un import
 * `styles.module.css` rend un objet vide et `className` vaut `undefined`. C'est voulu —
 * ces tests décrivent des COMPORTEMENTS (focus, clavier, rôles ARIA), jamais des classes.
 */
export default defineConfig({
  test: { environment: "jsdom" },
});
