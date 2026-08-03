import { beforeEach, describe, expect, it } from "vitest";
import { FACTIONS, OBJECTIVE_REWARD_CREDITS } from "@spacesim/shared";
import { GameEngine } from "../../game.js";
import { resetDb, advanceTicks, empireFor } from "../../test-harness.js";

beforeEach(() => resetDb());

/** Colonie mère de l'empire, relue depuis le snapshot. */
const homeColony = (engine: GameEngine, empire: ReturnType<typeof empireFor>) =>
  engine.snapshotForEmpire(empire).colonies[0]!;

describe("GameEngine — contrats de fourniture (chantier 14)", () => {
  it("postContract : publie un contrat et met le séquestre sous garde", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const empire = engine.defaultEmpireForDev;
    const colony = homeColony(engine, empire);
    const creditsBefore = colony.resources.credits;

    expect(
      engine.contract.postContract(empire, colony.id, "ore", 10, 1, 3_600_000),
    ).toBeNull();

    // Séquestre = quantité × prix, prélevé au sol (les crédits ne sont pas orbitaux).
    expect(homeColony(engine, empire).resources.credits).toBe(
      creditsBefore - 10,
    );

    const contract = engine.contracts[0]!;
    expect(contract.resource).toBe("ore");
    expect(contract.remaining).toBe(10);
    expect(contract.status).toBe("open");
    expect(contract.issuerId).toBe(empire.id);
  });

  it("un contrat est diffusé à tous les empires, pas seulement à son émetteur (pas de brouillard)", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const empire = engine.defaultEmpireForDev;
    const colony = homeColony(engine, empire);
    // Un tiers totalement étranger à la transaction — jamais exploré le système de
    // l'émetteur, jamais interagi avec lui.
    const bystander = engine.empireById(engine.devSpawnEmpire("Spectateur")!)!;

    expect(
      engine.contract.postContract(empire, colony.id, "ore", 10, 1, 3_600_000),
    ).toBeNull();
    const contractId = engine.contracts[0]!.id;

    // Comme leaderboard/gateways : diffusé en entier, à la différence de markets/territories
    // qui restent brouillardés par empire.
    const seenByBystander = engine
      .snapshotForEmpire(bystander)
      .contracts.find((c) => c.id === contractId);
    expect(seenByBystander).toBeDefined();
    expect(seenByBystander!.status).toBe("open");
    expect(seenByBystander!.issuerName).toBe(empire.name);
  });

  it("postContract : refuse une ressource non contractualisable (crédits, science)", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const empire = engine.defaultEmpireForDev;
    const colony = homeColony(engine, empire);
    expect(
      engine.contract.postContract(
        empire,
        colony.id,
        "credits",
        10,
        1,
        3_600_000,
      ),
    ).toMatch(/non contractualisable/);
  });

  it("postContract : refuse si le séquestre dépasse les crédits disponibles", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const empire = engine.defaultEmpireForDev;
    const colony = homeColony(engine, empire);
    expect(
      engine.contract.postContract(
        empire,
        colony.id,
        "ore",
        10_000,
        1,
        3_600_000,
      ),
    ).toMatch(/Crédits insuffisants/);
  });

  it("cancelContract : rembourse le séquestre et clôt le contrat", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const empire = engine.defaultEmpireForDev;
    const colony = homeColony(engine, empire);
    const creditsBefore = colony.resources.credits;
    engine.contract.postContract(empire, colony.id, "ore", 10, 1, 3_600_000);
    const contractId = engine.contracts[0]!.id;

    expect(engine.contract.cancelContract(empire, contractId)).toBeNull();
    expect(homeColony(engine, empire).resources.credits).toBe(creditsBefore);
    expect(engine.contracts[0]!.status).toBe("cancelled");
  });

  it("cancelContract : refuse si l'appelant n'est pas l'émetteur", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const issuer = engine.defaultEmpireForDev;
    const colony = homeColony(engine, issuer);
    engine.contract.postContract(issuer, colony.id, "ore", 10, 1, 3_600_000);
    const contractId = engine.contracts[0]!.id;
    // devSpawnEmpire (pas empireFor) : un compte adopterait l'empire par défaut encore
    // libre, ce qui en ferait le même empire que l'émetteur au lieu d'un tiers.
    const other = engine.empireById(engine.devSpawnEmpire("Curieux")!)!;

    expect(engine.contract.cancelContract(other, contractId)).toMatch(
      /Seul l'émetteur/,
    );
  });

  it("un contrat non honoré expire et rembourse le séquestre restant", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const empire = engine.defaultEmpireForDev;
    const colony = homeColony(engine, empire);
    // Séquestre volontairement massif : la production organique de la colonie sur la
    // fenêtre du test (taxe par colon, quelques crédits) ne doit pas pouvoir la noyer.
    engine.devGrant({ credits: 2000 });
    const creditsAfterGrant = homeColony(engine, empire).resources.credits;
    engine.contract.postContract(empire, colony.id, "ore", 1000, 1, 300_000); // durée mini clampée

    advanceTicks(engine, 400 / 5); // dépasse largement l'échéance

    expect(engine.contracts[0]!.status).toBe("expired");
    expect(engine.contracts[0]!.remaining).toBe(1000); // rien n'a été livré
    // Le séquestre (1000) revient, à la production organique de la fenêtre près.
    expect(homeColony(engine, empire).resources.credits).toBeGreaterThan(
      creditsAfterGrant - 50,
    );
  });

  it("acceptContract : livre la cargaison à l'émetteur (autre empire) et paie l'accepteur", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    // L'accepteur est l'empire par défaut : seuls ses timers sont avancés par
    // devFastForward (outil de dev mono-empire — Sprint 0), indispensable pour faire
    // arriver le convoi dans ce test.
    const accepter = engine.defaultEmpireForDev;
    const accepterColony = homeColony(engine, accepter);
    // devSpawnEmpire (pas empireFor) : un compte adopterait l'empire par défaut encore
    // libre, ce qui en ferait le même empire que l'accepteur au lieu d'un tiers.
    const issuer = engine.empireById(engine.devSpawnEmpire("Émetteur")!)!;
    const issuerColony = homeColony(engine, issuer);

    // Nourriture, pas minerai : le minerai a une consigne d'ascension par défaut (colonie
    // mère) qui ferait dériver l'orbite toute seule sur la longue avance de temps ci-dessous.
    expect(
      engine.contract.postContract(
        issuer,
        issuerColony.id,
        "food",
        10,
        2,
        3_600_000,
      ),
    ).toBeNull();
    const contractId = engine.contracts[0]!.id;

    // Amorce généreuse d'énergie en orbite et de crédits au sol : sans elles, aucun convoi
    // ne peut appareiller ni payer ses frais, et le nombre de sauts jusqu'à la colonie
    // émettrice (donc carburant et frais) dépend de la seed — pas de marge fixe fiable.
    engine.devGrant({ credits: 500 });
    engine.logistics.setLiftRule(accepter, accepterColony.id, "energy", {
      keepGround: 0,
      direction: "up",
    });
    advanceTicks(engine, 60);

    const beforeAccept = homeColony(engine, accepter);
    const orbitalFoodBefore = beforeAccept.orbitalResources.food;

    expect(
      engine.contract.acceptContract(
        accepter,
        accepterColony.id,
        contractId,
        10,
      ),
    ).toBeNull();

    const afterAccept = homeColony(engine, accepter);
    expect(afterAccept.orbitalResources.food).toBe(orbitalFoodBefore - 10);

    // Décompté à l'acceptation, pas à la livraison — anti-survente.
    const accepted = engine
      .snapshotForEmpire(issuer)
      .contracts.find((c) => c.id === contractId)!;
    expect(accepted.remaining).toBe(0);
    expect(accepted.status).toBe("fulfilled");
    const mission = engine
      .snapshotForEmpire(accepter)
      .missions.find((m) => m.kind === "deliver_contract");
    expect(mission).toBeDefined();

    const issuerFoodBefore = homeColony(engine, issuer).orbitalResources.food;
    const accepterCreditsBeforeDelivery = homeColony(engine, accepter).resources
      .credits;

    // Juste assez pour faire arriver CE convoi précis (le nombre de sauts, donc la durée,
    // dépend de la seed — pas une avance à l'aveugle).
    const durationS = Math.ceil(
      (mission!.arrivesAt - mission!.departedAt) / 1000,
    );
    const ticksElapsed = Math.ceil((durationS + 5) / 5);
    advanceTicks(engine, ticksElapsed);

    const issuerAfter = homeColony(engine, issuer);
    expect(issuerAfter.orbitalResources.food).toBe(issuerFoodBefore + 10);
    // Payé au prix du contrat (2 crédits/unité × 10 livrées), à la production organique
    // (taxe par colon) des ticks écoulés près — bornée très au-dessus de ce qu'elle peut
    // réellement produire, pour ne détecter qu'un paiement manquant, pas la dérive normale.
    // Marge large aussi pour un objectif éphémère (chantier 17) qui se déclencherait et
    // verserait sa récompense dans la même fenêtre — un aléa hors de portée du test.
    const creditsAfterDelivery = homeColony(engine, accepter).resources.credits;
    const organicTolerance = ticksElapsed * 2 + 5 + OBJECTIVE_REWARD_CREDITS;
    expect(creditsAfterDelivery).toBeGreaterThanOrEqual(
      accepterCreditsBeforeDelivery + 20,
    );
    expect(creditsAfterDelivery).toBeLessThan(
      accepterCreditsBeforeDelivery + 20 + organicTolerance,
    );
    expect(engine.snapshotForEmpire(accepter).missions).toHaveLength(0);
  });

  it("acceptContract : refuse d'accepter son propre contrat", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const empire = engine.defaultEmpireForDev;
    const colony = homeColony(engine, empire);
    engine.contract.postContract(empire, colony.id, "ore", 10, 1, 3_600_000);
    const contractId = engine.contracts[0]!.id;
    expect(
      engine.contract.acceptContract(empire, colony.id, contractId, 10),
    ).toMatch(/propre contrat/);
  });

  it("acceptContract : refuse une quantité au-delà du reliquat", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const issuer = engine.defaultEmpireForDev;
    const colony = homeColony(engine, issuer);
    engine.contract.postContract(issuer, colony.id, "ore", 10, 1, 3_600_000);
    const contractId = engine.contracts[0]!.id;
    const other = engine.empireById(engine.devSpawnEmpire("Voisin")!)!;
    const otherColony = homeColony(engine, other);
    expect(
      engine.contract.acceptContract(other, otherColony.id, contractId, 999),
    ).toMatch(/indisponible/);
  });
});
describe("GameEngine — contrats de faction (chantier 15)", () => {
  /** Faction d'un comptoir de la galaxie d'origine : garantit que le contrat de pénurie
   * déclenché cible un comptoir à portée (pas de portail requis pour l'atteindre). */
  const homeGalaxyFactionId = (engine: GameEngine) =>
    engine.universe.galaxies[0]!.systems.find((s) => s.station)!.station!
      .factionId;

  it("une pénurie publie un contrat pour un besoin réel, sans séquestre prélevé", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const factionId = homeGalaxyFactionId(engine);
    expect(engine.devSetFactionMood(factionId, "shortage")).toBe(true);

    const contract = engine.contracts.find((c) => c.issuerId === factionId);
    expect(contract).toBeDefined();
    expect(contract!.status).toBe("open");
    expect(contract!.issuerName).toBe(
      FACTIONS[factionId as keyof typeof FACTIONS].name,
    );
    expect(
      Object.keys(FACTIONS[factionId as keyof typeof FACTIONS].consumes),
    ).toContain(contract!.resource);
  });

  it("ne double jamais un contrat de pénurie tant qu'un autre est ouvert", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const factionId = homeGalaxyFactionId(engine);
    engine.devSetFactionMood(factionId, "shortage");
    engine.devSetFactionMood(factionId, "neutral");
    engine.devSetFactionMood(factionId, "shortage");

    expect(
      engine.contracts.filter(
        (c) => c.issuerId === factionId && c.status === "open",
      ),
    ).toHaveLength(1);
  });

  it("honoré, un contrat de faction livre au comptoir, paie au prix fixé et crédite le standing", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const empire = engine.defaultEmpireForDev;
    const colony = homeColony(engine, empire);
    const factionId = homeGalaxyFactionId(engine);

    expect(engine.devSetFactionMood(factionId, "shortage")).toBe(true);
    const contract = engine.contracts.find((c) => c.issuerId === factionId)!;

    // Lève d'abord l'énergie du carburant, SEULE et en quantité MODESTE : l'orbite n'a
    // que 600 de capacité totale (dock unique), déjà entamée par le minerai/vivres de
    // la colonie mère (200) — trop d'énergie la remplirait avant même d'y loger la
    // cargaison. Le débit de l'ascenseur est aussi partagé entre consignes "up"
    // (RESOURCES itère l'énergie en premier), donc lever les deux à la fois affamerait
    // la cargaison derrière l'énergie.
    engine.devGrant({ energy: 200, credits: 500 });
    engine.logistics.setLiftRule(empire, colony.id, "energy", {
      keepGround: 0,
      direction: "up",
    });
    advanceTicks(engine, 15);
    engine.logistics.setLiftRule(empire, colony.id, "energy", null);

    // Puis la cargaison demandée (quelle qu'elle soit), seule à son tour. La colonie mère
    // naît avec sa PROPRE consigne "up" sur le minerai (chantier 12) — sans la couper, elle
    // continuerait de disputer le même débit et pourrait affamer la cargaison demandée.
    engine.logistics.setLiftRule(empire, colony.id, "ore", null);
    engine.devGrant({ [contract.resource]: 150 } as Record<string, number>);
    engine.logistics.setLiftRule(empire, colony.id, contract.resource, {
      keepGround: 0,
      direction: "up",
    });
    advanceTicks(engine, 30);

    const repBefore = empire.factionRep[factionId] ?? 0;
    expect(
      engine.contract.acceptContract(
        empire,
        colony.id,
        contract.id,
        contract.quantity,
      ),
    ).toBeNull();

    const mission = engine
      .snapshotForEmpire(empire)
      .missions.find((m) => m.kind === "deliver_contract")!;
    expect(mission).toBeDefined();
    const creditsBeforeDelivery = homeColony(engine, empire).resources.credits;

    const durationS = Math.ceil(
      (mission.arrivesAt - mission.departedAt) / 1000,
    );
    advanceTicks(engine, Math.ceil((durationS + 5) / 5));

    // Payé au prix fixé du contrat, standing crédité — même mécanique qu'un empire émetteur.
    expect(homeColony(engine, empire).resources.credits).toBeGreaterThanOrEqual(
      creditsBeforeDelivery +
        Math.floor(contract.quantity * contract.pricePerUnit),
    );
    expect(empire.factionRep[factionId] ?? 0).toBeGreaterThan(repBefore);
    expect(engine.snapshotForEmpire(empire).missions).toHaveLength(0);
    expect(engine.contracts.find((c) => c.id === contract.id)!.status).toBe(
      "fulfilled",
    );
  });

  it("un contrat de faction expiré sans être honoré n'entraîne aucun remboursement", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const factionId = homeGalaxyFactionId(engine);
    expect(engine.devSetFactionMood(factionId, "shortage")).toBe(true);
    const contractId = engine.contracts.find(
      (c) => c.issuerId === factionId,
    )!.id;

    // Échéance du contrat = FACTION_CONTRACT_DURATION_MS (1800 s = 360 ticks), indépendante
    // de la durée d'humeur passée à devSetFactionMood — marge large pour la dépasser.
    advanceTicks(engine, 370);

    expect(engine.contracts.find((c) => c.id === contractId)!.status).toBe(
      "expired",
    );
  });
});
