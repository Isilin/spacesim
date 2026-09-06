import { expect, test } from "@playwright/test";
import {
  framesPerSecond,
  openMapObjects,
  registerFreshEmpire,
} from "./helpers.js";

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

/**
 * Recule à la molette jusqu'à atteindre un palier, ou jusqu'à épuisement.
 *
 * Boucle jusqu'à condition plutôt que compte fixe : le nombre de crans nécessaires dépend
 * du pas de dolly d'`OrbitControls` et de la largeur des bandes, qui ne sont pas des
 * invariants du produit. Ce que le test affirme, c'est qu'on finit par remonter — pas en
 * combien de crans.
 */
async function wheelOutTo(
  page: import("@playwright/test").Page,
  tier: string,
): Promise<string[]> {
  const host = page.locator(".map-canvas");
  const box = (await host.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const seen: string[] = [];
  for (let batch = 0; batch < 90; batch++) {
    const now = await host.getAttribute("data-map-tier");
    if (now && seen.at(-1) !== now) seen.push(now);
    if (now === tier) return seen;
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 240);
    await page.waitForTimeout(50);
  }
  return seen;
}

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
  // Le vol dure 620 ms, puis on remonte une bande entière à la molette.
  test.setTimeout(90_000);
  await registerFreshEmpire(page, {
    prefix: "mapzoom",
    empireName: "Traverseurs E2E",
  });

  await page.getByRole("link", { name: "Carte" }).click();
  await openMapObjects(page);
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
  expect(await wheelOutTo(page, "universe")).toContain("universe");
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
  await openMapObjects(page);
  const host = page.locator(".map-canvas");
  expect(await settledTier(page)).toBe("universe");

  // Descendre exige de viser (chantier 40) : sans sélection, le zoom roule dans le palier
  // courant et se borne à sa frontière. C'est la contrepartie assumée de la suppression de
  // l'élection automatique, qui désignait pour le joueur et se trompait.
  await page
    .getByRole("navigation", { name: /univers|universe/i })
    .getByRole("button")
    .first()
    .click();

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
  test.setTimeout(180_000);
  // Le palier corps était le seul des quatre à n'être pas de la 3D : un schéma SVG figé,
  // sans zoom, où les lunes ne bougeaient jamais. Ce test affirme qu'il est devenu un
  // palier comme les autres — atteint par le même geste, quitté par le même.
  await registerFreshEmpire(page, {
    prefix: "maptrav",
    empireName: "Sondeurs E2E",
  });

  await page.getByRole("link", { name: "Carte" }).click();
  await openMapObjects(page);
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

  // Viser une planète : une lune se laisse survoler comme les autres corps depuis que
  // le double-clic vole (chantier 36.5), mais la planète est la descente attendue ici.
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
  for (let batch = 0; batch < 70; batch++) {
    const tier = await host.getAttribute("data-map-tier");
    if (tier && seen.at(-1) !== tier) seen.push(tier);
    if (tier === "universe") break;
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 240);
    await page.waitForTimeout(60);
  }
  // Les trois frontières sont franchies dans l'ordre, aucune n'est sautée.
  expect(seen).toEqual(["body", "system", "galaxy", "universe"]);
  await expect(host.locator("canvas")).toHaveCount(1);
});

