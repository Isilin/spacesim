import { expect, test } from "@playwright/test";
import { framesPerSecond, registerFreshEmpire } from "./helpers.js";

/**
 * Aperçu 3D d'un objet manufacturé (chantier 33.7).
 *
 * Spec à part de `map3d.spec.ts`, qui est cadré sur la carte. L'aperçu n'avait AUCUNE
 * garde alors qu'il tourne en continu (`OrbitControls autoRotate`).
 */

test("l'aperçu 3D rend un vaisseau, sans erreur de console", async ({
  page,
}) => {
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
  // Le concepteur ouvre desormais sur la LISTE seule (chantier 34.6) : l'editeur, et donc
  // l'apercu, n'existent qu'en mode edition.
  await page.getByRole("button", { name: "+ Nouveau plan" }).click();
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

test("l'aperçu ne se recadre pas tout seul pendant qu'il tourne", async ({
  page,
}) => {
  // Régression : la caméra était orientée par `camera.lookAt` alors qu'`OrbitControls`
  // possède la caméra et la repositionne à chaque image depuis ses propres coordonnées
  // sphériques. Les deux se défaisaient mutuellement, et la rotation automatique partait
  // en à-coups avant/arrière.
  await registerFreshEmpire(page, {
    prefix: "steady",
    empireName: "Stables E2E",
  });
  await page.getByRole("link", { name: "Chantier" }).click();
  // Le concepteur ouvre desormais sur la LISTE seule (chantier 34.6) : l'editeur, et donc
  // l'apercu, n'existent qu'en mode edition.
  await page.getByRole("button", { name: "+ Nouveau plan" }).click();
  await page.getByLabel("Châssis").selectOption({ index: 1 });

  const host = page.locator(".model-preview");
  await expect
    .poll(() => host.getAttribute("data-preview-fits"), { timeout: 15_000 })
    .not.toBeNull();
  const before = await host.getAttribute("data-preview-fits");

  // Le temps de plusieurs tours de rotation automatique.
  await page.waitForTimeout(4000);
  expect(await host.getAttribute("data-preview-fits")).toBe(before);
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
  // Le concepteur ouvre desormais sur la LISTE seule (chantier 34.6) : l'editeur, et donc
  // l'apercu, n'existent qu'en mode edition.
  await page.getByRole("button", { name: "+ Nouveau plan" }).click();

  const chassis = page.getByLabel("Châssis");
  const canvas = page.locator(".model-preview canvas");
  const host = page.locator(".model-preview");
  const count = await chassis.locator("option").count();
  for (let i = 1; i < Math.min(count, 4); i++) {
    await chassis.selectOption({ index: i });
    await expect(canvas).toBeVisible();
    await page.waitForTimeout(400);
  }
  // Un recadrage par châssis choisi : il se rejoue quand l'objet change, jamais autrement.
  expect(Number(await host.getAttribute("data-preview-fits"))).toBeGreaterThan(
    1,
  );

  // Chaque changement reconstruit toutes les géométries : c'est le chemin où une fuite
  // de tampons GPU se produirait, et où un cadrage raté sauterait aux yeux.
  expect(errors).toEqual([]);
});
