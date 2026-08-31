import { describe, expect, it } from "vitest";
import {
  computeMuteStatus,
  computeSanctionStatus,
  type SanctionEntry,
} from "../auth.js";

/** Historique le plus récent d'abord — l'ordre que `sanctionHistory` renvoie. */
function history(
  ...entries: { kind: SanctionEntry["kind"]; expiresAt?: number | null }[]
): SanctionEntry[] {
  return entries.map((e, i) => ({
    id: `s${i}`,
    accountId: "acc",
    kind: e.kind,
    reason: "raison",
    actorAccountId: "admin",
    actorEmail: "admin@example.test",
    createdAt: 1000 - i,
    expiresAt: e.expiresAt ?? null,
  }));
}

/**
 * Le silence est un AXE distinct de la suspension (chantier 32.16) : deux calculs sur le
 * même historique, répondant à deux questions — peut-il se connecter, peut-il parler.
 * Les confondre ferait d'un mute une interdiction de jouer (ADR 0010).
 */
describe("computeMuteStatus", () => {
  it("un silence sans terme reste actif indéfiniment", () => {
    const status = computeMuteStatus(history({ kind: "mute" }), 10_000_000);
    expect(status.muted).toBe(true);
    expect(status.expiresAt).toBeNull();
  });

  it("un silence à terme s'éteint tout seul", () => {
    const entries = history({ kind: "mute", expiresAt: 5_000 });
    expect(computeMuteStatus(entries, 4_999).muted).toBe(true);
    expect(computeMuteStatus(entries, 5_001).muted).toBe(false);
  });

  it("`unmute` le lève, et seul le plus récent compte", () => {
    expect(
      computeMuteStatus(history({ kind: "unmute" }, { kind: "mute" })).muted,
    ).toBe(false);
    expect(
      computeMuteStatus(history({ kind: "mute" }, { kind: "unmute" })).muted,
    ).toBe(true);
  });

  it("un compte sans historique de silence peut parler", () => {
    expect(computeMuteStatus(history({ kind: "warn" })).muted).toBe(false);
    expect(computeMuteStatus([]).muted).toBe(false);
  });

  it("un silence n'empêche PAS de se connecter", () => {
    // La garantie centrale : la sanction doit correspondre à la faute.
    const entries = history({ kind: "mute" });
    expect(computeSanctionStatus(entries).active).toBe(false);
  });

  it("une suspension ne réduit pas au silence par effet de bord", () => {
    const entries = history({ kind: "suspend", expiresAt: 9_000 });
    expect(computeSanctionStatus(entries, 1).active).toBe(true);
    expect(computeMuteStatus(entries, 1).muted).toBe(false);
  });
});