test("la traversée coûte une poignée de crans, pas une centaine", async ({
  page,
}) => {
  // Le zoom du chantier 35 empruntait le dolly d'`OrbitControls` : un pas fixe de ~5 % par
  // cran, soit une trentaine de crans par palier et plus de cent pour aller de l'amas à une
  // lune. Le pas se déduit désormais de la bande à traverser, et un défilement soutenu
  // accélère (chantier 36.2).
  //
  // Ce test compte les crans. Sans lui, un retour au pas fixe rendrait exactement les mêmes
  // images aux mêmes paliers : rien d'autre ne distingue un zoom praticable d'un zoom
  // épuisant.
  await registerFreshEmpire(page, {
    prefix: "mapcrans",
    empireName: "Compteurs E2E",
  });

  await page.getByRole("link", { name: "Carte" }).click();
  await openMapObjects(page);
  const host = page.locator(".map-canvas");
  expect(await settledTier(page)).toBe("universe");

  // La DESCENTE est le geste coûteux : elle part du cadrage large et doit parcourir toute
  // la bande. Remonter, au contraire, ne demande qu'à dépasser le cadrage du palier — un
  // cran y suffit depuis une vue déjà pleine, et le mesurer ne dirait rien.
  // Descendre exige de viser (chantier 40) : sans sélection, le zoom roule dans le palier
  // courant et se borne à sa frontière. C'est la contrepartie assumée de la suppression de
  // l'élection automatique, qui désignait pour le joueur et se trompait.
  await page
    .getByRole("navigation", { name: /univers|universe/i })
    .getByRole("button")
    .first()
    .click();

  const box = (await host.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  let notches = 0;
  while (notches < 120) {
    if ((await host.getAttribute("data-map-tier")) === "galaxy") break;
    await page.mouse.wheel(0, -240);
    notches++;
    await page.waitForTimeout(30);
  }
  console.log(`[36.2] crans pour descendre d'un palier : ${notches}`);
  expect(await host.getAttribute("data-map-tier")).toBe("galaxy");
  // Douze crans calibrent la bande, l'accélération raccourcit un défilement soutenu. La
  // borne laisse de la marge pour l'amortissement, pas pour un retour au pas fixe, qui en
  // réclamait plus de trente.
  expect(notches).toBeLessThan(20);
});

test("cliquer le nom d'un objet le sélectionne", async ({ page }) => {
  // Les étiquettes sont des sprites, donc cliquables par le raycast (chantier 36.3). Rien
  // ne le vérifierait autrement : un sprite ne laisse aucune trace dans le DOM, et sa
  // position à l'écran n'est publiée nulle part.
  //
  // D'où le balayage. Au palier corps la caméra SUIT le corps ancré, qui se trouve donc au
  // centre exact du canvas, et son étiquette droit au-dessus. En remontant depuis le
  // centre on quitte le corps, puis son nom REVIENT : cela ne peut être que l'étiquette,
  // puisque la géométrie du corps est restée derrière.
  //
  // « Quitter le corps » ne veut plus dire « plus rien » depuis le chantier 40 : le clic
  // attrape le plus proche dans un rayon de dix-huit pixels, si bien qu'entre le corps et
  // son étiquette on peut tomber sur une lune. Ce qu'on suit, c'est donc le NOM affiché.
  test.setTimeout(120_000);
  await registerFreshEmpire(page, {
    prefix: "maplabelclick",
    empireName: "Pointeurs E2E",
  });

  await page.getByRole("link", { name: "Carte" }).click();
  await openMapObjects(page);
  const host = page.locator(".map-canvas");
  expect(await settledTier(page)).toBe("universe");

  await page.getByRole("button", { name: "Ma capitale" }).click();
  await expect
    .poll(() => host.getAttribute("data-map-tier"), { timeout: 20_000 })
    .toBe("system");

  const row = page
    .getByRole("navigation", { name: /système|system/i })
    .getByRole("button")
    .filter({ hasNotText: /Lune|Moon/ })
    .first();
  const name = (await row.locator("span").first().innerText()).trim();
  await row.dblclick();
  await expect
    .poll(() => host.getAttribute("data-map-tier"), { timeout: 20_000 })
    .toBe("body");
  await page.waitForTimeout(1000);

  const box = (await host.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const infobox = page.getByRole("dialog");

  let leftTheBody = false;
  let hitTheLabel = false;
  // Pas de 8 px : l'étiquette fait une quinzaine de pixels de haut, un pas plus large
  // pourrait passer par-dessus.
  for (let dy = 0; dy <= 360 && !hitTheLabel; dy += 8) {
    await page.mouse.click(cx, cy - dy);
    await page.waitForTimeout(300);
    const shows =
      (await infobox.count()) > 0 && (await infobox.innerText()).includes(name);
    if (!shows) {
      leftTheBody = true;
      continue;
    }
    if (leftTheBody) hitTheLabel = true;
  }

  expect(hitTheLabel).toBe(true);
  await expect(infobox).toContainText(name);
});

test("le panneau d'objets s'ouvre replié et retient son état", async ({
  page,
}) => {
  // La liste prenait 210 px de largeur en permanence. Depuis que les noms se posent sur
  // les objets (chantier 36.3), elle se replie — mais elle reste le seul chemin clavier
  // vers la scène, et ce test tient les deux promesses : elle est repliée par défaut, et
  // elle est toujours atteignable.
  await registerFreshEmpire(page, {
    prefix: "mappanel",
    empireName: "Replieurs E2E",
  });

  await page.getByRole("link", { name: "Carte" }).click();
  const list = page.getByRole("navigation", { name: /univers|universe/i });
  const toggle = page.getByRole("button", { name: /\d+ obje/i });

  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(list).toBeHidden();

  await toggle.click();
  await expect(list).toBeVisible();

  // L'état survit au rechargement : c'est ce que « mémorisé » veut dire, et rien d'autre
  // dans la carte ne le vérifierait.
  await page.reload();
  await expect(page.locator(".map-canvas canvas")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: /univers|universe/i }),
  ).toBeVisible();
});

