import { expect, test } from "@playwright/test";
import { registerFreshEmpire } from "./helpers.js";

test("navigation profonde vers une URL de carte survit au rechargement", async ({
  page,
}) => {
  await registerFreshEmpire(page, {
    prefix: "mapdeep",
    empireName: "Explorateurs E2E",
  });

  await page.getByRole("link", { name: "Carte" }).click();
  await expect(page).toHaveURL(/\/map$/);

  // Raccourci "Ma capitale" (chantier 9.7) : vise directement le système de la colonie
  // mère. Depuis le chantier 35.3 l'URL ne porte plus une hiérarchie de segments mais
  // l'état de la caméra — ce qu'elle vise et à quelle profondeur.
  await page.getByRole("button", { name: "Ma capitale" }).click();
  await expect(page).toHaveURL(/\/map\?.*at=/);
  const host = page.locator(".map-canvas");
  await expect
    .poll(() => host.getAttribute("data-map-tier"), { timeout: 20_000 })
    .toBe("system");

  const anchored = new URL(page.url()).searchParams.get("at");
  const depth = Number(new URL(page.url()).searchParams.get("z"));
  expect(anchored).toBeTruthy();
  expect(depth).toBeGreaterThanOrEqual(2);

  await page.reload();

  // Ce que le lien profond doit rendre : la même cible, au même palier. La profondeur
  // exacte se republie au repos, l'égalité stricte d'URL ne dirait donc rien de plus.
  await expect
    .poll(() => new URL(page.url()).searchParams.get("at"), { timeout: 20_000 })
    .toBe(anchored);
  await expect
    .poll(() => host.getAttribute("data-map-tier"), { timeout: 20_000 })
    .toBe("system");

  // Le nom du système est le titre du <Panel> du panneau latéral (chantier 22.14) — h3,
  // le niveau que Panel utilise partout dans le design system. `.first()` : un système avec
  // comptoir affiche aussi un second panneau (TradingPostPanel) avec son propre h3 — seul le
  // premier (SystemPanel) importe pour ce test de survie du deep-link.
  await expect(page.getByRole("heading", { level: 3 }).first()).toBeVisible();
});
