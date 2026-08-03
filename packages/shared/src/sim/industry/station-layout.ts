import type { Station, StationZone, ZoneQueueItem } from "../../model/industry.js";

/** Coordonnées axiales sur la grille hexagonale d'une station (chantier 26). */
export interface HexCoord {
  q: number;
  r: number;
}

const HEX_DIRECTIONS: HexCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

/** Cellules occupées : le hub `(0,0)` (cœur de la station, jamais une vraie zone) plus
 *  les zones bâties ET en file — une position se réserve dès la mise en file, pas
 *  seulement à la résolution, sinon deux constructions simultanées pourraient viser la
 *  même cellule. */
function occupiedHexes(station: Pick<Station, "zones" | "zoneQueue">): Set<string> {
  const occupied = new Set<string>([hexKey(0, 0)]);
  for (const zone of station.zones) occupied.add(hexKey(zone.q, zone.r));
  for (const item of station.zoneQueue) occupied.add(hexKey(item.q, item.r));
  return occupied;
}

/**
 * Points de croissance valides : cellules vides adjacentes à une cellule occupée (hub
 * compris) — garantit une silhouette toujours connexe, jamais de zone flottante. Pure,
 * appelable identiquement côté client (rendu du diagramme) et serveur (validation d'un
 * `buildZone`).
 */
export function computeGrowthPoints(
  station: Pick<Station, "zones" | "zoneQueue">,
): HexCoord[] {
  const occupied = occupiedHexes(station);
  const candidates = new Map<string, HexCoord>();
  for (const key of occupied) {
    const [qStr, rStr] = key.split(",");
    const q = Number(qStr);
    const r = Number(rStr);
    for (const dir of HEX_DIRECTIONS) {
      const neighbor = { q: q + dir.q, r: r + dir.r };
      const neighborKey = hexKey(neighbor.q, neighbor.r);
      if (!occupied.has(neighborKey)) candidates.set(neighborKey, neighbor);
    }
  }
  return [...candidates.values()];
}

export function isValidGrowthPoint(
  station: Pick<Station, "zones" | "zoneQueue">,
  q: number,
  r: number,
): boolean {
  return computeGrowthPoints(station).some((p) => p.q === q && p.r === r);
}

/** Nombre de zones bâties d'un type donné — remplace l'ancien `zones[zoneType] ?? 0`
 *  maintenant que `zones` est une liste d'instances positionnées. */
export function zoneCount(station: Pick<Station, "zones">, zoneTypeId: string): number {
  return station.zones.filter((z) => z.zoneTypeId === zoneTypeId).length;
}

/**
 * Convertit un `zones` d'avant le chantier 26 (compte par type) en instances
 * positionnées, comme si le joueur les avait bâties une à une (premier point de
 * croissance disponible à chaque étape, ordre déterministe). Idempotente : un tableau
 * déjà migré est renvoyé tel quel.
 */
export function migrateLegacyZones(raw: unknown): StationZone[] {
  if (Array.isArray(raw)) return raw as StationZone[];
  const counts = raw as Partial<Record<string, number>>;
  const zones: StationZone[] = [];
  for (const [zoneTypeId, count] of Object.entries(counts)) {
    for (let i = 0; i < (count ?? 0); i++) {
      const pos = computeGrowthPoints({ zones, zoneQueue: [] })[0];
      if (!pos) throw new Error("Aucun point de croissance disponible");
      zones.push({ zoneTypeId, q: pos.q, r: pos.r });
    }
  }
  return zones;
}

/**
 * Assigne une position aux entrées de file antérieures au chantier 26 (`q`/`r` absents)
 * — idempotente, dans l'ordre de la file, à partir des `zones` déjà migrées comme
 * cellules occupées. Nécessaire en plus de `migrateLegacyZones` : une zone en cours de
 * construction au moment du déploiement n'a pas encore de position non plus.
 */
export function migrateLegacyZoneQueue(
  raw: unknown,
  zones: StationZone[],
): ZoneQueueItem[] {
  const items = raw as Array<Partial<ZoneQueueItem> & { zoneTypeId: string; startedAt: number; finishesAt: number }>;
  const migrated: ZoneQueueItem[] = [];
  for (const item of items) {
    if (typeof item.q === "number" && typeof item.r === "number") {
      migrated.push({ zoneTypeId: item.zoneTypeId, q: item.q, r: item.r, startedAt: item.startedAt, finishesAt: item.finishesAt });
      continue;
    }
    const pos = computeGrowthPoints({ zones, zoneQueue: migrated })[0];
    if (!pos) throw new Error("Aucun point de croissance disponible");
    migrated.push({ zoneTypeId: item.zoneTypeId, q: pos.q, r: pos.r, startedAt: item.startedAt, finishesAt: item.finishesAt });
  }
  return migrated;
}