test("les noms apparaissent sur les objets quand ils sont assez gros", async ({
  page,
}) => {
  // Les noms vivaient dans une liste latérale : lire la carte demandait un aller-retour
  // permanent entre le canvas et une colonne de 210 px. Ils se posent désormais sur les
  // objets (chantier 36.3), et n'apparaissent qu'au-delà d'un seuil de taille apparente —
  // sans quoi les deux cents galaxies d'un univers plein écriraient leur nom en même temps
  // sur quelques pixels chacune.
  //
  // Un sprite ne laisse rien dans le DOM : `data-map-labels` est le seul point depuis
  // lequel ce test peut affirmer qu'un nom est lisible.
  await registerFreshEmpire(page, {
    prefix: "maplabel",
    empireName: "Nommeurs E2E",
  });

  await page.getByRole("link", { name: "Carte" }).click();
  await openMapObjects(page);
  const host = page.locator(".map-canvas");
  expect(await settledTier(page)).toBe("universe");

  await expect
    .poll(async () => Number(await host.getAttribute("data-map-labels")), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);

  // Le palier GALAXIE, et pas le système : c'est là que le seuil se voit travailler.
  //
  // Le test mesurait auparavant dans le système capitale, et il a échoué une fois sur
  // « Expected > 4, Received 4 ». La cause n'est pas un aléa de mesure mais un PLAFOND :
  // `data-map-labels` compte des opacités, pas des objets dans le cadre, si bien qu'un
  // système de quatre objets nommables affiche quatre noms dès qu'il est cadré — et aucun
  // zoom ne peut faire grandir un compte déjà au maximum. Selon la seed, le test ne
  // prouvait rien.
  //
  // Une galaxie en compte trois à cinq cents pour un budget de soixante : le plafond est
  // hors d'atteinte, et le budget retient justement les plus proches du CENTRE, c'est-à-dire
  // ceux vers lesquels le zoom libre converge. La croissance y est structurelle.
  const list = page.getByRole("navigation", { name: /univers|universe/i });
  await list
    .getByRole("button")
    .filter({ hasText: /colonis|coloniz/i })
    .first()
    .dblclick();
  await expect
    .poll(() => host.getAttribute("data-map-tier"), { timeout: 20_000 })
    .toBe("galaxy");
  await page.waitForTimeout(1000);
  const far = Number(await host.getAttribute("data-map-labels"));

  const box = (await host.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  // Jusqu'à la borne du zoom libre — 0,15 fois la distance de cadrage du palier. Six crans
  // n'y suffisaient pas : un cran vaut 15 % quand aucune bande n'est en vue, et le seuil de
  // taille apparente ne se franchit qu'en fin de course.
  for (let i = 0; i < 25; i++) {
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(40);
  }

  // Le seuil, et rien d'autre : le palier n'a pas changé — descendre exigerait de viser un
  // système — donc aucun objet n'a été monté ni démonté entre les deux mesures.
  expect(await host.getAttribute("data-map-tier")).toBe("galaxy");
  await expect
    .poll(async () => Number(await host.getAttribute("data-map-labels")), {
      timeout: 10_000,
    })
    .toBeGreaterThan(far);
});

test("sélectionner ouvre une infobox sur la carte, cliquer à côté la referme", async ({
  page,
}) => {
  // Sélectionner ouvrait un panneau latéral fixe, à 340 px du regard — et sélectionner une
  // galaxie n'ouvrait rien du tout. L'information vient désormais se poser sur l'objet.
  await registerFreshEmpire(page, {
    prefix: "mapinfo",
    empireName: "Observateurs E2E",
  });

  await page.getByRole("link", { name: "Carte" }).click();
  await openMapObjects(page);
  const host = page.locator(".map-canvas");
  expect(await settledTier(page)).toBe("universe");

  const list = page.getByRole("navigation", { name: /univers|universe/i });
  const first = list.getByRole("button").first();
  const name = (await first.innerText()).split("\n")[0]!.trim();
  await first.click();

  const infobox = page.getByRole("dialog");
  await expect(infobox).toBeVisible();
  await expect(infobox).toContainText(name);

  // Elle ne prend pas le focus. La caméra ne se pilote plus au clavier (chantier 38),
  // mais la liste DOM reste le seul chemin clavier vers les objets : lui arracher le focus
  // renverrait le joueur à l'endroit d'où il vient de partir, à chaque sélection.
  expect(
    await page.evaluate(
      () => !!document.activeElement?.closest('[role="dialog"]'),
    ),
  ).toBe(false);

  // Cliquer à côté referme. Le coin du canvas ne porte aucun objet interactif : R3F ne
  // teste que ceux qui ont un gestionnaire, la grille de repère n'en est pas.
  const box = (await host.boundingBox())!;
  await page.mouse.click(box.x + 12, box.y + 12);
  await expect(infobox).toBeHidden();
});

test("l'infobox laisse zoomer sous elle et se referme d'un Échap", async ({
  page,
}) => {
  // Les deux défauts que la passe visuelle du chantier 35.12 a trouvés, et qu'aucun test
  // ne pouvait voir : ils ne se manifestent que si le curseur est SUR l'infobox, ce que
  // les tests précédents évitaient soigneusement en visant un coin vide du canvas.
  //
  // L'infobox est ancrée sur l'objet qu'on vient de sélectionner — donc sur celui vers
  // lequel on va zoomer. Opaque aux événements, elle avalait la molette : la carte
  // cessait de répondre exactement là où le joueur regardait. Et Échap ne la fermait pas,
  // le `Popover` liant sa touche à un nœud qui n'a jamais le focus ici.
  await registerFreshEmpire(page, {
    prefix: "mapthru",
    empireName: "Traversants E2E",
  });

  await page.getByRole("link", { name: "Carte" }).click();
  await openMapObjects(page);
  const host = page.locator(".map-canvas");
  expect(await settledTier(page)).toBe("universe");

  const list = page.getByRole("navigation", { name: /univers|universe/i });
  await list.getByRole("button").first().click();
  const infobox = page.getByRole("dialog");
  await expect(infobox).toBeVisible();

  const before = Number(await host.getAttribute("data-map-depth"));
  const box = (await infobox.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -200);
  await page.waitForTimeout(250);
  expect(Number(await host.getAttribute("data-map-depth"))).toBeGreaterThan(
    before,
  );

  await page.keyboard.press("Escape");
  await expect(infobox).toBeHidden();
});

test("le double-clic vole seul, la fiche s'ouvre depuis l'infobox", async ({
  page,
}) => {
  // Le double-clic ouvrait AUSSI la fiche (chantier 35.6), et la modale étant bloquante,
  // il fallait appuyer sur Échap entre deux descentes. Il vole désormais sans l'ouvrir
  // (chantier 36.5) : les descentes s'enchaînent. La fiche s'obtient par le bouton de
  // l'infobox.
  //
  // Il SÉLECTIONNE en revanche, depuis le chantier 38, et c'est le sens du geste : le premier
  // clic désigne, le second y vole. Ce test affirmait l'inverse — aucun dialogue après un
  // double-clic — parce que tout clic simple attendait alors un quart de seconde, de peur
  // d'ouvrir une infobox que le vol allait remplacer. Elle décrit désormais la cible du vol
  // et le suit : il n'y a plus de contradiction à arbitrer, donc plus de délai à payer.
  await registerFreshEmpire(page, {
    prefix: "mapsheet",
    empireName: "Liseurs E2E",
  });

  await page.getByRole("link", { name: "Carte" }).click();
  await openMapObjects(page);
  const host = page.locator(".map-canvas");
  expect(await settledTier(page)).toBe("universe");

  const list = page.getByRole("navigation", { name: /univers|universe/i });
  // La galaxie COLONISÉE, et non la première venue. Depuis le chantier 37.10, une galaxie
  // hors de portée arrive en condensé — sans ses systèmes, il n'y a rien à ouvrir dessous,
  // et le double-clic se contente de la sélectionner. Le vol se vérifie donc là où il
  // existe : chez le joueur.
  const row = list
    .getByRole("button")
    .filter({ hasText: /colonis|coloniz/i })
    .first();
  const name = (await row.locator("span").first().innerText()).trim();
  await row.dblclick();

  // La caméra vole…
  await expect
    .poll(() => host.getAttribute("data-map-tier"), { timeout: 15_000 })
    .toBe("galaxy");

  // …et l'infobox décrit la cible du vol, pas l'objet qu'on vient de quitter. Elle est
  // portée hors des couches et suivie par `MovingGroup` : le franchissement ne l'efface pas.
  const flown = page.getByRole("dialog");
  await expect(flown).toBeVisible();
  await expect(flown).toContainText(name);

  // La FICHE, elle, ne s'est pas ouverte : une seule boîte, et c'est l'infobox.
  await expect(page.getByRole("dialog")).toHaveCount(1);

  // Un clic simple sélectionne aussi, et sans attendre.
  const galaxyList = page.getByRole("navigation", { name: /galaxie|galaxy/i });
  await galaxyList.getByRole("button").first().click();
  const infobox = page.getByRole("dialog");
  await expect(infobox).toBeVisible();

  // Et c'est son bouton qui ouvre la fiche.
  await infobox.getByRole("button").first().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // La galaxie, elle, garde sa fiche accessible par l'URL — le nom en atteste.
  expect(name.length).toBeGreaterThan(0);
});

test("la sélection remonte au parent quand on quitte un palier", async ({
  page,
}) => {
  // Sortir d'une planète en gardant la planète sélectionnée laisserait l'infobox décrire
  // un objet devenu invisible, et le bouton « Ouvrir la fiche » ouvrirait autre chose que
  // ce qu'on regarde (chantier 36.5).
  test.setTimeout(90_000);
  await registerFreshEmpire(page, {
    prefix: "maplift",
    empireName: "Remontants E2E",
  });

  await page.getByRole("link", { name: "Carte" }).click();
  await openMapObjects(page);
  const host = page.locator(".map-canvas");
  expect(await settledTier(page)).toBe("universe");

  await page.getByRole("button", { name: "Ma capitale" }).click();
  await expect
    .poll(() => host.getAttribute("data-map-tier"), { timeout: 15_000 })
    .toBe("system");

  const bodies = page.getByRole("navigation", { name: /système|system/i });
  const row = bodies.getByRole("button").first();
  const body = (await row.locator("span").first().innerText()).trim();
  await row.click();
  const infobox = page.getByRole("dialog");
  await expect(infobox).toContainText(body);

  // Remonter d'un palier : l'infobox doit changer d'objet, pas rester sur un corps qu'on
  // ne voit plus.
  expect(await wheelOutTo(page, "galaxy")).toContain("galaxy");
  await expect(infobox).not.toContainText(body);
});

test("le budget d'images tient au milieu d'une transition", async ({
  page,
}) => {
  // Mesuré AU MILIEU de la bande et pas au repos : c'est le seul moment où deux paliers
  // sont dessinés en même temps, et donc le seul que le relevé du chantier 31.17 ne
  // couvrait pas. Une transition qui coûte des images est une transition à retailler.
  test.setTimeout(90_000);
  await registerFreshEmpire(page, {
    prefix: "mapfps",
    empireName: "Métreurs E2E",
  });

  await page.getByRole("link", { name: "Carte" }).click();
  await openMapObjects(page);
  const host = page.locator(".map-canvas");
  expect(await settledTier(page)).toBe("universe");

  // Descendre exige de viser (chantier 40) : sans sélection, le zoom roule dans le palier
  // courant et se borne à sa frontière. C'est la contrepartie assumée de la suppression de
  // l'élection automatique, qui désignait pour le joueur et se trompait.
  await page
    .getByRole("navigation", { name: /univers|universe/i })
    .getByRole("button")
    .first()
    .click();

  const box = (await host.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 90; i++) {
    const depth = Number(await host.getAttribute("data-map-depth"));
    if (depth >= 0.55 && depth <= 0.95) break;
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(30);
  }

  // Laisser la couche enfant finir de se monter avant de compter, comme le fait déjà le
  // relevé du chantier 31.17 : franchir `CHILD_MOUNT_AT` construit des géométries et des
  // textures, et les inclure dans la mesure reviendrait à mesurer le montage plutôt que la
  // transition. Le dolly a convergé vers sa cible, la profondeur ne bouge plus.
  await page.waitForTimeout(700);

  const depth = Number(await host.getAttribute("data-map-depth"));
  expect(depth).toBeGreaterThan(0.4);
  expect(depth).toBeLessThan(1);

  const fps = await framesPerSecond(page);
  console.log(
    `[35.7] images/s — transition univers→galaxie ${fps} à z=${depth}`,
  );
  expect(fps).toBeGreaterThan(20);
});

test("la carte montre tout ce que le système contient, pas seulement ses corps", async ({
  page,
}) => {
  // Le comptoir NPC n'était PAS rendu : un système qui en portait un était indiscernable
  // d'un système vide, alors que c'est le seul endroit où l'on peut commercer sans rien
  // avoir bâti. Ceintures et sites de scan n'avaient même pas de gestionnaire de clic.
  //
  // La vérité vient du panneau latéral, qui compte ce que le système contient à partir des
  // MÊMES données que la carte : le générateur tire 0 à 2 ceintures et un comptoir une fois
  // sur trois, aucun compte n'est donc écrit en dur ici.
  test.setTimeout(90_000);
  await registerFreshEmpire(page, {
    prefix: "mapfeat",
    empireName: "Inventaires E2E",
  });

  await page.getByRole("link", { name: "Carte" }).click();
  await openMapObjects(page);
  const host = page.locator(".map-canvas");
  expect(await settledTier(page)).toBe("universe");
  await page.getByRole("button", { name: "Ma capitale" }).click();
  await expect
    .poll(() => host.getAttribute("data-map-tier"), { timeout: 20_000 })
    .toBe("system");

  // Attendre le panneau : il ne décrit le système qu'une fois la vue arrivée dessus, et
  // lire son texte avant lèverait sur un panneau encore vide.
  const summaryRow = page
    .locator("aside")
    .getByText(/planètes/)
    .first();
  await expect(summaryRow).toBeVisible({ timeout: 20_000 });
  const summary = await summaryRow.innerText();
  const belts = Number(/(\d+) ceintures?/.exec(summary)?.[1] ?? 0);
  const posts = Number(/(\d+) comptoirs?/.exec(summary)?.[1] ?? 0);

  const list = page.locator("nav.map-list");
  // Délais larges : la liste se reconstruit au rythme des ticks serveur, et la suite
  // complète en fait tourner une vingtaine d'empires sur la même instance.
  await expect(
    list.getByRole("button").filter({ hasText: "Ceinture" }),
  ).toHaveCount(belts, { timeout: 20_000 });
  await expect(
    list.getByRole("button").filter({ hasText: "Comptoir de commerce" }),
  ).toHaveCount(posts, { timeout: 20_000 });

  // Et chacun s'ouvre en infobox, comme un corps. Aucun ne se sélectionnait avant.
  const feature = list
    .getByRole("button")
    .filter({ hasText: /Ceinture|Comptoir de commerce/ })
    .first();
  if ((await feature.count()) === 0) return;
  const name = (await feature.locator("span").first().innerText()).trim();
  await feature.click();
  const infobox = page.getByRole("dialog");
  await expect(infobox).toBeVisible();
  await expect(infobox).toContainText(name);
});

test("la visée ne change pas en zoomant", async ({ page }) => {
  // LE test du chantier 38. La caméra élisait sa cible à chaque image — le candidat le plus
  // proche du centre du cadre — puis tirait le cadre vers cette cible. La traction déplaçait
  // le point depuis lequel l'élection mesurait, l'élection changeait de candidat, la traction
  // s'inversait : la vue partait de droite à gauche avant de se poser. Le joueur l'a décrit
  // comme un ballotage.
  //
  // Rien d'autre ne peut l'observer. Une cible de caméra ne laisse aucune trace dans le DOM,
  // et l'image d'arrivée est la même dans les deux cas — seul le chemin diffère. D'où
  // `data-map-aim`, quatrième compteur posé sur la section hôte.
  await registerFreshEmpire(page, {
    prefix: "mapvisee",
    empireName: "Viseurs E2E",
  });

  await page.getByRole("link", { name: "Carte" }).click();
  await openMapObjects(page);
  const host = page.locator(".map-canvas");
  expect(await settledTier(page)).toBe("universe");

  // Sélectionner, c'est viser : c'est tout l'invariant du chantier.
  const list = page.getByRole("navigation", { name: /univers|universe/i });
  await list.getByRole("button").first().click();
  await expect
    .poll(() => host.getAttribute("data-map-aim"), { timeout: 15_000 })
    .not.toBeNull();
  const aimed = await host.getAttribute("data-map-aim");
  const from = Number(await host.getAttribute("data-map-depth"));

  const box = (await host.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const seen = new Set<string>();
  let samples = 0;
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, -160);
    await page.waitForTimeout(80);
    // On s'arrête au franchissement : descendre CONSOMME la visée, et le palier atteint
    // repart sans en avoir — c'est voulu, ce n'est pas ce qu'on mesure ici.
    if ((await host.getAttribute("data-map-tier")) !== "universe") break;
    seen.add((await host.getAttribute("data-map-aim")) ?? "");
    samples++;
  }

  // Le test ne doit pas passer à vide : il faut avoir réellement zoomé dans le palier.
  expect(samples).toBeGreaterThanOrEqual(3);
  expect(Number(await host.getAttribute("data-map-depth"))).toBeGreaterThan(
    from,
  );
  // Une seule visée relevée sur toute la descente, et c'est celle qu'on avait choisie.
  expect([...seen]).toEqual([aimed]);
});

