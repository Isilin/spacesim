import { RESOURCES, type Station } from "@spacesim/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { GameEngine } from "../../game.js";
import { empireFor, resetDb } from "../../test-harness.js";

beforeEach(() => resetDb());

/**
 * Station de test posée directement dans l'empire propriétaire — fonder une station
 * demande une chaîne de recherche entière, sans rapport avec ce qu'on vérifie ici.
 */
function placeStation(
  engine: GameEngine,
  owner: ReturnType<typeof empireFor>,
  access: Station["marketAccess"] = "public",
  taxRate = 0,
  /** Le carnet exige que le visiteur ait exploré le système de la station. */
  visitors: ReturnType<typeof empireFor>[] = [],
): string {
  const systemId = "gal-0-sys-0";
  const resources = Object.fromEntries(
    RESOURCES.map((r) => [r, 0]),
  ) as Station["resources"];
  const station: Station = {
    id: "station-test",
    ownerId: owner.id,
    bodyId: `${systemId}-body-0`,
    systemId,
    name: "Comptoir de test",
    resources,
    zones: [],
    zoneQueue: [],
    installations: {},
    installQueue: [],
    marketAccess: access,
    marketTaxRate: taxRate,
  };
  engine.station.insertStation(owner, station);
  for (const visitor of [owner, ...visitors]) visitor.explored.add(systemId);
  return station.id;
}

describe("GameEngine — carnet d'ordres (chantier 32.25)", () => {
  it("poser une vente exige la marchandise SUR PLACE", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const stationId = placeStation(engine, a);

    // Le marché ne téléporte rien : la marchandise doit avoir été déposée (ADR 0012).
    expect(
      engine.orderBook.placeOrder(a, stationId, "sell", "metals", 10, 5),
    ).toMatch(/Avoir insuffisant/);

    engine.orderBook.depositToHolding(stationId, a.id, { metals: 10 });
    expect(
      engine.orderBook.placeOrder(a, stationId, "sell", "metals", 10, 5),
    ).toBeNull();
  });

  it("le séquestre est immédiat", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const stationId = placeStation(engine, a);
    engine.orderBook.depositToHolding(stationId, a.id, { metals: 10 });

    engine.orderBook.placeOrder(a, stationId, "sell", "metals", 4, 5);
    // La marchandise sort de l'avoir dès la pose : sinon le carnet afficherait une offre
    // qu'un clic révèle creuse.
    expect(engine.orderBook.holdingOf(stationId, a.id).resources.metals).toBe(
      6,
    );
  });

  it("annuler rend exactement ce qui restait séquestré", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const stationId = placeStation(engine, a);
    engine.orderBook.depositToHolding(stationId, a.id, { metals: 10 });
    engine.orderBook.placeOrder(a, stationId, "sell", "metals", 4, 5);
    const orderId = engine.snapshotForEmpire(a).orders[0]!.id;

    expect(engine.orderBook.cancelOrder(a, orderId)).toBeNull();
    expect(engine.orderBook.holdingOf(stationId, a.id).resources.metals).toBe(
      10,
    );
    expect(engine.snapshotForEmpire(a).orders).toHaveLength(0);
  });

  it("une exécution déplace marchandise et crédits entre avoirs", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    const stationId = placeStation(engine, a, "public", 0, [b]);
    engine.orderBook.depositToHolding(stationId, a.id, { metals: 10 });
    engine.orderBook.creditHoldingForTest(stationId, b.id, 100);

    engine.orderBook.placeOrder(a, stationId, "sell", "metals", 10, 5);
    expect(
      engine.orderBook.placeOrder(b, stationId, "buy", "metals", 4, 5),
    ).toBeNull();

    expect(engine.orderBook.holdingOf(stationId, b.id).resources.metals).toBe(
      4,
    );
    expect(engine.orderBook.holdingOf(stationId, b.id).credits).toBe(80);
    expect(engine.orderBook.holdingOf(stationId, a.id).credits).toBe(20);
  });

  it("l'exécution se fait au prix du repos, et la différence est rendue", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    const stationId = placeStation(engine, a, "public", 0, [b]);
    engine.orderBook.depositToHolding(stationId, a.id, { metals: 5 });
    engine.orderBook.creditHoldingForTest(stationId, b.id, 100);

    engine.orderBook.placeOrder(a, stationId, "sell", "metals", 5, 4);
    // L'acheteur accepte jusqu'à 9 mais paie 4 : sans remboursement de la différence,
    // 25 crédits disparaîtraient du jeu.
    engine.orderBook.placeOrder(b, stationId, "buy", "metals", 5, 9);

    expect(engine.orderBook.holdingOf(stationId, b.id).credits).toBe(80);
    expect(engine.orderBook.holdingOf(stationId, a.id).credits).toBe(20);
  });

  it("la taxe va au propriétaire et sort du produit du vendeur", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    const c = empireFor(engine, "charlie");
    // `a` possède la station ; `b` vend à `c`, tous deux visiteurs.
    const stationId = placeStation(engine, a, "public", 0.1, [b, c]);
    engine.orderBook.depositToHolding(stationId, b.id, { metals: 10 });
    engine.orderBook.creditHoldingForTest(stationId, c.id, 100);

    engine.orderBook.placeOrder(b, stationId, "sell", "metals", 10, 5);
    engine.orderBook.placeOrder(c, stationId, "buy", "metals", 10, 5);

    // 50 bruts, 10 % pour la station : le vendeur touche 45.
    expect(engine.orderBook.holdingOf(stationId, b.id).credits).toBe(45);
    expect(a.stationMap.get(stationId)!.resources.credits).toBe(5);
  });

  it("un carnet fermé n'est ni lisible ni utilisable d'un étranger", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    const stationId = placeStation(engine, a, "closed", 0, [b]);
    engine.orderBook.depositToHolding(stationId, a.id, { metals: 10 });
    engine.orderBook.placeOrder(a, stationId, "sell", "metals", 10, 5);

    // La politique d'accès gouverne aussi le REGARD : la fermer n'aurait sinon qu'un
    // effet cosmétique (ADR 0012).
    expect(engine.snapshotForEmpire(a).orders).toHaveLength(1);
    expect(engine.snapshotForEmpire(b).orders).toHaveLength(0);
    expect(
      engine.orderBook.placeOrder(b, stationId, "buy", "metals", 1, 5),
    ).toMatch(/Accès refusé/);
  });

  it("rapatrier les crédits d'un avoir les verse dans une colonie", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const stationId = placeStation(engine, a);
    engine.orderBook.creditHoldingForTest(stationId, a.id, 250);
    const colony = engine.snapshotForEmpire(a).colonies[0]!;
    const before = colony.resources.credits;

    expect(engine.claimHoldingCredits(a, stationId, colony.id)).toBeNull();

    expect(engine.snapshotForEmpire(a).colonies[0]!.resources.credits).toBe(
      before + 250,
    );
    expect(engine.orderBook.holdingOf(stationId, a.id).credits).toBe(0);
  });
});
