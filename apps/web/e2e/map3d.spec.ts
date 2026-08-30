import { expect, test } from "@playwright/test";
import { registerFreshEmpire } from "./helpers.js";

/**
 * Référence de performance et de mise en page de la carte 3D (chantier 31.17).
 *
 * Mesurée ici plutôt qu'à la main : le rendu 3D est la seule partie du jeu où une
 * régression de performance ne casse aucun test unitaire et ne se voit qu'à l'usage.
 * Ce relevé est aussi le point de comparaison de la passe d'habillage (chantier 31.23),
 * qui ajoutera shaders et géométries sur cette même scène.
 */

/** Compte les images produites en une seconde — mesure directe du budget d'animation. */
async function framesPerSecond(page: import("@playwright/test").Page) {
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

/**
 * R3F dimensionne son canvas via un `ResizeObserver`, donc APRÈS le premier rendu :
 * mesurer immédiatement renvoie les 300×150 par défaut d'un `<canvas>` HTML. On attend
 * la taille stabilisée plutôt que d'abaisser le seuil — sinon le test ne distinguerait
 * plus un canvas mal dimensionné d'un canvas simplement lent à se mesurer.
 */
async function expectSizedCanvas(
  page: import("@playwright/test").Page,
  minWidth: number,
) {
  const canvas = page.locator(".map-canvas canvas");
  await expect(canvas).toBeVisible();
  await expect
    .poll(async () => (await canvas.boundingBox())?.height ?? 0, {
      timeout: 5000,
    })
    .toBeGreaterThan(200);
  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(minWidth);
}

test("la carte 3D rend et tient un budget d'images à chaque niveau", async ({
  page,
}) => {
  await registerFreshEmpire(page, {
    prefix: "map3d",
    empireName: "Cartographes E2E",
  });

  await page.getByRole("link", { name: "Carte" }).click();
  await expect(page).toHaveURL(/\/map$/);

  // Niveau univers : le canvas doit exister ET avoir une taille — WebGL n'a pas de
  // dimension intrinsèque, une erreur de CSS rendrait zéro pixel sans rien signaler.
  await expectSizedCanvas(page, 200);

  // La liste DOM parallèle publie les objets de la scène (chantier 31.16).
  const universeList = page.getByRole("navigation", {
    name: /univers|universe/i,
  });
  await expect(universeList.getByRole("button").first()).toBeVisible();

  const universeFps = await framesPerSecond(page);
  // Le seuil est bas à dessein : il attrape un rendu effondré (boucle bloquée,
  // re-render par image), pas une variation de machine.
  expect(universeFps).toBeGreaterThan(20);

  // Niveau système : le plus chargé des trois — orbites, corps repositionnés à chaque
  // image, sites du scan.
  await page.getByRole("button", { name: "Ma capitale" }).click();
  await expect(page).toHaveURL(/\/map\/galaxy\/[^/]+\/system\/[^/]+$/);
  await expectSizedCanvas(page, 200);
  const systemFps = await framesPerSecond(page);
  expect(systemFps).toBeGreaterThan(20);

  console.log(
    `[31.17] images/s — univers ${universeFps}, système ${systemFps}`,
  );
});

test("la carte 3D reste utilisable sur un écran de téléphone", async ({
  page,
}) => {
  // Parité avec le chantier 27.22 : sous 720 px, la liste passe SOUS la scène plutôt
  // que de l'écraser. Une carte de 150 px de haut n'est pas une carte.
  await page.setViewportSize({ width: 375, height: 812 });
  await registerFreshEmpire(page, {
    prefix: "map3dmob",
    empireName: "Mobiles E2E",
  });

  await page.getByRole("link", { name: "Carte" }).click();
  await expectSizedCanvas(page, 280);

  // Rien ne doit déborder horizontalement (contrainte de responsive du chantier 27.22).
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
