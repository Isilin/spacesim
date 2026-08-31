import { beforeEach, describe, expect, it } from "vitest";
import { GameEngine } from "../../game.js";
import { empireFor, resetDb } from "../../test-harness.js";

beforeEach(() => resetDb());

/** Galaxie de la capitale d'un empire — son canal régional. */
function homeGalaxy(engine: GameEngine, empire: ReturnType<typeof empireFor>) {
  const channel = engine
    .snapshotForEmpire(empire)
    .chatChannels.find((c) => c.scope === "galaxy");
  expect(channel).toBeDefined();
  return channel!.scopeId;
}

describe("GameEngine — canaux de discussion (chantier 32.14)", () => {
  it("le canal de galaxie est ouvert par la simple présence d'une colonie", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");

    // Aucun abonnement : l'appartenance se dérive de l'état du jeu (ADR 0010).
    const channels = engine.snapshotForEmpire(a).chatChannels;
    expect(channels.some((c) => c.scope === "galaxy")).toBe(true);
    expect(channels.some((c) => c.scope === "corp")).toBe(false);
  });

  it("fonder une corporation ouvre son canal, la dissoudre le referme", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    engine.corporation.foundCorporation(a, "Consortium Vega", "VEGA");

    expect(
      engine.snapshotForEmpire(a).chatChannels.some((c) => c.scope === "corp"),
    ).toBe(true);

    engine.corporation.dissolveCorporation(a);
    expect(
      engine.snapshotForEmpire(a).chatChannels.some((c) => c.scope === "corp"),
    ).toBe(false);
  });

  it("un message de galaxie atteint les voisins, pas les étrangers à la galaxie", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    const galaxyId = homeGalaxy(engine, a);

    expect(
      engine.communication.sendChatMessage(a, "galaxy", galaxyId, "Bonjour"),
    ).toBeNull();

    const heardByAuthor = engine.snapshotForEmpire(a).chat;
    expect(heardByAuthor.map((m) => m.body)).toContain("Bonjour");
    // `b` n'entend que s'il a lui aussi une colonie dans cette galaxie — le canal est un
    // lieu, pas une liste de diffusion.
    const bInSameGalaxy = engine
      .snapshotForEmpire(b)
      .chatChannels.some((c) => c.scope === "galaxy" && c.scopeId === galaxyId);
    expect(engine.snapshotForEmpire(b).chat.length > 0).toBe(bInSameGalaxy);
  });

  it("on ne parle pas dans un canal auquel on n'appartient pas", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    engine.corporation.foundCorporation(b, "Guilde Rigel", "RIGL");
    const corpId = engine.snapshotForEmpire(b).corporation!.id;

    expect(
      engine.communication.sendChatMessage(a, "corp", corpId, "Espion"),
    ).toBe("Vous n'appartenez pas à ce canal");
    expect(engine.snapshotForEmpire(b).chat).toHaveLength(0);
  });

  it("un empire réduit au silence ne peut ni parler ni écrire", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    const galaxyId = homeGalaxy(engine, a);
    // Le silence est vérifié à l'ENVOI, côté serveur : masquer le champ de saisie est un
    // confort, jamais la mesure (ADR 0010).
    a.mutedUntil = Number.POSITIVE_INFINITY;

    expect(
      engine.communication.sendChatMessage(a, "galaxy", galaxyId, "Spam"),
    ).toBe("Vous êtes réduit au silence");
    expect(engine.communication.sendMail(a, b.id, "Objet", "Corps")).toBe(
      "Vous êtes réduit au silence",
    );
  });

  it("un silence échu ne bloque plus rien", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const galaxyId = homeGalaxy(engine, a);
    a.mutedUntil = Date.now() - 1;

    expect(
      engine.communication.sendChatMessage(a, "galaxy", galaxyId, "Libre"),
    ).toBeNull();
  });
});

describe("GameEngine — courrier (chantier 32.15)", () => {
  it("un courrier arrive au destinataire et le prévient par son journal", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");

    expect(
      engine.communication.sendMail(
        a,
        b.id,
        "Proposition",
        "Parlons commerce.",
      ),
    ).toBeNull();

    const received = engine.snapshotForEmpire(b);
    expect(received.mails).toHaveLength(1);
    expect(received.mails[0]!.subject).toBe("Proposition");
    // Une seule pastille à tenir cohérente : le journal prévient, la boîte conserve.
    expect(received.events.some((e) => e.kind === "mail_received")).toBe(true);
    // L'expéditeur n'en garde pas de copie.
    expect(engine.snapshotForEmpire(a).mails).toHaveLength(0);
  });

  it("marquer lu puis supprimer n'agit que sur son propre courrier", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    engine.communication.sendMail(a, b.id, "Objet", "Corps");
    const mailId = engine.snapshotForEmpire(b).mails[0]!.id;

    // Silencieux à dessein : un id de courrier d'autrui ne doit rien révéler.
    engine.communication.markMailRead(a.id, mailId);
    expect(engine.snapshotForEmpire(b).mails[0]!.readAt).toBeNull();

    engine.communication.markMailRead(b.id, mailId);
    expect(engine.snapshotForEmpire(b).mails[0]!.readAt).not.toBeNull();

    engine.communication.deleteMail(a.id, mailId);
    expect(engine.snapshotForEmpire(b).mails).toHaveLength(1);
    engine.communication.deleteMail(b.id, mailId);
    expect(engine.snapshotForEmpire(b).mails).toHaveLength(0);
  });

  it("un PNJ ne reçoit pas de courrier", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const npcId = engine.devService.devSpawnNpcEmpire("Marchands")!;

    expect(engine.communication.sendMail(a, npcId, "Objet", "Corps")).toBe(
      "Cet empire ne reçoit pas de courrier",
    );
  });
});
