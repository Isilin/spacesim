import { describe, expect, it } from "vitest";
import { ClientMessageSchema } from "./game.js";

describe("ClientMessageSchema", () => {
  it("accepts representative valid game commands", () => {
    expect(
      ClientMessageSchema.safeParse({
        type: "build",
        colonyId: "colony-1",
        buildingId: "mine",
      }).success,
    ).toBe(true);
    expect(
      ClientMessageSchema.safeParse({
        type: "createRoute",
        ownerColonyId: "colony-1",
        fromId: "colony-1",
        fromKind: "colony",
        toId: "station-1",
        toKind: "tradingPost",
        resource: "ore",
        rule: { type: "surplus", keepAtSource: 20 },
        ships: { hauler: 1 },
      }).success,
    ).toBe(true);
  });

  it("accepts transfer with and without the optional convoy", () => {
    expect(
      ClientMessageSchema.safeParse({
        type: "transfer",
        fromColonyId: "colony-1",
        toId: "colony-2",
        resources: { ore: 50 },
      }).success,
    ).toBe(true);
    expect(
      ClientMessageSchema.safeParse({
        type: "transfer",
        fromColonyId: "colony-1",
        toId: "colony-2",
        resources: { ore: 50 },
        ships: { hauler: 2 },
      }).success,
    ).toBe(true);
    // toKind est optionnel — omis, il vaut "colony" côté serveur (chantier 24.6).
    expect(
      ClientMessageSchema.safeParse({
        type: "transfer",
        fromColonyId: "colony-1",
        toId: "station-1",
        toKind: "station",
        resources: { metals: 50 },
      }).success,
    ).toBe(true);
  });

  it("accepts setLiftRule with a null rule (removes the consign)", () => {
    expect(
      ClientMessageSchema.safeParse({
        type: "setLiftRule",
        colonyId: "colony-1",
        resource: "ore",
        rule: null,
      }).success,
    ).toBe(true);
    expect(
      ClientMessageSchema.safeParse({
        type: "setLiftRule",
        colonyId: "colony-1",
        resource: "ore",
        rule: { keepGround: 100, direction: "up" },
      }).success,
    ).toBe(true);
  });

  it("rejects unknown commands and incomplete payloads", () => {
    expect(ClientMessageSchema.safeParse({ type: "teleport" }).success).toBe(
      false,
    );
    expect(
      ClientMessageSchema.safeParse({ type: "build", colonyId: "colony-1" })
        .success,
    ).toBe(false);
  });
});
