import { expect, test } from "@playwright/test";
import { registerFreshEmpire } from "./helpers.js";

/**
 * Journal d'empire (chantier 32.5) — la chaîne entière : un fait de simulation produit
 * un événement serveur, le snapshot le transporte, le client le rédige dans la langue du
 * joueur, et la commande de marquage revient par le WebSocket.
 *
 * Vérifié bout en bout et pas seulement en unitaire : c'est le seul point où l'on
 * constate qu'un événement émis par un service atteint réellement l'écran.
 */
test("un fait de simulation remonte au journal, puis se marque lu", async ({
  page,
}) => {
  await registerFreshEmpire(page, {
    prefix: "inbox",
    empireName: "Archivistes E2E",
  });

  // Le système de la capitale : c'est là qu'on fait apparaître la menace, sinon
  // l'événement viserait un autre empire.
  await page.getByRole("link", { name: "Carte" }).click();
  await page.getByRole("button", { name: "Ma capitale" }).click();
  await expect(page).toHaveURL(/\/map\?.*at=/);
  const systemId = new URL(page.url()).searchParams.get("at")!;

  await page.request.post("/dev/spawnpirate", { data: { systemId } });

  // La pastille de non-lus vit dans l'onglet : c'est le seul endroit visible depuis
  // n'importe quel écran, et un joueur qui revient doit la voir sans chercher.
  const inboxTab = page.getByRole("link", { name: /Journal \(\d+\)/ });
  await expect(inboxTab).toBeVisible({ timeout: 15_000 });

  await inboxTab.click();
  await expect(page).toHaveURL(/\/inbox$/);
  // Rédigé côté client à partir d'identifiants : le serveur n'a envoyé aucune phrase.
  await expect(page.getByText(/Repaire pirate apparu/)).toBeVisible();

  await page.getByRole("button", { name: "Tout marquer lu" }).click();
  // La pastille disparaît : la commande a fait l'aller-retour par le WebSocket.
  await expect(page.getByRole("link", { name: /Journal \(\d+\)/ })).toHaveCount(
    0,
  );
  await expect(page.getByText(/Repaire pirate apparu/)).toBeVisible();
});
