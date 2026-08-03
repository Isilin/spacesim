import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "../../db/index.js";
import { resetDb } from "../../test-harness.js";
import { Persister } from "./persister.js";
import { WriteSet } from "./write-set.js";

/** Silencieux : le Persister journalise un warn attendu au test d'échec. */
const silentLogger = { info: () => {}, warn: () => {} };

const objectiveRow = (
  id: string,
  overrides: Partial<Record<string, unknown>> = {},
) => ({
  id,
  gameId: "g1",
  empireId: "e1",
  kind: "explore",
  targetCount: null,
  targetSystemId: null,
  reward: 10,
  createdAt: 1,
  deadline: 1000,
  status: "open",
  ...overrides,
});

const readObjective = async (id: string) => {
  const rows = await db
    .select()
    .from(schema.objectives)
    .where(eq(schema.objectives.id, id));
  return rows[0];
};

beforeEach(() => resetDb());

describe("Persister.flush", () => {
  it("dernière écriture gagne : deux upserts du même pk avant flush ne produisent que le dernier", async () => {
    const writeSet = new WriteSet();
    const persister = new Persister(writeSet, silentLogger);

    writeSet.upsert(
      "objectives",
      "obj-1",
      objectiveRow("obj-1", { reward: 1 }),
    );
    writeSet.upsert(
      "objectives",
      "obj-1",
      objectiveRow("obj-1", { reward: 2 }),
    );
    await persister.flush();

    expect((await readObjective("obj-1"))?.reward).toBe(2);
  });

  it("delete après save : le delete l'emporte au flush", async () => {
    const writeSet = new WriteSet();
    const persister = new Persister(writeSet, silentLogger);

    writeSet.upsert("objectives", "obj-2", objectiveRow("obj-2"));
    writeSet.delete("objectives", "obj-2");
    await persister.flush();

    expect(await readObjective("obj-2")).toBeUndefined();
  });

  it("save après delete (recréation) : l'upsert l'emporte au flush", async () => {
    const writeSet = new WriteSet();
    const persister = new Persister(writeSet, silentLogger);
    // Existe déjà en base depuis un flush précédent.
    writeSet.upsert(
      "objectives",
      "obj-3",
      objectiveRow("obj-3", { reward: 5 }),
    );
    await persister.flush();

    writeSet.delete("objectives", "obj-3");
    writeSet.upsert(
      "objectives",
      "obj-3",
      objectiveRow("obj-3", { reward: 9 }),
    );
    await persister.flush();

    expect((await readObjective("obj-3"))?.reward).toBe(9);
  });

  it("une update ré-écrit la ligne existante (pas seulement à l'insertion)", async () => {
    const writeSet = new WriteSet();
    const persister = new Persister(writeSet, silentLogger);

    writeSet.upsert(
      "objectives",
      "obj-4",
      objectiveRow("obj-4", { status: "open" }),
    );
    await persister.flush();
    writeSet.upsert(
      "objectives",
      "obj-4",
      objectiveRow("obj-4", { status: "done" }),
    );
    await persister.flush();

    expect((await readObjective("obj-4"))?.status).toBe("done");
  });

  it("reprise après un flush qui échoue : l'entrée reste en attente et se rejoue au flush suivant", async () => {
    const writeSet = new WriteSet();
    const persister = new Persister(writeSet, silentLogger);

    // Ligne incomplète (reward/createdAt/deadline manquants, NOT NULL sans défaut) :
    // l'UPDATE ne touche 0 ligne (rien en base), le fallback INSERT viole la contrainte.
    writeSet.upsert("objectives", "obj-5", {
      id: "obj-5",
      gameId: "g1",
      empireId: "e1",
      kind: "x",
    });
    await persister.flush();

    expect(persister.lastFlushError).not.toBeNull();
    expect(await readObjective("obj-5")).toBeUndefined();
    expect(writeSet.isEmpty()).toBe(false); // l'entrée en échec est retournée au WriteSet.

    // Correction et nouvel essai : le flush suivant réussit.
    writeSet.upsert(
      "objectives",
      "obj-5",
      objectiveRow("obj-5", { reward: 42 }),
    );
    await persister.flush();

    expect(persister.lastFlushError).toBeNull();
    expect((await readObjective("obj-5"))?.reward).toBe(42);
  });

  it("flush sans rien en attente ne touche pas la base et reste silencieux", async () => {
    const writeSet = new WriteSet();
    const persister = new Persister(writeSet, silentLogger);
    await expect(persister.flush()).resolves.toBeUndefined();
    expect(persister.lastFlushAt).toBeNull();
  });

  it("sérialise les flush concurrents : un flush demandé pendant un flush en cours attend puis rejoue", async () => {
    const writeSet = new WriteSet();
    const persister = new Persister(writeSet, silentLogger);

    writeSet.upsert(
      "objectives",
      "obj-6",
      objectiveRow("obj-6", { reward: 1 }),
    );
    const first = persister.flush();
    // Une seconde entrée arrive AVANT que le premier flush ne soit retombé — elle ne
    // doit pas être perdue (le flush en cours l'a déjà drainée sans elle).
    writeSet.upsert(
      "objectives",
      "obj-7",
      objectiveRow("obj-7", { reward: 7 }),
    );
    const second = persister.flush();

    await Promise.all([first, second]);

    expect((await readObjective("obj-6"))?.reward).toBe(1);
    expect((await readObjective("obj-7"))?.reward).toBe(7);
  });
});
