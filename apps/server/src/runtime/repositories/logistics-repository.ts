import type { MiningOutpost, Mission, ResourceId, Route, Transfer } from "@spacesim/shared";
import { db, schema } from "../../db/index.js";
import type { WriteSet } from "../persistence/write-set.js";

/**
 * Propriétaire unique des tables `transfers`, `missions`, `routes` et `outposts`
 * (chantier 19.3) — le transport au sens large.
 */
export class LogisticsRepository {
  constructor(
    private readonly gameId: string,
    private readonly writeSet: WriteSet,
  ) {}

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

  private transferRow(transfer: Transfer) {
    return {
      id: transfer.id,
      gameId: this.gameId,
      fromColonyId: transfer.fromColonyId,
      toColonyId: transfer.toColonyId,
      resources: JSON.stringify(transfer.resources),
      departedAt: transfer.departedAt,
      arrivesAt: transfer.arrivesAt,
    };
  }

  insertTransfer(transfer: Transfer): void {
    this.writeSet.upsert("transfers", transfer.id, this.transferRow(transfer));
  }

  /** Décalage d'horodatage (dev-fastforward). */
  saveTransferTimes(transfer: Transfer): void {
    this.writeSet.upsert("transfers", transfer.id, this.transferRow(transfer));
  }

  removeTransfer(id: string): void {
    this.writeSet.delete("transfers", id);
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

  private missionRow(mission: Mission) {
    return {
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
    };
  }

  insertMission(mission: Mission): void {
    this.writeSet.upsert("missions", mission.id, this.missionRow(mission));
  }

  /** Décalage d'horodatage (dev-fastforward). */
  saveMissionTimes(mission: Mission): void {
    this.writeSet.upsert("missions", mission.id, this.missionRow(mission));
  }

  removeMission(id: string): void {
    this.writeSet.delete("missions", id);
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

  private routeRow(route: Route) {
    return {
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
    };
  }

  insertRoute(route: Route): void {
    this.writeSet.upsert("routes", route.id, this.routeRow(route));
  }

  saveRoute(route: Route): void {
    this.writeSet.upsert("routes", route.id, this.routeRow(route));
  }

  removeRoute(id: string): void {
    this.writeSet.delete("routes", id);
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

  private outpostRow(outpost: MiningOutpost, createdAt: number) {
    return { ...outpost, gameId: this.gameId, createdAt };
  }

  insertOutpost(outpost: MiningOutpost): void {
    this.writeSet.upsert("outposts", outpost.id, this.outpostRow(outpost, Date.now()));
  }

  saveOutpostStock(outpost: MiningOutpost): void {
    // `createdAt` non porté par `MiningOutpost` : sans risque, `save` ne s'appelle
    // jamais avant `insert` pour un avant-poste (même garantie que `ColonyRepository`).
    this.writeSet.upsert("outposts", outpost.id, this.outpostRow(outpost, 0));
  }
}
