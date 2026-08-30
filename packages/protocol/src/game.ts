import { BUILDING_IDS, RESOURCES } from "@spacesim/shared";
import { z } from "zod";

const idSchema = z.string();
const resourceSchema = z.enum(RESOURCES);
// z.partialRecord (pas z.record) : ces messages décrivent une contribution/un panier
// choisi par le joueur (transfert, achat/vente, financement de portail) — jamais forcément
// les 8 ressources à la fois. Sous Zod 4, `z.record(enumKey, ...)` infère désormais le
// Record complet (toutes les clés requises) ; l'ancien comportement partiel se demande
// explicitement.
const resourcesSchema = z.partialRecord(resourceSchema, z.number());
// `.optional()` on the value (not just the field) makes Zod infer `Partial<Record<string,
// number>>` instead of a plain index signature — matching `Partial<Record<ShipId, number>>`
// in @spacesim/shared, which callers like `idleShips()` actually return.
const shipsSchema = z.record(z.string(), z.number().optional());
const liftRuleSchema = z.object({
  keepGround: z.number(),
  direction: z.enum(["up", "down"]),
});
const routeRuleSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("maintain"),
    minAtDestination: z.number(),
    keepAtSource: z.number(),
  }),
  z.object({ type: z.literal("fixed"), amount: z.number() }),
  z.object({ type: z.literal("surplus"), keepAtSource: z.number() }),
]);
/** Distingue un comptoir PNJ (TradingPost) d'une station orbitale de joueur — les deux
 * peuvent porter un marché (chantier 25), avec des règles/service propriétaire différents. */
const venueKindSchema = z.enum(["tradingPost", "station"]);

/** Commands accepted from a player WebSocket connection. */
export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("build"),
    colonyId: idSchema,
    buildingId: z.enum(BUILDING_IDS),
  }),
  z.object({
    type: z.literal("transfer"),
    fromColonyId: idSchema,
    toId: idSchema,
    toKind: z.enum(["colony", "station"]).optional(),
    resources: resourcesSchema,
    ships: shipsSchema.optional(),
    /**
     * Itinéraire choisi par le joueur (chantier 31.10), systèmes traversés dans
     * l'ordre. Absent = le serveur prend le chemin le moins cher. Toujours revalidé
     * et retarifé côté serveur : le prix ne vient jamais du client.
     */
    route: z.array(idSchema).optional(),
  }),
  z.object({
    type: z.literal("probe"),
    colonyId: idSchema,
    systemId: idSchema,
  }),
  z.object({
    /** Scan intra-système (chantier 31.11) : révèle épaves, anomalies et caches. */
    type: z.literal("scanSystem"),
    colonyId: idSchema,
    systemId: idSchema,
  }),
  z.object({
    type: z.literal("colonize"),
    colonyId: idSchema,
    planetId: idSchema,
  }),
  z.object({
    type: z.literal("foundStation"),
    colonyId: idSchema,
    bodyId: idSchema,
  }),
  z.object({
    type: z.literal("buildZone"),
    stationId: idSchema,
    zoneTypeId: idSchema,
    /** Point de croissance visé sur la grille hexagonale de la station (chantier 26). */
    q: z.number().int(),
    r: z.number().int(),
  }),
  z.object({
    type: z.literal("buildInstallation"),
    stationId: idSchema,
    installationId: idSchema,
  }),
  z.object({
    type: z.literal("setStationMarketPolicy"),
    stationId: idSchema,
    marketAccess: z.enum(["closed", "alliance", "nap", "public"]),
    taxRate: z.number().min(0).max(1),
  }),
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
    venueId: idSchema,
    venueKind: venueKindSchema,
    resources: resourcesSchema,
  }),
  z.object({
    type: z.literal("buy"),
    colonyId: idSchema,
    venueId: idSchema,
    venueKind: venueKindSchema,
    resource: resourceSchema,
    budget: z.number(),
  }),
  z.object({
    type: z.literal("buildShip"),
    colonyId: idSchema,
    shipId: idSchema,
  }),
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
    type: z.literal("buyBlueprint"),
    colonyId: idSchema,
    venueId: idSchema,
    venueKind: venueKindSchema,
    presetId: idSchema,
  }),
  z.object({
    type: z.literal("sellBlueprint"),
    colonyId: idSchema,
    venueId: idSchema,
    venueKind: venueKindSchema,
    blueprintId: idSchema,
  }),
  z.object({
    type: z.literal("sellShip"),
    colonyId: idSchema,
    venueId: idSchema,
    venueKind: venueKindSchema,
    shipId: idSchema,
    count: z.number(),
  }),
  z.object({
    type: z.literal("buildOutpost"),
    colonyId: idSchema,
    beltId: idSchema,
  }),
  z.object({
    type: z.literal("createRoute"),
    ownerColonyId: idSchema,
    fromId: idSchema,
    fromKind: z.enum(["colony", "outpost"]),
    toId: idSchema,
    toKind: z.enum(["colony", "tradingPost"]),
    resource: resourceSchema,
    rule: routeRuleSchema,
    ships: shipsSchema,
  }),
  z.object({
    type: z.literal("setRoutePaused"),
    routeId: idSchema,
    paused: z.boolean(),
  }),
  z.object({ type: z.literal("deleteRoute"), routeId: idSchema }),
  z.object({ type: z.literal("claimSystem"), systemId: idSchema }),
  z.object({ type: z.literal("unclaimSystem"), systemId: idSchema }),
  z.object({
    type: z.literal("contributeGateway"),
    colonyId: idSchema,
    galaxyId: idSchema,
    resources: resourcesSchema,
  }),
  z.object({
    type: z.literal("createFleet"),
    colonyId: idSchema,
    name: z.string(),
  }),
  z.object({
    type: z.literal("buildWarship"),
    fleetId: idSchema,
    warshipId: idSchema,
  }),
  z.object({
    type: z.literal("setFleetDirectives"),
    fleetId: idSchema,
    directives: z.record(z.string(), z.string()),
  }),
  z.object({
    type: z.literal("moveFleet"),
    fleetId: idSchema,
    toSystemId: idSchema,
    /** Itinéraire choisi (chantier 31.10) — voir `transfer`. */
    route: z.array(idSchema).optional(),
  }),
  z.object({
    type: z.literal("attackLair"),
    fleetId: idSchema,
    lairId: idSchema,
  }),
  z.object({
    type: z.literal("attackFleet"),
    fleetId: idSchema,
    targetFleetId: idSchema,
  }),
  z.object({
    type: z.literal("attackColony"),
    fleetId: idSchema,
    targetColonyId: idSchema,
  }),
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
  z.object({
    type: z.literal("respondRelation"),
    proposalId: idSchema,
    accept: z.boolean(),
  }),
  z.object({ type: z.literal("cancelProposal"), proposalId: idSchema }),
  z.object({ type: z.literal("breakRelation"), targetEmpireId: idSchema }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
