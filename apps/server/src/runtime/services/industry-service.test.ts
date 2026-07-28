import { beforeEach, describe, expect, it } from "vitest";
import { TECHS } from "@spacesim/shared";
import { GameEngine } from "../../game.js";
import { resetDb, advanceTicks, empireFor } from "../../test-harness.js";

beforeEach(() => resetDb());

describe("GameEngine — file de recherche (chantier 11)", () => {
  /** Science offerte à la colonie mère pour dérouler une chaîne sans attendre. */
  const grantScience = (engine: GameEngine, amount: number) => engine.devGrant({ science: amount });

  it("planifie une chaîne et l'enchaîne recherche après recherche", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const empire = empireFor(engine, "alice");
    grantScience(engine, 5000);

    // fusion_power exige metallurgy → advanced_mining : trois recherches successives.
    expect(engine.industry.queueResearch(empire, "fusion_power")).toBeNull();
    expect(engine.snapshotForEmpire(empire).game.research?.techId).toBe("metallurgy");
    expect(engine.snapshotForEmpire(empire).game.researchQueue).toEqual([
      "advanced_mining",
      "fusion_power",
    ]);

    // Le temps passe : chaque tech terminée laisse la place à la suivante, sans clic.
    engine.devFastForward(3600);
    const state = engine.snapshotForEmpire(empire).game;
    expect(state.researched).toContain("metallurgy");
    expect(state.researched).toContain("advanced_mining");
    expect(state.researched).toContain("fusion_power");
    expect(state.researchQueue).toEqual([]);
    expect(state.research).toBeNull();
  });

  it("refuse une chaîne déjà acquise et sait se vider", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const empire = empireFor(engine, "alice");
    grantScience(engine, 5000);

    expect(engine.industry.queueResearch(empire, "inconnue")).toBe("Technologie inconnue");
    expect(engine.industry.queueResearch(empire, "fusion_power")).toBeNull();
    expect(engine.industry.clearResearchQueue(empire)).toBeNull();
    expect(engine.snapshotForEmpire(empire).game.researchQueue).toEqual([]);
    // La recherche déjà lancée n'est pas annulée par le vidage de la file.
    expect(engine.snapshotForEmpire(empire).game.research).not.toBeNull();

    engine.devFastForward(3600);
    expect(engine.industry.queueResearch(empire, "metallurgy")).toBe("Technologie déjà acquise");
  });

  it("la file patiente au lieu de se vider quand la science manque", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const empire = empireFor(engine, "alice");
    // Juste de quoi payer la première tech de la chaîne.
    grantScience(engine, TECHS.metallurgy.cost);

    expect(engine.industry.queueResearch(empire, "fusion_power")).toBeNull();
    engine.devFastForward(600);
    const state = engine.snapshotForEmpire(empire).game;
    expect(state.researched).toContain("metallurgy");
    // La suite reste en attente, prête à repartir dès que la science rentre.
    expect(state.researchQueue).toContain("fusion_power");
  });
});
describe("GameEngine — conception de vaisseaux (chantier 13)", () => {
  const snap = (engine: GameEngine, empire: ReturnType<typeof empireFor>) =>
    engine.snapshotForEmpire(empire);
  /** Plan civil (domaine colonie) et militaire (domaine flotte), tous deux constructibles sans tech. */
  const COLONY_BP = {
    chassisId: "light_freighter",
    modules: ["cargo_pod", "cargo_pod", "ion_thruster"],
  };
  const FLEET_BP = {
    chassisId: "scout_frame",
    modules: ["laser_pulse", "armor_plating", "ion_thruster", "cargo_pod"],
  };
  /** Station de la galaxie d'origine, rendue visible de l'empire (même recette que le test logistique). */
  const reachableStation = (engine: GameEngine, empire: ReturnType<typeof empireFor>) => {
    const station = engine.universe.galaxies[0]!.systems.find((s) => s.station)?.station;
    if (!station) throw new Error("la galaxie d'origine a toujours au moins une station");
    engine.devArmFleet(empire, station.systemId, {});
    return station;
  };

  it("un empire neuf est amorcé avec les plans de départ", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alice");
    const plans = snap(engine, a).blueprints;
    expect(plans.length).toBeGreaterThanOrEqual(2);
    expect(plans.every((p) => p.ownerId === a.id)).toBe(true);
  });

  it("crée un plan valide, rejette un plan qui dépasse les emplacements", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alice");
    const before = snap(engine, a).blueprints.length;
    expect(
      engine.industry.createBlueprint(a, "Mon cargo", COLONY_BP.chassisId, COLONY_BP.modules),
    ).toBeNull();
    expect(snap(engine, a).blueprints.length).toBe(before + 1);
    // scout_frame n'a qu'un slot d'arme : deux lasers → refus.
    expect(
      engine.industry.createBlueprint(a, "Trop armé", "scout_frame", [
        "laser_pulse",
        "laser_pulse",
      ]),
    ).not.toBeNull();
  });

  it("les plans sont isolés par empire", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alice");
    const b = empireFor(engine, "bob");
    engine.industry.createBlueprint(a, "Secret d'Alice", COLONY_BP.chassisId, COLONY_BP.modules);
    const namesB = snap(engine, b).blueprints.map((p) => p.name);
    expect(namesB).not.toContain("Secret d'Alice");
  });

  it("construit un plan de domaine colonie : file navale puis livraison", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alice");
    engine.devGrant({ metals: 1000, components: 500 });
    const colony = snap(engine, a).colonies[0]!;
    const plan = snap(engine, a).blueprints.find((p) => p.chassisId === "light_freighter")!;
    expect(engine.industry.buildBlueprint(a, plan.id, colony.id)).toBeNull();
    expect(snap(engine, a).colonies[0]!.shipQueue.some((q) => q.shipId === plan.id)).toBe(true);
    advanceTicks(engine, 60);
    expect(snap(engine, a).colonies[0]!.ships[plan.id] ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("construit un plan de domaine flotte : file de la flotte", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alice");
    const colony = snap(engine, a).colonies[0]!;
    // Grant pour couvrir le coût du châssis + modules.
    engine.devGrant({ metals: 1000, components: 500 });
    expect(engine.fleetService.createFleet(a, colony.id, "1re escadre")).toBeNull();
    const fleetId = snap(engine, a).fleets[0]!.id;
    const plan = snap(engine, a).blueprints.find((p) => p.chassisId === "scout_frame")!;
    const err = engine.industry.buildBlueprint(a, plan.id, undefined, fleetId);
    expect(err).toBeNull();
    expect(snap(engine, a).fleets[0]!.queue.some((q) => q.warshipId === plan.id)).toBe(true);
  });

  it("refuse de bâtir un plan de flotte au chantier civil (mauvais domaine)", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alice");
    const colony = snap(engine, a).colonies[0]!;
    const fleetPlan = snap(engine, a).blueprints.find((p) => p.chassisId === "scout_frame")!;
    expect(engine.industry.buildBlueprint(a, fleetPlan.id, colony.id)).not.toBeNull();
  });

  it("les plans survivent au rechargement", async () => {
    const e1 = await GameEngine.loadOrBootstrap();
    const a = empireFor(e1, "alice");
    engine_createNamed(e1, a);
    // Création directe (pas une commande WS ni un tick) : flush explicite avant de
    // simuler un reboot (chantier 20.2), sinon le plan reste dans le WriteSet en mémoire.
    await e1.flush();
    const e2 = await GameEngine.loadOrBootstrap();
    const a2 = e2.empireForAccount("alice")!;
    expect(e2.snapshotForEmpire(a2).blueprints.map((p) => p.name)).toContain("Persistant");
  });

  describe("marché de plans en station", () => {
    it("achète un plan de départ : crédits débités, plan ajouté", async () => {
      const engine = await GameEngine.loadOrBootstrap();
      const a = empireFor(engine, "alice");
      const station = reachableStation(engine, a);
      engine.devGrant({ credits: 5000 });
      const colony = snap(engine, a).colonies[0]!;
      const before = snap(engine, a).blueprints.length;

      expect(
        engine.industry.buyBlueprintFromStation(a, colony.id, station.id, "cruiser_mk1"),
      ).toBeNull();

      const after = snap(engine, a);
      expect(after.blueprints.length).toBe(before + 1);
      expect(after.colonies[0]!.resources.credits).toBeLessThan(colony.resources.credits);
    });

    it("refuse l'achat sans crédits suffisants", async () => {
      const engine = await GameEngine.loadOrBootstrap();
      const a = empireFor(engine, "alice");
      const station = reachableStation(engine, a);
      const colony = snap(engine, a).colonies[0]!;
      expect(
        engine.industry.buyBlueprintFromStation(a, colony.id, station.id, "cruiser_mk1"),
      ).toMatch(/Crédits insuffisants/);
    });

    it("refuse l'achat d'un preset inconnu", async () => {
      const engine = await GameEngine.loadOrBootstrap();
      const a = empireFor(engine, "alice");
      const station = reachableStation(engine, a);
      const colony = snap(engine, a).colonies[0]!;
      engine.devGrant({ credits: 5000 });
      expect(
        engine.industry.buyBlueprintFromStation(a, colony.id, station.id, "n-importe-quoi"),
      ).toMatch(/inconnu/);
    });

    it("revend un plan : crédité, plan retiré", async () => {
      const engine = await GameEngine.loadOrBootstrap();
      const a = empireFor(engine, "alice");
      const station = reachableStation(engine, a);
      const colony = snap(engine, a).colonies[0]!;
      const plan = snap(engine, a).blueprints[0]!;
      const creditsBefore = colony.resources.credits;

      expect(engine.industry.sellBlueprint(a, colony.id, station.id, plan.id)).toBeNull();

      const after = snap(engine, a);
      expect(after.blueprints.some((p) => p.id === plan.id)).toBe(false);
      expect(after.colonies[0]!.resources.credits).toBeGreaterThan(creditsBefore);
    });

    it("revend un vaisseau assemblé (classe historique) : décompte le pool, crédite", async () => {
      const engine = await GameEngine.loadOrBootstrap();
      const a = empireFor(engine, "alice");
      const station = reachableStation(engine, a);
      const colony = snap(engine, a).colonies[0]!;
      expect(colony.ships.cargo_small).toBe(2); // amorcé à la fondation
      const creditsBefore = colony.resources.credits;

      expect(engine.industry.sellShip(a, colony.id, station.id, "cargo_small", 1)).toBeNull();

      const after = snap(engine, a).colonies[0]!;
      expect(after.ships.cargo_small).toBe(1);
      expect(after.resources.credits).toBeGreaterThan(creditsBefore);
    });

    it("refuse de vendre plus de vaisseaux que disponibles", async () => {
      const engine = await GameEngine.loadOrBootstrap();
      const a = empireFor(engine, "alice");
      const station = reachableStation(engine, a);
      const colony = snap(engine, a).colonies[0]!;
      expect(engine.industry.sellShip(a, colony.id, station.id, "cargo_small", 99)).not.toBeNull();
    });
  });
});
/** Crée un plan nommé « Persistant » (helper du test de persistance). */
function engine_createNamed(engine: GameEngine, empire: ReturnType<typeof empireFor>): void {
  engine.industry.createBlueprint(empire, "Persistant", "light_freighter", [
    "cargo_pod",
    "ion_thruster",
  ]);
}
