import { beforeEach, describe, expect, it } from "vitest";
import { GameEngine } from "../../game.js";
import { advanceTicks, empireFor, resetDb } from "../../test-harness.js";

beforeEach(() => resetDb());

describe("GameEngine — stations orbitales (chantier 24)", () => {
  /** Colonie mère de l'empire, relue depuis le snapshot. */
  const homeColony = (
    engine: GameEngine,
    empire: ReturnType<typeof empireFor>,
  ) => engine.snapshotForEmpire(empire).colonies[0]!;

  /** Débloque `orbital_engineering` (et sa chaîne de prérequis) — la file de recherche
   *  s'enchaîne seule (chantier 11) ; on relance des fast-forward jusqu'à ce que le
   *  dernier maillon soit acquis, sans dépendre du nombre exact d'étapes. */
  function unlockOrbitalEngineering(
    engine: GameEngine,
    empire: ReturnType<typeof empireFor>,
  ): void {
    engine.devGrant({ science: 100_000 });
    expect(
      engine.industry.queueResearch(empire, "orbital_engineering"),
    ).toBeNull();
    for (let i = 0; i < 20; i++) {
      if (empire.researched.includes("orbital_engineering")) return;
      advanceTicks(engine, 200);
    }
    throw new Error(
      "orbital_engineering non débloquée après 20 relances de fast-forward",
    );
  }

  /** Généralisation d'`unlockOrbitalEngineering` à n'importe quelle tech — chaîne de
   *  prérequis plus profonde (`orbital_commerce`), plus de relances autorisées.
   *  `devGrant` cible l'empire par défaut (le premier créé) : n'appeler que sur lui. */
  function unlockTech(
    engine: GameEngine,
    empire: ReturnType<typeof empireFor>,
    techId: string,
  ): void {
    engine.devGrant({ science: 200_000 });
    expect(engine.industry.queueResearch(empire, techId)).toBeNull();
    for (let i = 0; i < 40; i++) {
      if (empire.researched.includes(techId)) return;
      advanceTicks(engine, 400);
    }
    throw new Error(`${techId} non débloquée après 40 relances de fast-forward`);
  }

  /** Un corps non colonisé, dans un système déjà exploré (galaxie d'origine). */
  function uncolonizedBody(
    engine: GameEngine,
    empire: ReturnType<typeof empireFor>,
  ) {
    const colonizedIds = new Set(
      [...empire.colonyMap.values()].map(
        (c: { planetId: string }) => c.planetId,
      ),
    );
    const body = engine.universe.galaxies[0]!.systems.flatMap(
      (s) => s.planets,
    ).find((p) => empire.explored.has(p.systemId) && !colonizedIds.has(p.id));
    if (!body)
      throw new Error(
        "aucun corps non colonisé dans le brouillard de l'empire",
      );
    return body;
  }

  it("refuse de fonder une station sans technologie de zone débloquée", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const empire = empireFor(engine, "alice");
    const colony = homeColony(engine, empire);
    const body = uncolonizedBody(engine, empire);
    expect(engine.station.foundStation(empire, colony.id, body.id)).toMatch(
      /Aucun type de zone débloqué/,
    );
  });

  it("fonde une station : coût débité, mission créée, station matérialisée à l'arrivée", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const empire = empireFor(engine, "alice");
    unlockOrbitalEngineering(engine, empire);
    engine.devGrant({ metals: 1000, components: 500, credits: 1000 });

    const colony = homeColony(engine, empire);
    const body = uncolonizedBody(engine, empire);
    const creditsBefore = colony.resources.credits;

    expect(engine.station.foundStation(empire, colony.id, body.id)).toBeNull();
    expect(empire.missionMap.size).toBeGreaterThan(0);
    const mission = [...empire.missionMap.values()].find(
      (m) => m.kind === "found_station",
    );
    expect(mission?.targetId).toBe(body.id);

    const afterDebit = homeColony(engine, empire);
    expect(afterDebit.resources.credits).toBeLessThan(creditsBefore);
    expect(empire.stationMap.size).toBe(0);

    // Rejoue le trajet : fast-forward large, la mission a un délai réel (chantier 24.5).
    advanceTicks(engine, 1000);
    expect(empire.stationMap.size).toBe(1);
    const station = [...empire.stationMap.values()][0]!;
    expect(station.bodyId).toBe(body.id);
    expect(station.ownerId).toBe(empire.id);
  });

  it("transfère des ressources vers une station via un convoi (chantier 24.6)", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const empire = empireFor(engine, "alice");
    unlockOrbitalEngineering(engine, empire);
    engine.devGrant({ metals: 1000, components: 500, credits: 1000 });

    const colonyBefore = homeColony(engine, empire);
    const body = uncolonizedBody(engine, empire);
    expect(
      engine.station.foundStation(empire, colonyBefore.id, body.id),
    ).toBeNull();
    advanceTicks(engine, 1000);
    const stationId = [...empire.stationMap.keys()][0]!;

    // Le convoi ne charge (cargaison et carburant) qu'EN ORBITE (chantier 12) : on
    // crédite ce stock directement pour isoler le transfert du reste de la chaîne de
    // production/ascenseur.
    const colony = empire.colonyMap.get(colonyBefore.id)!;
    empire.colonyMap.set(colonyBefore.id, {
      ...colony,
      orbitalResources: {
        ...colony.orbitalResources,
        metals: 500,
        energy: 200,
      },
    });

    expect(
      engine.logistics.sendTransfer(
        empire,
        colonyBefore.id,
        stationId,
        "station",
        {
          metals: 200,
        },
      ),
    ).toBeNull();
    expect(empire.transferMap.size).toBe(1);
    // Le convoi n'est pas encore arrivé : rien n'a encore été livré.
    expect(empire.stationMap.get(stationId)!.resources.metals).toBe(0);

    advanceTicks(engine, 200);
    expect(empire.transferMap.size).toBe(0);
    expect(
      empire.stationMap.get(stationId)!.resources.metals,
    ).toBeGreaterThanOrEqual(200);
  });

  it("construit une zone puis une installation, et la production tourne au tick", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const empire = empireFor(engine, "alice");
    unlockOrbitalEngineering(engine, empire);
    engine.devGrant({ metals: 1000, components: 500, credits: 1000 });

    const colonyBefore = homeColony(engine, empire);
    const body = uncolonizedBody(engine, empire);
    expect(
      engine.station.foundStation(empire, colonyBefore.id, body.id),
    ).toBeNull();
    advanceTicks(engine, 1000);
    const stationId = [...empire.stationMap.keys()][0]!;

    // Approvisionne la station via deux convois successifs (chantier 24.6) plutôt
    // qu'en injectant directement des ressources : exerce le même chemin qu'un joueur
    // réel. Deux voyages car la soute des 2 cargos de départ (200) ne couvre pas en un
    // coup le besoin cumulé de la zone (150 métaux, 60 composants) et de l'installation
    // (80 métaux).
    const colony = empire.colonyMap.get(colonyBefore.id)!;
    empire.colonyMap.set(colonyBefore.id, {
      ...colony,
      orbitalResources: {
        ...colony.orbitalResources,
        metals: 1000,
        components: 500,
        energy: 500,
      },
    });
    expect(
      engine.logistics.sendTransfer(
        empire,
        colonyBefore.id,
        stationId,
        "station",
        {
          metals: 150,
          components: 50,
        },
      ),
    ).toBeNull();
    // Fait revenir les cargos (libérés à l'arrivée) avant le second voyage.
    advanceTicks(engine, 200);
    expect(
      engine.logistics.sendTransfer(
        empire,
        colonyBefore.id,
        stationId,
        "station",
        {
          metals: 80,
          components: 10,
        },
      ),
    ).toBeNull();
    advanceTicks(engine, 200);
    expect(
      empire.stationMap.get(stationId)!.resources.metals,
    ).toBeGreaterThanOrEqual(230);

    expect(
      engine.station.buildZone(empire, stationId, "industrial_zone"),
    ).toBeNull();
    advanceTicks(engine, 100);
    expect(empire.stationMap.get(stationId)!.zones.industrial_zone).toBe(1);

    expect(
      engine.station.buildInstallation(
        empire,
        stationId,
        "orbital_solar_array",
      ),
    ).toBeNull();
    // Une deuxième installation du même type dépasserait l'unique emplacement de zone.
    expect(
      engine.station.buildInstallation(
        empire,
        stationId,
        "orbital_solar_array",
      ),
    ).toMatch(/emplacement/);
    advanceTicks(engine, 100);
    const built = empire.stationMap.get(stationId)!;
    expect(built.installations.orbital_solar_array).toBe(1);

    const energyBefore = built.resources.energy;
    advanceTicks(engine, 5);
    const afterTick = empire.stationMap.get(stationId)!;
    expect(afterTick.resources.energy).toBeGreaterThan(energyBefore);
  });
});

