import { expect, test } from "@playwright/test";
import { registerFreshEmpire } from "./helpers.js";

/**
 * Traversée continue des paliers de carte (chantier 35.2).
 *
 * Ce que ce test attrape et qu'aucun autre ne peut : la carte avait quatre scènes qui
 * s'excluaient, et changer de niveau démontait un canvas pour en monter un autre. Une
 * régression qui ramènerait ce comportement rendrait exactement la même image aux mêmes
 * moments — seul le nombre de canvas et la continuité de la profondeur la distinguent.
 *
 * `data-map-tier` et `data-map-depth` sont écrits par `TierCamera` faute de mieux : une
 * caméra 3D ne laisse aucune trace dans le DOM, même précédent que `data-map-fits` au
 * chantier 31.24.
 */

/** Attend que R3F ait mesuré son canvas et que la caméra ait publié un palier. */
async function settledTier(
  page: import("@playwright/test").Page,
): Promise<string | null> {
  const host = page.locator(".map-canvas");
  await expect(host.locator("canvas")).toBeVisible();
  await expect
    .poll(() => host.getAttribute("data-map-tier"), { timeout: 20_000 })
    .not.toBeNull();
  return host.getAttribute("data-map-tier");
}

test("le zoom descend dans une galaxie et remonte, sans changer de canvas", async ({
  page,
}) => {
  await registerFreshEmpire(page, {
    prefix: "mapzoom",
    empireName: "Traverseurs E2E",
  });

  await page.getByRole("link", { name: "Carte" }).click();
  await expect(page).toHaveURL(/\/map$/);

  const host = page.locator(".map-canvas");
  expect(await settledTier(page)).toBe("universe");

  // Viser une galaxie par la liste DOM parallèle : c'est le chemin accessible, et le seul
  // qui désigne une galaxie précise sans parier sur un pixel du canvas.
  const list = page.getByRole("navigation", { name: /univers|universe/i });
  await list.getByRole("button").first().dblclick();

  await expect
    .poll(() => host.getAttribute("data-map-tier"), { timeout: 15_000 })
    .toBe("galaxy");

  // L'invariant du chantier : un seul canvas, du premier palier au dernier. Deux canvas
  // successifs, c'est l'ancien modèle qui est revenu.
  await expect(host.locator("canvas")).toHaveCount(1);

  // La liste bascule sur le contenu du palier atteint.
  await expect(
    page.getByRole("navigation", { name: /galaxie|galaxy/i }),
  ).toBeVisible();

  // Remonter à la molette. Dézoomer au-delà du cadrage de la galaxie doit rendre l'amas,
  // sans qu'aucun bouton de retour ni fil d'Ariane n'ait à être touché.
  const box = (await host.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  for (let i = 0; i < 14; i++) {
    await page.mouse.wheel(0, 220);
    await page.waitForTimeout(60);
  }

  await expect
    .poll(() => host.getAttribute("data-map-tier"), { timeout: 15_000 })
    .toBe("universe");
  await expect(host.locator("canvas")).toHaveCount(1);
});

test("la profondeur de zoom varie en continu à l'intérieur d'un palier", async ({
  page,
}) => {
  // La bascule de palier prouve qu'on franchit ; elle ne prouve pas qu'on progresse. Sans
  // ce test, une implémentation qui sauterait d'un palier à l'autre par paliers entiers
  // passerait le test précédent sans avoir rien de continu.
  await registerFreshEmpire(page, {
    prefix: "mapdepth",
    empireName: "Profondeurs E2E",
  });

  await page.getByRole("link", { name: "Carte" }).click();
  const host = page.locator(".map-canvas");
  expect(await settledTier(page)).toBe("universe");

  const box = (await host.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  const seen = new Set<string>();
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, -160);
    await page.waitForTimeout(80);
    const depth = await host.getAttribute("data-map-depth");
    if (depth) seen.add(depth);
  }

  // Plusieurs profondeurs distinctes DANS la traversée : c'est la définition du continu.
  expect(seen.size).toBeGreaterThan(2);
});

test("la traversée va de l'amas jusqu'à un corps, puis en revient", async ({
  page,
}) => {
  // Remonter trois paliers à la molette demande une centaine de crans : `OrbitControls`
  // recule d'environ 5 % par cran, et une bande fait plusieurs octaves.
  test.setTimeout(120_000);
  // Le palier corps était le seul des quatre à n'être pas de la 3D : un schéma SVG figé,
  // sans zoom, où les lunes ne bougeaient jamais. Ce test affirme qu'il est devenu un
  // palier comme les autres — atteint par le même geste, quitté par le même.
  await registerFreshEmpire(page, {
    prefix: "maptrav",
    empireName: "Sondeurs E2E",
  });

  await page.getByRole("link", { name: "Carte" }).click();
  const host = page.locator(".map-canvas");
  expect(await settledTier(page)).toBe("universe");

  // Premier palier à la main, depuis la liste DOM parallèle.
  await page
    .getByRole("navigation", { name: /univers|universe/i })
    .getByRole("button")
    .first()
    .dblclick();
  await expect
    .poll(() => host.getAttribute("data-map-tier"), { timeout: 15_000 })
    .toBe("galaxy");

  // Puis la capitale : le brouillard vide les systèmes inexplorés de leurs corps, et un
  // système vide n'a rien dans quoi descendre. Le raccourci vise le seul système dont on
  // sait qu'il est peuplé.
  await page.getByRole("button", { name: "Ma capitale" }).click();
  await expect
    .poll(() => host.getAttribute("data-map-tier"), { timeout: 15_000 })
    .toBe("system");

  // Une lune s'ouvre en fiche, pas en palier : viser une planète.
  const bodies = page.getByRole("navigation", { name: /système|system/i });
  await expect(bodies.getByRole("button").first()).toBeVisible();
  await bodies
    .getByRole("button")
    .filter({ hasNotText: "Lune" })
    .first()
    .dblclick();
  await expect
    .poll(() => host.getAttribute("data-map-tier"), { timeout: 15_000 })
    .toBe("body");

  // Un seul canvas de l'amas jusqu'à la planète : c'est ce qui distingue une traversée
  // continue de quatre scènes qui se remplacent.
  await expect(host.locator("canvas")).toHaveCount(1);

  // Remonter jusqu'en haut à la seule molette, sans fil d'Ariane ni bouton de retour —
  // il n'y en a plus.
  const box = (await host.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const seen: string[] = [];
  for (let batch = 0; batch < 40; batch++) {
    const tier = await host.getAttribute("data-map-tier");
    if (tier && seen.at(-1) !== tier) seen.push(tier);
    if (tier === "universe") break;
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 240);
    await page.waitForTimeout(60);
  }
  expect(await host.getAttribute("data-map-tier")).toBe("universe");
  // Les trois frontières sont franchies dans l'ordre, aucune n'est sautée.
  expect(seen).toEqual(["body", "system", "galaxy", "universe"]);
  await expect(host.locator("canvas")).toHaveCount(1);
});
