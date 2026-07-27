import type { MiningOutpost, Mission, ResourceId, Route, Transfer } from "@spacesim/shared";
import { eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";

/**
 * Propriétaire unique des tables `transfers`, `missions`, `routes` et `outposts`
 * (chantier 19.3) — le transport au sens large.
 */
export class LogisticsRepository {
  constructor(private readonly gameId: string) {}

  // ── Convois manuels ──────────────────────────────────────────────────────

  async loadTransfers(): Promise<Transfer[]> {
    return db
      .select()
      .from(schema.transfers)
      .all()
      .map((row) => ({
        id: row.id,
        fromColonyId: row.fromColonyId,
        toColonyId: row.toColonyId,
        resources: JSON.parse(row.resources),
        departedAt: row.departedAt,
        arrivesAt: row.arrivesAt,
      }));
  }

  insertTransfer(transfer: Transfer): void {
    db.insert(schema.transfers)
      .values({
        id: transfer.id,
        gameId: this.gameId,
        fromColonyId: transfer.fromColonyId,
        toColonyId: transfer.toColonyId,
        resources: JSON.stringify(transfer.resources),
        departedAt: transfer.departedAt,
        arrivesAt: transfer.arrivesAt,
      })
      .run();
  }

  /** Décalage d'horodatage (dev-fastforward). */
  saveTransferTimes(transfer: Transfer): void {
    db.update(schema.transfers)
      .set({ departedAt: transfer.departedAt, arrivesAt: transfer.arrivesAt })
      .where(eq(schema.transfers.id, transfer.id))
      .run();
  }

  removeTransfer(id: string): void {
    db.delete(schema.transfers).where(eq(schema.transfers.id, id)).run();
  }

  // ── Missions ─────────────────────────────────────────────────────────────

  async loadMissions(): Promise<Mission[]> {
    return db
      .select()
      .from(schema.missions)
      .all()
      .map((row) => ({
        id: row.id,
        kind: row.kind as Mission["kind"],
        fromColonyId: row.fromColonyId,
        targetId: row.targetId,
        departedAt: row.departedAt,
        arrivesAt: row.arrivesAt,
        ...(row.cargo ? { cargo: JSON.parse(row.cargo) } : {}),
        ...(row.budget !== null ? { budget: row.budget } : {}),
        ...(row.buyResource ? { buyResource: row.buyResource as ResourceId } : {}),
        ...(row.capacity !== null ? { capacity: row.capacity } : {}),
        ...(row.contractId ? { contractId: row.contractId } : {}),
      }));
  }

  insertMission(mission: Mission): void {
    db.insert(schema.missions)
      .values({
        id: mission.id,
        gameId: this.gameId,
        kind: mission.kind,
        fromColonyId: mission.fromColonyId,
        targetId: mission.targetId,
        departedAt: mission.departedAt,
        arrivesAt: mission.arrivesAt,
        cargo: mission.cargo ? JSON.stringify(mission.cargo) : null,
        budget: mission.budget ?? null,
        buyResource: mission.buyResource ?? null,
        capacity: mission.capacity ?? null,
        contractId: mission.contractId ?? null,
      })
      .run();
  }

  /** Décalage d'horodatage (dev-fastforward). */
  saveMissionTimes(mission: Mission): void {
    db.update(schema.missions)
      .set({ departedAt: mission.departedAt, arrivesAt: mission.arrivesAt })
      .where(eq(schema.missions.id, mission.id))
      .run();
  }

  removeMission(id: string): void {
    db.delete(schema.missions).where(eq(schema.missions.id, id)).run();
  }

  // ── Routes automatiques ──────────────────────────────────────────────────

  async loadRoutes(): Promise<Route[]> {
    return db
      .select()
      .from(schema.routes)
      .all()
      .map((row) => ({
        id: row.id,
        ownerColonyId: row.ownerColonyId,
        fromId: row.fromId,
        fromKind: row.fromKind as Route["fromKind"],
        toId: row.toId,
        toKind: row.toKind as Route["toKind"],
        resource: row.resource as ResourceId,
        rule: JSON.parse(row.rule),
        ships: JSON.parse(row.ships),
        activeCycle: row.activeCycle ? JSON.parse(row.activeCycle) : null,
        paused: row.paused === 1,
      }));
  }

  insertRoute(route: Route): void {
    db.insert(schema.routes)
      .values({
        id: route.id,
        gameId: this.gameId,
        ownerColonyId: route.ownerColonyId,
        fromId: route.fromId,
        fromKind: route.fromKind,
        toId: route.toId,
        toKind: route.toKind,
        resource: route.resource,
        rule: JSON.stringify(route.rule),
        ships: JSON.stringify(route.ships),
        activeCycle: route.activeCycle ? JSON.stringify(route.activeCycle) : null,
        paused: route.paused ? 1 : 0,
      })
      .run();
  }

  saveRoute(route: Route): void {
    db.update(schema.routes)
      .set({
        rule: JSON.stringify(route.rule),
        ships: JSON.stringify(route.ships),
        activeCycle: route.activeCycle ? JSON.stringify(route.activeCycle) : null,
        paused: route.paused ? 1 : 0,
      })
      .where(eq(schema.routes.id, route.id))
      .run();
  }

  removeRoute(id: string): void {
    db.delete(schema.routes).where(eq(schema.routes.id, id)).run();
  }

  // ── Avant-postes miniers ─────────────────────────────────────────────────

  async loadOutposts(): Promise<MiningOutpost[]> {
    return db
      .select()
      .from(schema.outposts)
      .all()
      .map((row) => ({
        id: row.id,
        beltId: row.beltId,
        ownerColonyId: row.ownerColonyId,
        oreStock: row.oreStock,
      }));
  }

  insertOutpost(outpost: MiningOutpost): void {
    db.insert(schema.outposts)
      .values({ ...outpost, gameId: this.gameId, createdAt: Date.now() })
      .run();
  }

  saveOutpostStock(outpost: MiningOutpost): void {
    db.update(schema.outposts)
      .set({ oreStock: outpost.oreStock })
      .where(eq(schema.outposts.id, outpost.id))
      .run();
  }
}
