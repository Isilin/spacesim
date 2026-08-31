import { expect, test } from "@playwright/test";
import { registerFreshEmpire } from "./helpers.js";

/**
 * Corporations (chantier 32.11) — le premier scénario à DEUX joueurs de la suite.
 *
 * Deux contextes de navigateur isolés, donc deux sessions réelles : c'est le seul moyen
 * de vérifier qu'une invitation traverse le serveur, atteint le journal du destinataire
 * et lui donne un geste à faire. Un test à un joueur ne pourrait que constater qu'une
 * commande a été acceptée.
 */
test("une invitation traverse deux sessions et fait entrer le second joueur", async ({
  browser,
}) => {
  const founderCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const founder = await founderCtx.newPage();
  const guest = await guestCtx.newPage();

  await registerFreshEmpire(founder, {
    prefix: "corpf",
    empireName: "Fondateurs E2E",
  });
  await registerFreshEmpire(guest, {
    prefix: "corpg",
    empireName: "Invités E2E",
  });

  await founder.getByRole("link", { name: "Corporation" }).click();
  await founder.getByLabel("Nom").fill("Consortium E2E");
  await founder.getByLabel("Sigle").fill("E2E");
  await founder.getByRole("button", { name: "Fonder" }).click();
  await expect(founder.getByText(/Consortium E2E \[E2E\]/)).toBeVisible();

  // L'invité doit apparaître dans la liste : le classement est la seule source d'empires
  // connus côté client.
  const inviteRow = founder
    .locator("li", { hasText: "Invités E2E" })
    .getByRole("button", { name: "Inviter" });
  await expect(inviteRow).toBeVisible({ timeout: 15_000 });
  await inviteRow.click();

  // Côté invité : l'invitation arrive au journal ET dans sa vue Corporation.
  await expect(
    guest.getByRole("link", { name: /Journal \(\d+\)/ }),
  ).toBeVisible({ timeout: 15_000 });
  await guest.getByRole("link", { name: "Corporation" }).click();
  await expect(guest.getByText("Consortium E2E")).toBeVisible();
  await guest.getByRole("button", { name: "Accepter" }).click();

  // Il est membre : la vue bascule sur la corporation, sans droit d'exclusion.
  await expect(guest.getByText(/Consortium E2E \[E2E\]/)).toBeVisible();
  await expect(guest.getByRole("button", { name: "Exclure" })).toHaveCount(0);
  // Et le fondateur le voit arriver dans la liste des membres.
  await expect(
    founder.locator("li", { hasText: "Invités E2E" }).first(),
  ).toBeVisible({ timeout: 15_000 });

  await founderCtx.close();
  await guestCtx.close();
});

/**
 * Diplomatie de corporation (chantier 32.21) — deux corporations, deux sessions.
 *
 * Ce qu'un test à un joueur ne peut pas voir : qu'une déclaration de guerre atteint le
 * journal du camp d'en face, et qu'un pacte n'entre en vigueur qu'à réciprocité.
 */
test("une guerre de corporation prévient l'autre camp, un pacte attend la réciprocité", async ({
  browser,
}) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const vega = await ctxA.newPage();
  const rigel = await ctxB.newPage();

  await registerFreshEmpire(vega, { prefix: "dipa", empireName: "Vega E2E" });
  await registerFreshEmpire(rigel, { prefix: "dipb", empireName: "Rigel E2E" });

  for (const [page, name, tag] of [
    [vega, "Consortium Vega", "VEGA"],
    [rigel, "Guilde Rigel", "RIGL"],
  ] as const) {
    await page.getByRole("link", { name: "Corporation" }).click();
    await page.getByLabel("Nom").fill(name);
    await page.getByLabel("Sigle").fill(tag);
    await page.getByRole("button", { name: "Fonder" }).click();
    await expect(page.getByText(new RegExp(`\\[${tag}\\]`))).toBeVisible();
  }

  // L'annuaire public rend l'autre corporation visible et visable.
  const rigelRow = vega.locator("li", { hasText: "Guilde Rigel" });
  await expect(rigelRow).toBeVisible({ timeout: 15_000 });
  await rigelRow.getByRole("button", { name: "Guerre" }).click();

  // Tout le camp d'en face est prévenu : c'est le cas que le journal existe pour couvrir.
  await expect(
    rigel.getByRole("link", { name: /Journal \(\d+\)/ }),
  ).toBeVisible({
    timeout: 15_000,
  });
  await rigel.getByRole("link", { name: /Journal/ }).click();
  await expect(rigel.getByText(/Consortium Vega/)).toBeVisible();

  await ctxA.close();
  await ctxB.close();
});
