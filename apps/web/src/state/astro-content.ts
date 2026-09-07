import { type AstroOverrides, NO_ASTRO_OVERRIDES } from "@spacesim/shared";

/**
 * Contenu astronomique publié par le serveur (chantier 45.4).
 *
 * ## Ce que ça solde
 *
 * `docs/design.md` consignait depuis le chantier 31.22 que « `apps/web` ne voit pas
 * l'apparence éditée ». C'est ici que ça cesse : le client récupère les surcharges d'admin au
 * démarrage, et les replis génériques que l'ADR 0007 rend obligatoires servent enfin à ce
 * pour quoi ils ont été écrits — un identifiant qu'un éditeur a inventé finit vraiment par
 * arriver jusqu'au rendu.
 *
 * ## Pourquoi un module et pas un store React
 *
 * Ces surcharges sont lues depuis le **rendu three.js** — `bodyAppearance`, `bodyRadiusOf`,
 * `hasRings` — appelé pour chaque corps de chaque système, dans des fonctions pures qui ne
 * sont pas des composants. Les faire passer par un hook obligerait à propager un paramètre
 * dans une vingtaine de signatures et à re-rendre la scène pour une valeur qui ne change
 * jamais après le chargement.
 *
 * Un module qui se remplit une fois au démarrage dit exactement ça. Il vit dans `apps/web` et
 * non dans `packages/shared`, qui garde zéro état mutable : c'est le client qui a un cycle de
 * vie, pas le paquet partagé.
 */

let current: AstroOverrides = NO_ASTRO_OVERRIDES;

/** Les surcharges connues. Vides tant que la publication n'a pas répondu, et c'est correct :
 *  les définitions intégrées font foi, et un rendu sans surcharge est un rendu juste. */
export function astroOverrides(): AstroOverrides {
  return current;
}

export function setAstroOverrides(next: AstroOverrides): void {
  current = next;
}

/**
 * Récupère les surcharges publiées. Ne rejette jamais : un serveur qui ne répond pas laisse le
 * client sur ses définitions intégrées, ce qui est exactement le comportement d'avant ce
 * chantier — le contenu édité est un bonus, pas une dépendance de démarrage.
 */
export async function loadAstroOverrides(): Promise<void> {
  try {
    // Chemin relatif, comme `/auth/*` : le proxy Vite en dev, la même origine en production.
    const response = await fetch("/api/content/astro");
    if (!response.ok) return;
    const body = (await response.json()) as { astro?: AstroOverrides };
    if (body.astro) setAstroOverrides(body.astro);
  } catch {
    // Silencieux à dessein : voir ci-dessus.
  }
}
