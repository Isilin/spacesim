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

/**
 * Compte les images produites en une seconde — mesure directe du budget d'animation.
 *
 * Partagé depuis le chantier 35.7 : le rendu 3D est la seule partie du jeu où une
 * régression de performance ne casse aucun test unitaire et ne se voit qu'à l'usage, et il
 * faut désormais la mesurer au repos ET pendant une transition de palier, où deux couches
 * coexistent.
 */
export function framesPerSecond(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = () => {
          frames++;
          if (performance.now() - start >= 1000) resolve(frames);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
}
