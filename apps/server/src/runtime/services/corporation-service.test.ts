import { beforeEach, describe, expect, it } from "vitest";
import { GameEngine } from "../../game.js";
import { empireFor, resetDb } from "../../test-harness.js";

beforeEach(() => resetDb());

/** Fonde une corporation et y fait entrer `joiner`, en passant par l'invitation. */
async function corpOfTwo(
  engine: GameEngine,
  a: ReturnType<typeof empireFor>,
  b: ReturnType<typeof empireFor>,
) {
  engine.corporation.foundCorporation(a, "Consortium Vega", "VEGA");
  engine.corporation.inviteToCorporation(a, b.id);
  const invite = engine.snapshotForEmpire(b).corporationInvites[0]!;
  engine.corporation.respondCorporationInvite(b, invite.id, true);
}

describe("GameEngine — corporations (chantier 32.8)", () => {
  it("fonder inscrit le fondateur et publie la corporation à ses membres", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");

    expect(
      engine.corporation.foundCorporation(a, "Consortium Vega", "vega"),
    ).toBeNull();

    const snapshot = engine.snapshotForEmpire(a);
    expect(snapshot.corporation?.name).toBe("Consortium Vega");
    // Le sigle est normalisé en majuscules : c'est une identité publique, pas une saisie.
    expect(snapshot.corporation?.tag).toBe("VEGA");
    expect(snapshot.corporationMembers).toHaveLength(1);
    expect(snapshot.corporationMembers[0]!.role).toBe("founder");
  });

  it("refuse un nom ou un sigle déjà pris", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    engine.corporation.foundCorporation(a, "Consortium Vega", "VEGA");

    expect(
      engine.corporation.foundCorporation(b, "consortium vega", "AUTR"),
    ).toBe("Ce nom est déjà pris");
    expect(engine.corporation.foundCorporation(b, "Autre nom", "vega")).toBe(
      "Ce sigle est déjà pris",
    );
  });

  it("l'appartenance est exclusive, y compris à l'acceptation tardive", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    const c = empireFor(engine, "charlie");
    engine.corporation.foundCorporation(a, "Consortium Vega", "VEGA");
    engine.corporation.foundCorporation(c, "Guilde Rigel", "RIGL");
    engine.corporation.inviteToCorporation(a, b.id);
    const invite = engine.snapshotForEmpire(b).corporationInvites[0]!;

    // b rejoint l'autre corporation AVANT de répondre : l'exclusivité doit tenir même
    // quand la vérification d'émission est devenue périmée (ADR 0009).
    engine.corporation.inviteToCorporation(c, b.id);
    const other = engine
      .snapshotForEmpire(b)
      .corporationInvites.find((i) => i.id !== invite.id)!;
    engine.corporation.respondCorporationInvite(b, other.id, true);

    expect(
      engine.corporation.respondCorporationInvite(b, invite.id, true),
    ).toBe("Vous appartenez déjà à une corporation");
  });

  it("une invitation prévient l'invité par son journal", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    engine.corporation.foundCorporation(a, "Consortium Vega", "VEGA");

    engine.corporation.inviteToCorporation(a, b.id);

    const event = engine.snapshotForEmpire(b).events[0]!;
    expect(event.kind).toBe("corp_invited");
    expect(event.otherName).toBe("Consortium Vega");
  });

  it("un membre sans droits ne peut ni inviter ni retirer du coffre", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    const c = empireFor(engine, "charlie");
    await corpOfTwo(engine, a, b);

    expect(engine.corporation.inviteToCorporation(b, c.id)).toBe(
      "Droits insuffisants",
    );
    const colony = engine.snapshotForEmpire(b).colonies[0]!;
    expect(engine.corporation.withdrawFromTreasury(b, colony.id, 10)).toBe(
      "Droits insuffisants",
    );
  });

  it("promu officier, un membre peut inviter", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    const c = empireFor(engine, "charlie");
    await corpOfTwo(engine, a, b);

    expect(
      engine.corporation.setCorporationRole(a, b.id, "officer"),
    ).toBeNull();
    expect(engine.corporation.inviteToCorporation(b, c.id)).toBeNull();
  });

  it("le rôle de fondateur ne se retire pas et le fondateur ne peut pas partir", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    await corpOfTwo(engine, a, b);
    engine.corporation.setCorporationRole(a, b.id, "officer");

    // Sans cette règle, une corporation pourrait se retrouver sans personne capable de
    // la dissoudre (ADR 0009).
    expect(engine.corporation.setCorporationRole(a, a.id, "member")).toBe(
      "Le rôle de fondateur est définitif",
    );
    expect(engine.corporation.leaveCorporation(a)).toBe(
      "Un fondateur ne peut que dissoudre sa corporation",
    );
    expect(engine.corporation.kickFromCorporation(b, a.id)).toBe(
      "Le fondateur ne peut être exclu",
    );
  });

  it("le coffre transite par les crédits d'une colonie", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    engine.corporation.foundCorporation(a, "Consortium Vega", "VEGA");
    const colony = engine.snapshotForEmpire(a).colonies[0]!;
    // Dépôt calé sur ce que la colonie mère a réellement : la dotation de départ est
    // une constante d'équilibrage, pas un contrat de ce test.
    const before = Math.floor(colony.resources.credits);
    const deposit = Math.floor(before / 2);
    expect(deposit).toBeGreaterThan(0);

    expect(
      engine.corporation.depositToTreasury(a, colony.id, deposit),
    ).toBeNull();

    let snapshot = engine.snapshotForEmpire(a);
    expect(snapshot.corporation?.treasury).toBe(deposit);
    expect(snapshot.colonies[0]!.resources.credits).toBeCloseTo(
      colony.resources.credits - deposit,
      5,
    );

    expect(
      engine.corporation.withdrawFromTreasury(a, colony.id, deposit),
    ).toBeNull();
    snapshot = engine.snapshotForEmpire(a);
    expect(snapshot.corporation?.treasury).toBe(0);
    expect(snapshot.colonies[0]!.resources.credits).toBeCloseTo(
      colony.resources.credits,
      5,
    );
  });

  it("on ne dépose pas ce qu'on n'a pas, on ne retire pas ce qui n'y est pas", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    engine.corporation.foundCorporation(a, "Consortium Vega", "VEGA");
    const colony = engine.snapshotForEmpire(a).colonies[0]!;

    expect(engine.corporation.depositToTreasury(a, colony.id, 10_000_000)).toBe(
      "Crédits insuffisants",
    );
    expect(engine.corporation.withdrawFromTreasury(a, colony.id, 1)).toBe(
      "Coffre insuffisant",
    );
  });

  it("dissoudre libère tous les membres et les prévient", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    await corpOfTwo(engine, a, b);

    expect(engine.corporation.dissolveCorporation(a)).toBeNull();

    expect(engine.snapshotForEmpire(a).corporation).toBeUndefined();
    expect(engine.snapshotForEmpire(b).corporation).toBeUndefined();
    // Le fondateur vient d'agir ; c'est l'autre membre qui apprend quelque chose.
    expect(
      engine
        .snapshotForEmpire(b)
        .events.some((e) => e.kind === "corp_dissolved"),
    ).toBe(true);
  });

  it("une corporation n'est visible que de ses membres", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const c = empireFor(engine, "charlie");
    engine.corporation.foundCorporation(a, "Consortium Vega", "VEGA");

    // Le coffre et le détail des rôles ne partent qu'aux membres (ADR 0009).
    expect(engine.snapshotForEmpire(c).corporation).toBeUndefined();
    expect(engine.snapshotForEmpire(c).corporationMembers).toHaveLength(0);
  });

  it("un empire PNJ ne peut pas être invité", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    engine.corporation.foundCorporation(a, "Consortium Vega", "VEGA");
    const npcId = engine.devService.devSpawnNpcEmpire("Marchands");

    expect(engine.corporation.inviteToCorporation(a, npcId!)).toBe(
      "Cet empire ne peut pas être invité",
    );
  });
});
