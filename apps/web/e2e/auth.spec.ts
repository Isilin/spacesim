import { expect, test } from "@playwright/test";
import { registerFreshEmpire } from "./helpers.js";

test("inscription : crée le compte et l'empire, atterrit sur la colonie", async ({
  page,
}) => {
  await registerFreshEmpire(page, {
    prefix: "register",
    empireName: "Consortium E2E",
  });

  await expect(page).toHaveURL(/\/colony$/);
  await expect(page.getByRole("link", { name: "Colonie" })).toHaveAttribute(
    "data-active",
    "true",
  );
});

test("connexion : un compte existant se reconnecte à son empire", async ({
  page,
}) => {
  const email = `login-${Date.now()}@example.test`;

  await page.goto("/");
  await page.getByRole("button", { name: "Inscription" }).click();
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill("password123");
  await page.getByLabel("Nom de l'empire").fill("Retour E2E");
  await page.getByRole("button", { name: "Fonder l'empire" }).click();
  await expect(page.getByText(/Colonie mère/)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Déconnexion" }).click();
  await expect(page.getByRole("button", { name: "Connexion" })).toBeVisible();

  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill("password123");
  await page.getByRole("button", { name: "Se connecter" }).click();

  await expect(page.getByText(/Colonie mère/)).toBeVisible({ timeout: 15_000 });
});
