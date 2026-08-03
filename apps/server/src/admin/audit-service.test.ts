import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "../db/index.js";
import { listAuditEntries, recordAuditEntry } from "./audit-service.js";

beforeEach(async () => {
  await db.delete(schema.adminAuditLog);
});

describe("audit-service", () => {
  it("journalise une entrée et la retrouve à la lecture", async () => {
    await recordAuditEntry({
      actorAccountId: "acc-1",
      actorEmail: "admin@exemple.fr",
      action: "audit.read",
      targetType: "account",
      targetId: "acc-2",
      reason: "vérification",
    });
    const entries = await listAuditEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorAccountId: "acc-1",
      actorEmail: "admin@exemple.fr",
      action: "audit.read",
      targetType: "account",
      targetId: "acc-2",
      reason: "vérification",
    });
  });

  it("champs optionnels absents → null, pas undefined", async () => {
    await recordAuditEntry({
      actorAccountId: "acc-1",
      actorEmail: "admin@exemple.fr",
      action: "audit.read",
    });
    const [entry] = await listAuditEntries();
    expect(entry?.targetType).toBeNull();
    expect(entry?.targetId).toBeNull();
    expect(entry?.reason).toBeNull();
    expect(entry?.metadata).toBeNull();
  });

  it("les entrées les plus récentes arrivent en premier", async () => {
    await recordAuditEntry(
      {
        actorAccountId: "acc-1",
        actorEmail: "a@exemple.fr",
        action: "audit.read",
      },
      1000,
    );
    await recordAuditEntry(
      {
        actorAccountId: "acc-1",
        actorEmail: "a@exemple.fr",
        action: "audit.read",
      },
      2000,
    );
    const entries = await listAuditEntries();
    expect(entries.map((e) => e.createdAt)).toEqual([2000, 1000]);
  });

  it("respecte la limite passée", async () => {
    for (let i = 0; i < 5; i++) {
      await recordAuditEntry(
        {
          actorAccountId: "acc-1",
          actorEmail: "a@exemple.fr",
          action: "audit.read",
        },
        i,
      );
    }
    expect(await listAuditEntries(2)).toHaveLength(2);
  });
});
