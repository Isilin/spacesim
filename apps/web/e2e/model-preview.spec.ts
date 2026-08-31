import { expect, test } from "@playwright/test";
import { registerFreshEmpire } from "./helpers.js";

/**
 * Aperçu 3D d'un objet manufacturé (chantier 33.7).
 *
 * Spec à part de `map3d.spec.ts`, qui est cadré sur la carte. L'aperçu n'avait AUCUNE
 * garde alors qu'il tourne en continu (`OrbitControls autoRotate`).
 */

/** Images produites en une seconde — même instrument que le budget de la carte. */
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

test("l'aperçu 3D rend un vaisseau, sans erreur de console", async ({ page }) => {
  // L'assertion la plus utile du lot : une faute dans le shader se signale par une
  // erreur de compilation en console et ne rend RIEN, pendant que la page continue de
  // fonctionner et que toutes les assertions DOM restent vertes. C'est la leçon du
  // chantier 31.24 appliquée par avance.
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await registerFreshEmpire(page, {
    prefix: "preview",
    empireName: "Maquettistes E2E",
  });

  await page.getByRole("link", { name: "Chantier" }).click();
  await page.getByLabel("Châssis").selectOption({ index: 1 });

  const canvas = page.locator(".model-preview canvas");
  await expect(canvas).toBeVisible();
  // WebGL n'a pas de dimension intrinsèque : sans hauteur explicite, R3F rend un canvas
  // de 300×150 par défaut sans rien signaler.
  await expect
    .poll(async () => (await canvas.boundingBox())?.height ?? 0, {
      timeout: 15_000,
    })
    .toBeGreaterThan(150);

  const fps = await framesPerSecond(page);
  // Seuil bas à dessein, comme pour la carte : il attrape un rendu effondré, pas une
  // variation de machine.
  expect(fps).toBeGreaterThan(20);
  console.log(`[33.7] images/s — aperçu vaisseau ${fps}`);

  expect(errors).toEqual([]);
});

test("changer de châssis recadre l'aperçu sans le casser", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await registerFreshEmpire(page, {
    prefix: "preview2",
    empireName: "Recadreurs E2E",
  });
  await page.getByRole("link", { name: "Chantier" }).click();

  const chassis = page.getByLabel("Châssis");
  const canvas = page.locator(".model-preview canvas");
  const count = await chassis.locator("option").count();
  for (let i = 1; i < Math.min(count, 4); i++) {
    await chassis.selectOption({ index: i });
    await expect(canvas).toBeVisible();
    await page.waitForTimeout(400);
  }

  // Chaque changement reconstruit toutes les géométries : c'est le chemin où une fuite
  // de tampons GPU se produirait, et où un cadrage raté sauterait aux yeux.
  expect(errors).toEqual([]);
});
