import {
  BUILDING_IDS,
  RESOURCES,
  type ClientMessage as SharedClientMessage,
} from "@spacesim/shared";
import { z } from "zod";

const idSchema = z.string();
const resourceSchema = z.enum(RESOURCES);
const resourcesSchema = z.record(resourceSchema, z.number());
const shipsSchema = z.record(z.string(), z.number());
const liftRuleSchema = z.object({
  keepGround: z.number(),
  direction: z.enum(["up", "down"]),
});
const routeRuleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("maintain"), minAtDestination: z.number(), keepAtSource: z.number() }),
  z.object({ type: z.literal("fixed"), amount: z.number() }),
  z.object({ type: z.literal("surplus"), keepAtSource: z.number() }),
]);

/** Commands accepted from a player WebSocket connection. */
export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("build"), colonyId: idSchema, buildingId: z.enum(BUILDING_IDS) }),
  z.object({
    type: z.literal("transfer"),
    fromColonyId: idSchema,
    toColonyId: idSchema,
    resources: resourcesSchema,
    ships: shipsSchema.optional(),
  }),
  z.object({ type: z.literal("probe"), colonyId: idSchema, systemId: idSchema }),
  z.object({ type: z.literal("colonize"), colonyId: idSchema, planetId: idSchema }),
  z.object({ type: z.literal("research"), techId: idSchema }),
  z.object({ type: z.literal("queueResearch"), techId: idSchema }),
  z.object({ type: z.literal("clearResearchQueue") }),
  z.object({
    type: z.literal("setLiftRule"),
    colonyId: idSchema,
    resource: resourceSchema,
    rule: liftRuleSchema.nullable(),
  }),
  z.object({
    type: z.literal("sell"),
    colonyId: idSchema,
    stationId: idSchema,
    resources: resourcesSchema,
  }),
  z.object({
    type: z.literal("buy"),
    colonyId: idSchema,
    stationId: idSchema,
    resource: resourceSchema,
    budget: z.number(),
  }),
  z.object({ type: z.literal("buildShip"), colonyId: idSchema, shipId: idSchema }),
  z.object({
    type: z.literal("createBlueprint"),
    name: z.string(),
    chassisId: idSchema,
    modules: z.array(idSchema),
  }),
  z.object({
    type: z.literal("updateBlueprint"),
    blueprintId: idSchema,
    name: z.string(),
    chassisId: idSchema,
    modules: z.array(idSchema),
  }),
  z.object({ type: z.literal("deleteBlueprint"), blueprintId: idSchema }),
  z.object({
    type: z.literal("buildBlueprint"),
    blueprintId: idSchema,
    colonyId: idSchema.optional(),
    fleetId: idSchema.optional(),
  }),
  z.object({
    type: z.literal("buyBlueprintFromStation"),
    colonyId: idSchema,
    stationId: idSchema,
    presetId: idSchema,
  }),
  z.object({
    type: z.literal("sellBlueprint"),
    colonyId: idSchema,
    stationId: idSchema,
    blueprintId: idSchema,
  }),
  z.object({
    type: z.literal("sellShip"),
    colonyId: idSchema,
    stationId: idSchema,
    shipId: idSchema,
    count: z.number(),
  }),
  z.object({ type: z.literal("buildOutpost"), colonyId: idSchema, beltId: idSchema }),
  z.object({
    type: z.literal("createRoute"),
    ownerColonyId: idSchema,
    fromId: idSchema,
    fromKind: z.enum(["colony", "outpost"]),
    toId: idSchema,
    toKind: z.enum(["colony", "station"]),
    resource: resourceSchema,
    rule: routeRuleSchema,
    ships: shipsSchema,
  }),
  z.object({ type: z.literal("setRoutePaused"), routeId: idSchema, paused: z.boolean() }),
  z.object({ type: z.literal("deleteRoute"), routeId: idSchema }),
  z.object({ type: z.literal("claimSystem"), systemId: idSchema }),
  z.object({ type: z.literal("unclaimSystem"), systemId: idSchema }),
  z.object({
    type: z.literal("contributeGateway"),
    colonyId: idSchema,
    galaxyId: idSchema,
    resources: resourcesSchema,
  }),
  z.object({ type: z.literal("createFleet"), colonyId: idSchema, name: z.string() }),
  z.object({ type: z.literal("buildWarship"), fleetId: idSchema, warshipId: idSchema }),
  z.object({
    type: z.literal("setFleetDirectives"),
    fleetId: idSchema,
    directives: z.record(z.string(), z.string()),
  }),
  z.object({ type: z.literal("moveFleet"), fleetId: idSchema, toSystemId: idSchema }),
  z.object({ type: z.literal("attackLair"), fleetId: idSchema, lairId: idSchema }),
  z.object({ type: z.literal("attackFleet"), fleetId: idSchema, targetFleetId: idSchema }),
  z.object({ type: z.literal("attackColony"), fleetId: idSchema, targetColonyId: idSchema }),
  z.object({ type: z.literal("declareWar"), targetEmpireId: idSchema }),
  z.object({ type: z.literal("makePeace"), targetEmpireId: idSchema }),
  z.object({ type: z.literal("disbandFleet"), fleetId: idSchema }),
  z.object({
    type: z.literal("postContract"),
    colonyId: idSchema,
    resource: resourceSchema,
    quantity: z.number(),
    pricePerUnit: z.number(),
    durationMs: z.number(),
  }),
  z.object({
    type: z.literal("acceptContract"),
    colonyId: idSchema,
    contractId: idSchema,
    quantity: z.number(),
  }),
  z.object({ type: z.literal("cancelContract"), contractId: idSchema }),
  z.object({
    type: z.literal("proposeRelation"),
    targetEmpireId: idSchema,
    kind: z.enum(["nap", "alliance"]),
  }),
  z.object({ type: z.literal("respondRelation"), proposalId: idSchema, accept: z.boolean() }),
  z.object({ type: z.literal("cancelProposal"), proposalId: idSchema }),
  z.object({ type: z.literal("breakRelation"), targetEmpireId: idSchema }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// Parity check, temporary until 1.2 moves ClientMessage out of @spacesim/shared: fails
// `tsc --noEmit` the moment the Zod-inferred type and the legacy shared type diverge.
// One-directional on purpose: what matters is that every Zod-validated command still fits
// the shapes `GameEngine` methods expect (still typed against the legacy shared union). The
// reverse direction trips on a harmless TS quirk — `z.record(z.string(), V)` infers a plain
// index signature, not `Partial<Record<string, V>>` — that has no runtime or call-site effect.
type _ClientMessageFitsShared = ClientMessage extends SharedClientMessage ? true : never;
const _clientMessageParity: _ClientMessageFitsShared = true;
void _clientMessageParity;
