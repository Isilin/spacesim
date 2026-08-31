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