test("glisser déplace la vue, le ressort la ramène sur ce qu'on vise", async ({
  page,
}) => {
  // Le panoramique revient au chantier 38, sur le bouton droit. L'ADR 0017 l'avait retiré
  // parce qu'on perdait de vue l'objet sur lequel on zoomait — mais le défaut n'était pas le
  // panoramique, c'était qu'aucune cible n'était tenue.
  //
  // Ce qui ramène la vue n'est plus une élection au relâchement (chantier 40 : la carte ne
  // désigne plus rien à la place du joueur) mais le ressort, qui suit la SÉLECTION et elle
  // seule. Sans rien de sélectionné, un panoramique reste où on l'a laissé.
  //
  // L'infobox est ancrée sur la visée : c'est le seul point de la carte dont la position
  // à l'écran soit lisible depuis le DOM.
  await registerFreshEmpire(page, {
    prefix: "mappano",
    empireName: "Glisseurs E2E",
  });

  await page.getByRole("link", { name: "Carte" }).click();
  await openMapObjects(page);
  const host = page.locator(".map-canvas");
  expect(await settledTier(page)).toBe("universe");

  const list = page.getByRole("navigation", { name: /univers|universe/i });
  await list.getByRole("button").first().click();
  const infobox = page.getByRole("dialog");
  await expect(infobox).toBeVisible();

  const box = (await host.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const offCentre = async () => {
    const at = (await infobox.boundingBox())!;
    return Math.hypot(at.x + at.width / 2 - cx, at.y + at.height / 2 - cy);
  };

  // Le ressort a déjà amené la visée au centre.
  await expect.poll(offCentre, { timeout: 15_000 }).toBeLessThan(box.width / 4);

  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: "right" });
  for (let i = 1; i <= 10; i++) await page.mouse.move(cx + i * 20, cy + i * 10);

  // Mesuré AVANT le relâchement. Le ressort est suspendu tant que le geste dure : c'est donc
  // le déplacement du panoramique qu'on lit, et pas ce qu'il en reste après un aller-retour
  // de Playwright. Sans `enablePan`, rien n'aurait bougé du tout.
  const dragged = await offCentre();
  expect(dragged).toBeGreaterThan(box.width / 6);

  await page.mouse.up({ button: "right" });

  // Puis le ressort ramène la vue sur ce qu'elle vise.
  await expect.poll(offCentre, { timeout: 10_000 }).toBeLessThan(dragged / 2);
});