describe("GameEngine — marché de station (chantier 25)", () => {
  const homeColony = (
    engine: GameEngine,
    empire: ReturnType<typeof empireFor>,
  ) => engine.snapshotForEmpire(empire).colonies[0]!;

  function unlockTech(
    engine: GameEngine,
    empire: ReturnType<typeof empireFor>,
    techId: string,
  ): void {
    engine.devGrant({ science: 200_000 });
    expect(engine.industry.queueResearch(empire, techId)).toBeNull();
    for (let i = 0; i < 40; i++) {
      if (empire.researched.includes(techId)) return;
      advanceTicks(engine, 400);
    }
    throw new Error(`${techId} non débloquée après 40 relances de fast-forward`);
  }

  function uncolonizedBody(
    engine: GameEngine,
    empire: ReturnType<typeof empireFor>,
  ) {
    const colonizedIds = new Set(
      [...empire.colonyMap.values()].map(
        (c: { planetId: string }) => c.planetId,
      ),
    );
    const body = engine.universe.galaxies[0]!.systems
      .flatMap((s) => s.planets)
      .find((p) => empire.explored.has(p.systemId) && !colonizedIds.has(p.id));
    if (!body)
      throw new Error(
        "aucun corps non colonisé dans le brouillard de l'empire",
      );
    return body;
  }

  /** `devFastForward`/`advanceTicks` ne décale les timers (missions, convois…) que de
   *  l'empire PAR DÉFAUT (le premier créé, `GameEngine.defaultEmpire`) — voir
   *  `GameEngine.devFastForward`. Un empire créé ensuite en test (ici, le visiteur d'une
   *  station) doit donc voir ses propres missions décalées explicitement via
   *  `logistics.shiftTime`, sinon leur `arrivesAt` reste calé sur l'horloge réelle et
   *  `advanceTicks` seul ne les fait jamais résoudre. */
  function resolveMissionsOf(
    engine: GameEngine,
    empire: ReturnType<typeof empireFor>,
    seconds = 3000,
  ): void {
    engine.logistics.shiftTime(empire, seconds * 1000);
    advanceTicks(engine, 5);
  }

  /** Fonde une station pour `alice` (empire par défaut), construit la zone commerciale
   *  et le comptoir de ressources, et retourne son id — scénario de départ partagé par
   *  les tests de marché. */
  function foundCommercialStation(
    engine: GameEngine,
    alice: ReturnType<typeof empireFor>,
  ): string {
    unlockTech(engine, alice, "orbital_commerce");
    engine.devGrant({ metals: 3000, components: 1500, credits: 3000 });

    const colonyBefore = homeColony(engine, alice);
    const body = uncolonizedBody(engine, alice);
    expect(
      engine.station.foundStation(alice, colonyBefore.id, body.id),
    ).toBeNull();
    advanceTicks(engine, 1000);
    const stationId = [...alice.stationMap.keys()][0]!;

    // Approvisionne la station (zone 180/90 + installation 140/70 = 320/160, plus des
    // crédits pour que le marché ait de quoi payer un vendeur) — plusieurs convois,
    // la soute (200) ne couvrant pas le besoin cumulé en un coup (même patron que le
    // test "construit une zone puis une installation" ci-dessus).
    const colony = alice.colonyMap.get(colonyBefore.id)!;
    alice.colonyMap.set(colonyBefore.id, {
      ...colony,
      orbitalResources: {
        ...colony.orbitalResources,
        metals: 1000,
        components: 500,
        credits: 1000,
        energy: 500,
      },
    });
    const batches: Partial<Record<"metals" | "components" | "credits", number>>[] = [
      { metals: 180, components: 20 },
      { metals: 140, components: 60 },
      { components: 80 },
      { credits: 200 },
      { credits: 100 },
    ];
    for (const cargo of batches) {
      expect(
        engine.logistics.sendTransfer(
          alice,
          colonyBefore.id,
          stationId,
          "station",
          cargo,
        ),
      ).toBeNull();
      advanceTicks(engine, 200);
    }

    expect(
      engine.station.buildZone(alice, stationId, "commercial_zone"),
    ).toBeNull();
    advanceTicks(engine, 100);
    expect(
      engine.station.buildInstallation(alice, stationId, "orbital_trade_exchange"),
    ).toBeNull();
    advanceTicks(engine, 100);
    expect(alice.stationMap.get(stationId)!.installations.orbital_trade_exchange).toBe(
      1,
    );
    return stationId;
  }

  it("setMarketPolicy : refuse une station inconnue et une taxe hors bornes", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const alice = empireFor(engine, "alice");
    const stationId = foundCommercialStation(engine, alice);

    expect(
      engine.station.setMarketPolicy(alice, "station-inconnue", "public", 0.1),
    ).toBe("Station inconnue");
    expect(
      engine.station.setMarketPolicy(alice, stationId, "public", 1.5),
    ).toMatch(/Taxe invalide/);
    expect(
      engine.station.setMarketPolicy(alice, stationId, "public", 0.1),
    ).toBeNull();
    expect(alice.stationMap.get(stationId)!.marketAccess).toBe("public");
  });

  it("une station fondée reste fermée par défaut : un visiteur est refusé", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const alice = empireFor(engine, "alice");
    const stationId = foundCommercialStation(engine, alice);
    const station = alice.stationMap.get(stationId)!;

    const bob = empireFor(engine, "bob");
    engine.exploration.markExplored(bob, station.systemId);
    const bobColony = homeColony(engine, bob);
    const bc = bob.colonyMap.get(bobColony.id)!;
    bob.colonyMap.set(bobColony.id, {
      ...bc,
      resources: { ...bc.resources, credits: 5000 },
      orbitalResources: { ...bc.orbitalResources, metals: 300 },
    });

    expect(
      engine.station.sellToStation(bob, bobColony.id, stationId, { metals: 100 }),
    ).toBe("Accès refusé — politique de marché de la station");
  });

  it("vente et achat cross-empire une fois le marché ouvert : les deux côtés sont crédités", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const alice = empireFor(engine, "alice");
    const stationId = foundCommercialStation(engine, alice);
    const station = alice.stationMap.get(stationId)!;
    expect(
      engine.station.setMarketPolicy(alice, stationId, "public", 0.1),
    ).toBeNull();

    const bob = empireFor(engine, "bob");
    engine.exploration.markExplored(bob, station.systemId);
    const bobColony = homeColony(engine, bob);
    const bc = bob.colonyMap.get(bobColony.id)!;
    bob.colonyMap.set(bobColony.id, {
      ...bc,
      resources: { ...bc.resources, credits: 5000 },
      orbitalResources: { ...bc.orbitalResources, metals: 300 },
    });
    const bobCreditsBefore = bob.colonyMap.get(bobColony.id)!.resources.credits;
    const stationMetalsBefore = alice.stationMap.get(stationId)!.resources.metals;
    const stationCreditsBefore = alice.stationMap.get(stationId)!.resources.credits;

    // Vente : Bob livre du métal à la station d'Alice, contre des crédits.
    expect(
      engine.station.sellToStation(bob, bobColony.id, stationId, { metals: 100 }),
    ).toBeNull();
    resolveMissionsOf(engine, bob);

    const bobAfterSale = bob.colonyMap.get(bobColony.id)!;
    expect(bobAfterSale.resources.credits).not.toBe(bobCreditsBefore);
    const stationAfterSale = alice.stationMap.get(stationId)!;
    expect(stationAfterSale.resources.metals).toBeGreaterThanOrEqual(
      stationMetalsBefore + 100,
    );
    // La station a payé le vendeur (net de taxe) : ses crédits ont baissé.
    expect(stationAfterSale.resources.credits).toBeLessThan(stationCreditsBefore);

    // Achat : Bob achète du métal à la station, au budget net d'une taxe de 10 %.
    const bobBudget = bobAfterSale.resources.credits;
    expect(
      engine.station.buyFromStation(bob, bobColony.id, stationId, "metals", 200),
    ).toBeNull();
    resolveMissionsOf(engine, bob);
    const bobAfterBuy = bob.colonyMap.get(bobColony.id)!;
    expect(bobAfterBuy.resources.credits).toBeLessThan(bobBudget);
    const stationAfterBuy = alice.stationMap.get(stationId)!;
    // La station a reçu le prix ET la taxe : ses crédits remontent.
    expect(stationAfterBuy.resources.credits).toBeGreaterThan(
      stationAfterSale.resources.credits,
    );
  });

  it("le propriétaire commerce toujours à sa propre station, même fermée", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const alice = empireFor(engine, "alice");
    const stationId = foundCommercialStation(engine, alice);
    // Politique par défaut ("closed") — inchangée : le propriétaire n'est pas un visiteur.
    const colony = homeColony(engine, alice);
    const c = alice.colonyMap.get(colony.id)!;
    alice.colonyMap.set(colony.id, {
      ...c,
      orbitalResources: { ...c.orbitalResources, metals: 100 },
    });
    expect(
      engine.station.sellToStation(alice, colony.id, stationId, { metals: 50 }),
    ).toBeNull();
  });
});
