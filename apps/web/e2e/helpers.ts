import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Email jetable, unique par test — la base e2e est en mémoire mais partagée entre specs. */
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

/** Inscrit un compte neuf et attend l'atterrissage sur la colonie mère. */
export async function registerFreshEmpire(
  page: Page,
  opts: { prefix: string; empireName: string },
): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Inscription" }).click();
  await page.getByLabel("Adresse e-mail").fill(uniqueEmail(opts.prefix));
  await page.getByLabel("Mot de passe").fill("password123");
  await page.getByLabel("Nom de l'empire").fill(opts.empireName);
  await page.getByRole("button", { name: "Fonder l'empire" }).click();
  await expect(page.getByText(/Colonie mère/)).toBeVisible({ timeout: 15_000 });
}

/** Fenêtres de mesure. La MEILLEURE est retenue — voir `framesPerSecond`. */
const FPS_SAMPLES = 3;

/**
 * Compte les images produites en une seconde — mesure directe du budget d'animation.
 *
 * Partagé depuis le chantier 35.7 : le rendu 3D est la seule partie du jeu où une
 * régression de performance ne casse aucun test unitaire et ne se voit qu'à l'usage, et il
 * faut désormais la mesurer au repos ET pendant une transition de palier, où deux couches
 * coexistent.
 *
 * **Trois fenêtres, et on garde la meilleure** (chantier 40.9). Le pilote OpenGL est logiciel
 * dans le conteneur : le même palier a rendu 22, 27, 31 et 39 images selon les passages, pour
 * un seuil à 20 — la suite a déjà échoué au hasard. Ce n'est pas un adoucissement du seuil :
 * ce qu'on veut protéger est le **plancher de l'implémentation**, pas la charge de la machine
 * hôte. Une régression qui coûte dix images les coûte dans les trois fenêtres ; une seconde
 * volée par un autre processus ne compte plus.
 *
 * La moyenne aurait été le mauvais choix : elle mélange les deux, et une seule fenêtre
 * mangeuse suffit à la faire passer sous le seuil.
 */
export async function framesPerSecond(page: Page): Promise<number> {
  let best = 0;
  for (let i = 0; i < FPS_SAMPLES; i++) {
    const frames = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let count = 0;
          const start = performance.now();
          const tick = () => {
            count++;
            if (performance.now() - start >= 1000) resolve(count);
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
    );
    best = Math.max(best, frames);
  }
  return best;
}

/**
 * Déplie le panneau d'objets de la carte s'il ne l'est pas déjà (chantier 36.4).
 *
 * Il s'ouvre replié au premier chargement depuis que les noms se posent sur les objets :
 * toute spec qui passe par la liste DOM doit donc l'ouvrir. Le libellé porte un compte et
 * dépend de la locale — d'où la recherche par le début du mot, commun au français et à
 * l'anglais.
 */
export async function openMapObjects(page: Page): Promise<void> {
  const toggle = page.getByRole("button", { name: /\d+ obje/i });
  if ((await toggle.getAttribute("aria-expanded")) === "false")
    await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}
