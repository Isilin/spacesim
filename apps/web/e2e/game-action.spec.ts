import { expect, test } from "@playwright/test";
import { registerFreshEmpire } from "./helpers.js";

test("une action de jeu (construire) est confirmée par une mise à jour de tick", async ({
  page,
}) => {
  await registerFreshEmpire(page, {
    prefix: "action",
    empireName: "Bâtisseurs E2E",
  });

  const tickBefore = await page.getByText(/^Tick \d+$/).textContent();

  await page.getByRole("button", { name: "Construire" }).first().click();
  await expect(
    page.getByRole("heading", { name: /File de construction/ }),
  ).toContainText("1/3");

  // Le tick serveur (5s) doit finir par pousser une mise à jour visible côté client.
  await expect(async () => {
    const tickNow = await page.getByText(/^Tick \d+$/).textContent();
    expect(tickNow).not.toBe(tickBefore);
  }).toPass({ timeout: 10_000 });
});
