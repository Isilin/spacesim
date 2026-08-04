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

  // Raccourci "Ma capitale" (chantier 9.7) : ouvre directement le système de la colonie mère.
  await page.getByRole("button", { name: "Ma capitale" }).click();
  await expect(page).toHaveURL(/\/map\/galaxy\/[^/]+\/system\/[^/]+$/);

  const deepUrl = page.url();
  await page.reload();

  await expect(page).toHaveURL(deepUrl);
  // Le nom du système est le titre du <Panel> du panneau latéral (chantier 22.14) — h3,
  // le niveau que Panel utilise partout dans le design system. `.first()` : un système avec
  // comptoir affiche aussi un second panneau (TradingPostPanel) avec son propre h3 — seul le
  // premier (SystemPanel) importe pour ce test de survie du deep-link.
  await expect(page.getByRole("heading", { level: 3 }).first()).toBeVisible();
});
