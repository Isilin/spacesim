import { STANDING_TRADE_MIN } from "@spacesim/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { GameEngine } from "../../game.js";
import { empireFor, resetDb, WARSHIP } from "../../test-harness.js";

beforeEach(() => resetDb());

/** Deux corporations d'un membre chacune, prêtes à se parler. */
function twoCorps(
  engine: GameEngine,
  a: ReturnType<typeof empireFor>,
  b: ReturnType<typeof empireFor>,
) {
  engine.corporation.foundCorporation(a, "Consortium Vega", "VEGA");
  engine.corporation.foundCorporation(b, "Guilde Rigel", "RIGL");
  return {
    corpA: engine.snapshotForEmpire(a).corporation!.id,
    corpB: engine.snapshotForEmpire(b).corporation!.id,
  };
}

describe("GameEngine — relations entre corporations (chantier 32.20)", () => {
  it("la guerre est unilatérale et prévient tout le camp d'en face", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    const { corpB } = twoCorps(engine, a, b);

    expect(engine.corporation.setCorpRelation(a, corpB, "war")).toBeNull();

    expect(engine.snapshotForEmpire(b).corpRelations[0]!.state).toBe("war");
    const event = engine
      .snapshotForEmpire(b)
      .events.find((e) => e.kind === "corp_relation_changed");
    expect(event?.subjectId).toBe("war");
    expect(event?.otherName).toBe("Consortium Vega");
  });

  it("un pacte n'entre en vigueur qu'à réciprocité", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    const { corpA, corpB } = twoCorps(engine, a, b);

    // Une main tendue seule ne change rien : la réciprocité fait l'accord, sans
    // dupliquer l'étage des propositions en attente (ADR 0011).
    expect(engine.corporation.setCorpRelation(a, corpB, "nap")).toBeNull();
    expect(engine.corporation.corpRelationState(corpA, corpB)).toBe("neutral");

    expect(engine.corporation.setCorpRelation(b, corpA, "nap")).toBeNull();
    expect(engine.corporation.corpRelationState(corpA, corpB)).toBe("nap");
  });

  it("la guerre de corporation prime sur la paix individuelle", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    const { corpB } = twoCorps(engine, a, b);
    const sys = "gal-0-sys-0";
    const fa = engine.devArmFleet(a, sys, { [WARSHIP]: 20 });
    const fb = engine.devArmFleet(b, sys, { [WARSHIP]: 1 });

    // Sans guerre : refusé.
    expect(engine.fleetService.attackFleet(a, fa, fb)).toBe(
      "En paix — déclarez la guerre d'abord",
    );

    engine.corporation.setCorpRelation(a, corpB, "war");
    // La guerre est héritée : aucune déclaration d'empire à empire n'a été faite.
    expect(engine.fleetService.attackFleet(a, fa, fb)).toBeNull();
  });

  it("quitter la corporation rend la paix", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    const c = empireFor(engine, "charlie");
    const { corpB } = twoCorps(engine, a, b);
    // `c` rejoint la corporation de `a`, donc hérite de sa guerre, puis en sort.
    engine.corporation.inviteToCorporation(a, c.id);
    const invite = engine.snapshotForEmpire(c).corporationInvites[0]!;
    engine.corporation.respondCorporationInvite(c, invite.id, true);
    engine.corporation.setCorpRelation(a, corpB, "war");

    expect(engine.corporation.corpsAtWar(c.id, b.id)).toBe(true);
    // Le départ est le contrepoids de l'héritage : il reste libre (ADR 0011).
    engine.corporation.leaveCorporation(c);
    expect(engine.corporation.corpsAtWar(c.id, b.id)).toBe(false);
  });

  it("un membre simple ne pose ni relation ni standing", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    const c = empireFor(engine, "charlie");
    const { corpB } = twoCorps(engine, a, b);
    engine.corporation.inviteToCorporation(a, c.id);
    const invite = engine.snapshotForEmpire(c).corporationInvites[0]!;
    engine.corporation.respondCorporationInvite(c, invite.id, true);

    expect(engine.corporation.setCorpRelation(c, corpB, "war")).toBe(
      "Droits insuffisants",
    );
    expect(engine.corporation.setStanding(c, b.id, 5)).toBe(
      "Droits insuffisants",
    );
  });
});

describe("GameEngine — standings (chantier 32.20)", () => {
  it("un standing est borné et public", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    engine.corporation.foundCorporation(a, "Consortium Vega", "VEGA");
    const corpA = engine.snapshotForEmpire(a).corporation!.id;

    expect(engine.corporation.setStanding(a, b.id, 99)).toBeNull();
    expect(engine.corporation.standingOf(corpA, b.id)).toBe(10);
    engine.corporation.setStanding(a, b.id, -99);
    expect(engine.corporation.standingOf(corpA, b.id)).toBe(-10);

    // Public : c'est tout son intérêt, il rend une position lisible d'un tiers.
    expect(
      engine.snapshotForEmpire(b).standings.some((s) => s.targetId === b.id),
    ).toBe(true);
  });

  it("noter une corporation profite à ses membres", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");
    const { corpB } = twoCorps(engine, a, b);

    engine.corporation.setStanding(a, corpB, STANDING_TRADE_MIN);

    // Sinon noter une corporation entière serait sans effet sur qui que ce soit.
    expect(engine.corporation.standingTowards(a.id, b.id)).toBe(
      STANDING_TRADE_MIN,
    );
  });

  it("un empire sans corporation n'a pas d'opinion à exprimer", async () => {
    const engine = await GameEngine.loadOrBootstrap();
    const a = empireFor(engine, "alpha");
    const b = empireFor(engine, "bravo");

    // Le standing est un objet de corporation, pas d'empire (ADR 0011).
    expect(engine.corporation.standingTowards(a.id, b.id)).toBe(0);
    expect(engine.corporation.setStanding(a, b.id, 5)).toBe(
      "Vous n'appartenez à aucune corporation",
    );
  });
});