test("la rotation tourne autour de la verticale, elle ne roule pas", async ({
  page,
}) => {
  // Le monde de la carte est Z-HAUT — le plan galactique est XY — alors que three.js prend Y
  // par défaut. Un glisser horizontal faisait donc passer la caméra SOUS le disque au lieu
  // d'en faire le tour, et l'image roulait. Le joueur l'a décrit comme « Roll & Pitch au lieu
  // de Yaw & Pitch ».
  //
  // Un roulis ne laisse aucune trace dans le DOM. `data-map-elevation` — l'angle de la vue
  // au-dessus du plan galactique — est le seul témoin possible : un lacet doit le laisser
  // intact, un tangage le changer.
  await registerFreshEmpire(page, {
    prefix: "maplacet",
    empireName: "Pivoteurs E2E",
  });

  await page.getByRole("link", { name: "Carte" }).click();
  await openMapObjects(page);
  const host = page.locator(".map-canvas");
  expect(await settledTier(page)).toBe("universe");
  await expect
    .poll(() => host.getAttribute("data-map-elevation"), { timeout: 15_000 })
    .not.toBeNull();

  const box = (await host.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const before = Number(await host.getAttribute("data-map-elevation"));

  // Glisser HORIZONTAL : on fait le tour, à latitude constante.
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(cx + i * 18, cy);
  await page.mouse.up();
  await page.waitForTimeout(600);
  const afterYaw = Number(await host.getAttribute("data-map-elevation"));
  // Un degré de tolérance : l'attribut est arrondi à l'entier.
  expect(Math.abs(afterYaw - before)).toBeLessThanOrEqual(1);

  // Glisser VERTICAL : on monte au-dessus du plan.
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(cx, cy + i * 12);
  await page.mouse.up();
  await page.waitForTimeout(600);
  const afterPitch = Number(await host.getAttribute("data-map-elevation"));
  expect(Math.abs(afterPitch - afterYaw)).toBeGreaterThan(3);
});

test("cliquer à côté d'un objet le sélectionne quand même", async ({
  page,
}) => {
  // En dézoomant, un objet ne fait plus que quelques pixels — et la moitié du contenu d'un
  // système n'a de toute façon aucune géométrie cliquable : comptoir, avant-postes, flottes,
  // ceintures ne portent aucun gestionnaire. Le clic attrape donc le plus proche dans un rayon
  // de tolérance, sans avoir à toucher quoi que ce soit.
  //
  // Le pendant — au-delà du rayon, on désélectionne — est déjà couvert par « sélectionner ouvre
  // une infobox », qui clique le coin du canvas. Le prouver ici demanderait un point dont on
  // sache qu'il est vide APRÈS que le ressort a recentré la vue, et il n'y en a pas : recentrer
  // change le cadrage, et une tolérance de dix-huit pixels rétrécit ce qu'on peut appeler « le
  // vide ». Le test passait seul et échouait dans la suite complète, où l'univers compte plus
  // de galaxies.
  //
  // L'infobox est ancrée sur l'objet : c'est le seul point de la carte dont la position à
  // l'écran soit lisible depuis le DOM, donc le seul moyen de savoir où cliquer « à côté ».
  await registerFreshEmpire(page, {
    prefix: "mapclic",
    empireName: "Viseurs E2E",
  });

  await page.getByRole("link", { name: "Carte" }).click();
  await openMapObjects(page);
  expect(await settledTier(page)).toBe("universe");

  const list = page.getByRole("navigation", { name: /univers|universe/i });
  const row = list.getByRole("button").first();
  const name = (await row.locator("span").first().innerText()).trim();
  await row.click();

  const infobox = page.getByRole("dialog");
  await expect(infobox).toBeVisible();
  // Laisser le ressort poser la visée avant de relever sa position.
  await page.waitForTimeout(900);
  const at = (await infobox.boundingBox())!;
  // La boîte est décalée de 16 px à droite de l'objet et centrée verticalement dessus.
  const ax = at.x - 16;
  const ay = at.y + at.height / 2;

  // On referme d'abord, pour que la réouverture prouve quelque chose.
  await page.keyboard.press("Escape");
  await expect(infobox).toBeHidden();

  // Puis on clique À CÔTÉ, sans toucher la géométrie : la tolérance rattrape.
  await page.mouse.click(ax + 9, ay + 9);
  const again = page.getByRole("dialog");
  await expect(again).toBeVisible();
  await expect(again).toContainText(name);
});

test("l'objet sélectionné reste au centre quand on tourne autour", async ({
  page,
}) => {
  // Régression du chantier 40.7. drei met à jour `OrbitControls` en priorité -1, donc AVANT
  // la boucle de `TierCamera` : son `lookAt(target)` était fait sur la pose de l'image
  // précédente, et tout ce qu'on écrivait ensuite déplaçait la caméra sans la réorienter.
  // L'image était rendue avec une orientation en retard d'une image sur la position.
  //
  // Invisible à l'arrêt, et c'est ce qui rend ce test nécessaire : en rotation continue, le
  // retard varie avec le temps d'image, se voit comme des à-coups, et laisse l'objet visé à
  // côté du centre. L'infobox est ancrée sur lui : c'est le seul point de la carte dont la
  // position à l'écran soit lisible depuis le DOM.
  await registerFreshEmpire(page, {
    prefix: "mapcentre",
    empireName: "Centreurs E2E",
  });

  await page.getByRole("link", { name: "Carte" }).click();
  await openMapObjects(page);
  const host = page.locator(".map-canvas");
  expect(await settledTier(page)).toBe("universe");

  const list = page.getByRole("navigation", { name: /univers|universe/i });
  await list.getByRole("button").first().click();
  const infobox = page.getByRole("dialog");
  await expect(infobox).toBeVisible();

  const box = (await host.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  // La boîte est décalée de 16 px à droite de l'objet et centrée verticalement dessus.
  const offCentre = async () => {
    const at = (await infobox.boundingBox())!;
    return Math.hypot(at.x - 16 - cx, at.y + at.height / 2 - cy);
  };

  await expect.poll(offCentre, { timeout: 15_000 }).toBeLessThan(15);

  // On écarte volontairement la visée du centre, au panoramique : c'est le seul geste qui le
  // fasse, et il crée un écart assez grand pour survivre au temps que met Playwright à jouer
  // le geste suivant.
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: "right" });
  for (let i = 1; i <= 10; i++) await page.mouse.move(cx + i * 30, cy + i * 12);
  await page.mouse.up({ button: "right" });
  const before = await offCentre();
  expect(before).toBeGreaterThan(15);

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 14; i++) {
    await page.mouse.move(cx + i * 16, cy + i * 4);
    await page.waitForTimeout(60);
  }
  // Mesuré AVANT le relâchement : après, le ressort repartirait de toute façon et le test
  // ne dirait plus rien de ce qui se passe PENDANT la rotation.
  const during = await offCentre();
  await page.mouse.up();

  expect(during).toBeLessThan(15);
});

