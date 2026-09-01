import { expect, test } from "@playwright/test";
import { framesPerSecond, registerFreshEmpire } from "./helpers.js";

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
  // Le double-clic vole (620 ms) puis on remonte une bande entière à la molette.
  test.setTimeout(90_000);
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

  // Le double-clic vole ET ouvre la fiche (chantier 35.6) : la refermer pour rendre la
  // carte à la molette.
  await page.keyboard.press("Escape");

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
  test.setTimeout(180_000);
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
  await page.keyboard.press("Escape");

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
  await page.keyboard.press("Escape");

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
  const host = page.locator(".map-canvas");
  expect(await settledTier(page)).toBe("universe");

  // La DESCENTE est le geste coûteux : elle part du cadrage large et doit parcourir toute
  // la bande. Remonter, au contraire, ne demande qu'à dépasser le cadrage du palier — un
  // cran y suffit depuis une vue déjà pleine, et le mesurer ne dirait rien.
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
  const host = page.locator(".map-canvas");
  expect(await settledTier(page)).toBe("universe");

  const list = page.getByRole("navigation", { name: /univers|universe/i });
  const first = list.getByRole("button").first();
  const name = (await first.innerText()).split("\n")[0]!.trim();
  await first.click();

  const infobox = page.getByRole("dialog");
  await expect(infobox).toBeVisible();
  await expect(infobox).toContainText(name);

  // Elle ne prend pas le focus : sinon la section perdrait le clavier et le joueur ne
  // pourrait plus piloter sa caméra après avoir cliqué sur un objet.
  await host.focus();
  await page.keyboard.press("ArrowRight");
  await expect(host).toHaveAttribute("data-map-keys", /[1-9]/);

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

test("le double-clic vole jusqu'à l'objet et ouvre sa fiche", async ({
  page,
}) => {
  // Ouvrir un corps était un NIVEAU de carte : la scène 3D disparaissait au profit d'une
  // fiche SVG. La modale laisse la carte derrière elle et se referme d'une touche —
  // regarder et lire cessent d'être exclusifs.
  await registerFreshEmpire(page, {
    prefix: "mapsheet",
    empireName: "Liseurs E2E",
  });

  await page.getByRole("link", { name: "Carte" }).click();
  const host = page.locator(".map-canvas");
  expect(await settledTier(page)).toBe("universe");

  const list = page.getByRole("navigation", { name: /univers|universe/i });
  const row = list.getByRole("button").first();
  const name = (await row.locator("span").first().innerText()).trim();
  await row.dblclick();

  // La fiche d'une galaxie n'existait pas avant le chantier 35.6 : sélectionner une
  // galaxie n'ouvrait rien du tout.
  const sheet = page.getByRole("dialog", { name: new RegExp(name, "i") });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText(/Systèmes|Systems/i);

  // Et la caméra a bel et bien volé : le double-clic ne fait pas qu'ouvrir une fiche.
  await expect
    .poll(() => host.getAttribute("data-map-tier"), { timeout: 15_000 })
    .toBe("galaxy");

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
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
  const host = page.locator(".map-canvas");
  expect(await settledTier(page)).toBe("universe");

  const box = (await host.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 90; i++) {
    const depth = Number(await host.getAttribute("data-map-depth"));
    if (depth >= 0.55 && depth <= 0.95) break;
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(30);
  }

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
