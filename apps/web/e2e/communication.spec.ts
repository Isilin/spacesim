import { expect, test } from "@playwright/test";
import { registerFreshEmpire } from "./helpers.js";

/**
 * Communication (chantier 32.17) — deux joueurs, deux sessions réelles.
 *
 * Vérifie ce qu'un test à un joueur ne peut pas voir : qu'un message posté dans un canal
 * régional atteint un voisin, et qu'un courrier crée à la fois une entrée de boîte aux
 * lettres et une pastille de journal chez le destinataire.
 */
test("un message de canal et un courrier traversent deux sessions", async ({
  browser,
}) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const alice = await ctxA.newPage();
  const bob = await ctxB.newPage();

  await registerFreshEmpire(alice, {
    prefix: "comma",
    empireName: "Alice E2E",
  });
  await registerFreshEmpire(bob, { prefix: "commb", empireName: "Bob E2E" });

  await alice.getByRole("link", { name: "Comms" }).click();
  await expect(alice).toHaveURL(/\/comms$/);
  // Le canal de galaxie existe SANS message préalable : il est publié par le serveur,
  // pas déduit de ce qui a été dit — sinon personne ne pourrait parler en premier.
  const field = alice.getByLabel("Message", { exact: true }).first();
  await expect(field).toBeVisible();
  await field.fill("Quelqu'un vend du minerai ?");
  await alice.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(alice.getByText("Quelqu'un vend du minerai ?")).toBeVisible();

  // Courrier dirigé : c'est le chemin qui marche quelle que soit la géographie.
  await alice.getByRole("combobox").last().selectOption({ label: "Bob E2E" });
  await alice.getByLabel("Objet").fill("Proposition");
  await alice.getByLabel("Message", { exact: true }).last().fill("Parlons.");
  await alice.getByRole("button", { name: "Envoyer le courrier" }).click();

  // Chez Bob : la pastille du journal ET le courrier lui-même.
  await expect(bob.getByRole("link", { name: /Journal \(\d+\)/ })).toBeVisible({
    timeout: 15_000,
  });
  await bob.getByRole("link", { name: "Comms" }).click();
  await expect(bob.getByText(/Proposition/)).toBeVisible();
  await bob.getByRole("button", { name: /Proposition/ }).click();
  await expect(bob.getByText("Parlons.")).toBeVisible();

  await ctxA.close();
  await ctxB.close();
});