test("« Ma capitale » atteint le palier système et y RESTE", async ({
  page,
}) => {
  // Ce que ce test attrape, et qu'aucun autre n'attrapait : un saut multi-bandes peut
  // publier son palier d'arrivée puis en être renvoyé à l'image suivante. Tous les tests
  // qui visent la capitale s'arrêtaient à `.poll(...).toBe("system")` — une assertion que
  // satisfait une seule fenêtre de mesure, y compris quand la carte retombe aussitôt à la
  // galaxie et n'en repart plus. Il faut donc regarder APRÈS que tout s'est posé.
  //
  // Le défaut était que `minDistance` valait quatre largeurs de bande. « Ma capitale »
  // traverse DEUX bandes depuis l'univers, et depuis le chantier 37 il lui en faut 4,08 :
  // `OrbitControls.update()` clampait le vol deux pour cent trop court, juste au-dessus de
  // la frontière, et `ascending` le renvoyait d'où il venait.
  await registerFreshEmpire(page, {
    prefix: "mapcapital",
    empireName: "Capitale E2E",
  });

  await page.getByRole("link", { name: "Carte" }).click();
  await openMapObjects(page);
  const host = page.locator(".map-canvas");
  expect(await settledTier(page)).toBe("universe");

  await page.getByRole("button", { name: "Ma capitale" }).click();
  await expect
    .poll(() => host.getAttribute("data-map-tier"), { timeout: 20_000 })
    .toBe("system");

  // Le vol dure 620 ms et la caméra s'amortit ensuite : deux secondes couvrent largement
  // le retour élastique qui, lui, ramenait au palier parent.
  await page.waitForTimeout(2000);
  expect(await host.getAttribute("data-map-tier")).toBe("system");

  // Et la profondeur doit le confirmer : `tierAt` lit la partie ENTIÈRE, donc un palier
  // système tenu vaut au moins 2. Sans cette ligne, un palier publié par le saut mais
  // démenti par la caméra passerait encore.
  const depth = Number(await host.getAttribute("data-map-depth"));
  expect(depth).toBeGreaterThanOrEqual(2);

  // La liste DOM décrit bien un système, pas la galaxie qui le contient.
  await expect(
    page.getByRole("navigation", { name: /système|system/i }),
  ).toBeVisible();
});
