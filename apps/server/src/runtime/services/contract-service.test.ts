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
    // L'orbite de l'ÉMETTEUR est vidée en continu : la colonie mère monte du minerai par
    // défaut, et `deliverToOrbit` ÉCRÊTE à la capacité orbitale libre. Le convoi arrivant
    // d'autant plus tard que la route est longue, l'orbite pouvait être pleine à son
    // arrivée et n'accepter qu'une partie de la cargaison — cinq unités sur dix, mesuré.
    // Ce test porte sur la livraison, pas sur la saturation d'un dock.
    engine.logistics.setLiftRule(issuer, issuerColony.id, "ore", {
      keepGround: 100_000,
      direction: "down",
    });

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
    engine.devGrant({ credits: 500, energy: 400 });
    // L'orbite de l'ACCEPTEUR est libérée de son minerai avant tout : un dock unique tient
    // 600 unités, la colonie mère naît avec une consigne d'ascension par défaut sur le
    // minerai, et le carburant d'un convoi lointain peut à lui seul frôler ce plafond
    // (mesuré à 494 après le chantier 45.5). Sans ça, le convoi reste à quai faute de place.
    engine.logistics.setLiftRule(accepter, accepterColony.id, "ore", {
      keepGround: 100_000,
      direction: "down",
    });
    advanceTicks(engine, 20);
    engine.logistics.setLiftRule(accepter, accepterColony.id, "ore", null);
    engine.logistics.setLiftRule(accepter, accepterColony.id, "energy", {
      keepGround: 0,
      direction: "up",
    });
    advanceTicks(engine, 60);

    // Le carburant d'un convoi dépend du nombre de sauts ET, depuis le chantier 45.2, du
    // danger du système d'arrivée : aucune avance de temps fixe ne le couvre pour toutes les
    // seeds, et les soixante ticks ci-dessus ont cessé de suffire au premier changement de
    // générateur. On accumule donc jusqu'à ce que l'orbite couvre la demande, en
    // INTERROGEANT le moteur plutôt qu'en devinant : une acceptation qui manque de carburant
    // ne mute rien (`takeFromOrbit` et `reserveShip` rendent des copies), elle sert de sonde.
    const accept = () =>
      engine.contract.acceptContract(
        accepter,
        accepterColony.id,
        contractId,
        10,
      );
    let orbitalFoodBefore = homeColony(engine, accepter).orbitalResources.food;
    let refusal = accept();
    for (
      let waited = 0;
      waited < 480 && refusal?.startsWith("Carburant");
      waited += 10
    ) {
      // Le sol est redoté à chaque tour : l'ascenseur consomme de l'énergie pour en hisser
      // (`LIFT_ENERGY_PER_UNIT`), donc la seule production organique plafonne l'orbite bien
      // en dessous de ce qu'un convoi lointain demande, quel que soit le temps accordé.
      engine.devGrant({ energy: 400 });
      advanceTicks(engine, 10);
      orbitalFoodBefore = homeColony(engine, accepter).orbitalResources.food;
      refusal = accept();
    }
    expect(refusal).toBeNull();

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

    // On avance jusqu'à ce que le convoi arrive, plutôt que d'un nombre de ticks calculé
    // depuis `arrivesAt`. La durée annoncée à l'acceptation ne couvre pas tout ce qui
    // sépare l'acceptation de l'arrivée, et le nombre de sauts dépend de la seed : la
    // marge fixe était juste ou insuffisante selon l'univers tiré, et le chantier 45 —
    // qui a rendu les sauts plus chers et changé la géométrie des galaxies — l'a fait
    // basculer du mauvais côté. Le plafond garde le test borné si rien n'arrive jamais.
    const durationS = Math.ceil(
      (mission!.arrivesAt - mission!.departedAt) / 1000,
    );
    const maxTicks = Math.ceil((durationS + 5) / 5) * 3 + 20;
    let ticksElapsed = 0;
    while (
      homeColony(engine, issuer).orbitalResources.food <
        issuerFoodBefore + 10 &&
      ticksElapsed < maxTicks
    ) {
      advanceTicks(engine, 1);
      ticksElapsed++;
    }

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
    // Le nom d'affichage se résout côté client par id (chantier 27.19) — issuerName
    // reste un repli figé, mais issuerFactionId est la source de vérité pour un
    // contrat de faction (jamais renseigné pour un contrat d'empire).
    expect(contract!.issuerFactionId).toBe(factionId);
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

    // L'orbite d'un dock unique tient 600 unités, et elles se partagent entre le carburant
    // et la cargaison. La colonie mère en occupe déjà ~200 avec son minerai et ses vivres :
    // on les redescend d'abord, consigne retirée aussitôt pour qu'elle ne dispute pas le
    // débit de l'ascenseur à ce qui monte ensuite.
    for (const res of ["ore", "food"] as const) {
      engine.logistics.setLiftRule(empire, colony.id, res, {
        keepGround: 100_000,
        direction: "down",
      });
    }
    advanceTicks(engine, 10);
    for (const res of ["ore", "food"] as const) {
      engine.logistics.setLiftRule(empire, colony.id, res, null);
    }

    // Dotation relevée au chantier 45.2 : le danger du système d'arrivée renchérit le
    // carburant jusqu'à 60 %. La seed d'univers est fixée en test (`vitest.config.ts`), donc
    // la distance ne varie plus — mais la marge, elle, avait disparu.
    engine.devGrant({ energy: 320, credits: 500 });
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
    // Redote le SOL en énergie : l'ascenseur en consomme à chaque unité hissée
    // (`LIFT_ENERGY_PER_UNIT`), et la consigne précédente a tout monté en orbite pour le
    // carburant. Sans ce second apport, la cargaison n'a plus de quoi être levée.
    //
    // La dotation suit la quantité demandée au lieu d'un 400 fixe : les 600 unités du dock
    // unique se partagent entre la cargaison et le carburant, que le chantier 45.2 a
    // renchéri de 60 % au plus selon le danger du système d'arrivée. Hisser 400 unités dont
    // 280 inutiles remplissait l'orbite, le complément d'énergie n'entrait plus, et le
    // convoi restait à quai pour une raison qui ne se lisait nulle part.
    //
    // La marge de 60 n'est pas décorative non plus : la colonie CONSOMME la ressource
    // pendant les trente ticks d'ascension, et une dotation à la quantité exacte arrivait
    // en orbite amputée de deux unités — assez pour faire refuser l'acceptation.
    //
    // Plafond du pire cas : `FACTION_CONTRACT_QUANTITY_MAX` (120) + 60 + 225 d'énergie déjà
    // hissée = 405 sur 600, de quoi loger le carburant du convoi le plus lointain.
    const qty = contract.quantity;
    engine.devGrant({
      energy: 400,
      [contract.resource]: qty + 60,
    } as Record<string, number>);
    engine.logistics.setLiftRule(empire, colony.id, contract.resource, {
      keepGround: 0,
      direction: "up",
    });
    advanceTicks(engine, 30);

    const repBefore = empire.factionRep[factionId] ?? 0;
    // Même raison que le test de fourniture ci-dessus, aggravée ici : la quantité demandée
    // par la faction varie d'une exécution à l'autre, donc le carburant aussi. La cargaison
    // est déjà en orbite à ce stade — rouvrir la consigne d'énergie ne lui dispute plus rien.
    const accept = () =>
      engine.contract.acceptContract(empire, colony.id, contract.id, qty);
    let refusal = accept();
    if (refusal?.startsWith("Carburant")) {
      // La consigne de cargaison est coupée d'abord : la cargaison utile est déjà en orbite,
      // et tout reliquat resté au sol disputerait le débit unique de l'ascenseur à l'énergie
      // qu'on veut y hisser — servi avant elle s'il précède dans `RESOURCES`, la boucle
      // tournerait alors sans jamais faire monter un joule.
      engine.logistics.setLiftRule(empire, colony.id, contract.resource, null);
      engine.logistics.setLiftRule(empire, colony.id, "energy", {
        keepGround: 0,
        direction: "up",
      });
      for (
        let waited = 0;
        waited < 300 && refusal?.startsWith("Carburant");
        waited += 10
      ) {
        engine.devGrant({ energy: 400 });
        advanceTicks(engine, 10);
        refusal = accept();
      }
      engine.logistics.setLiftRule(empire, colony.id, "energy", null);
    }
    expect(refusal).toBeNull();

    const mission = engine
      .snapshotForEmpire(empire)
      .missions.find((m) => m.kind === "deliver_contract")!;
    expect(mission).toBeDefined();
    const creditsBeforeDelivery = homeColony(engine, empire).resources.credits;

    // On avance jusqu'à la livraison plutôt que d'un nombre de ticks calculé depuis
    // `arrivesAt` — même fragilité que le contrat entre empires plus haut : la durée
    // annoncée à l'acceptation ne couvre pas tout ce qui sépare l'acceptation de l'arrivée,
    // et le nombre de sauts dépend de la seed.
    const durationS = Math.ceil(
      (mission.arrivesAt - mission.departedAt) / 1000,
    );
    const maxTicks = Math.ceil((durationS + 5) / 5) * 3 + 20;
    for (let tick = 0; tick < maxTicks; tick++) {
      if (engine.snapshotForEmpire(empire).missions.length === 0) break;
      advanceTicks(engine, 1);
    }

    // Payé au prix fixé du contrat, standing crédité — même mécanique qu'un empire émetteur.
    expect(homeColony(engine, empire).resources.credits).toBeGreaterThanOrEqual(
      creditsBeforeDelivery + Math.floor(qty * contract.pricePerUnit),
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
