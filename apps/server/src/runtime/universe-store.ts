import {
  computeGalaxyParentIndex,
  GENERATOR_VERSION,
  galaxyIndexOfId,
  type AsteroidBelt,
  type Galaxy,
  type Planet,
  type PlanetType,
  type StarSystem,
  type TradeStation,
  type Universe,
} from "@spacesim/shared";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";

/**
 * Persistance de l'univers matérialisé (chantier 18). Ces fonctions sont le SEUL
 * chemin d'écriture des tables `universe_*` : le générateur produit les galaxies
 * neuves, ce module les grave, et la DB fait ensuite autorité — `loadUniverse`
 * renvoie ce qui est en base, corrections manuelles comprises, jamais une
 * régénération.
 */

/**
 * Renvoie l'univers avec `parentIndex` figé sur chaque galaxie qui ne l'a pas
 * encore (calcul positionnel sur les positions RÉELLES de l'univers passé —
 * celles de la DB pour les galaxies déjà matérialisées).
 */
export function withParentIndexes(universe: Universe): Universe {
  return {
    ...universe,
    galaxies: universe.galaxies.map((g, i) =>
      g.parentIndex !== undefined
        ? g
        : { ...g, parentIndex: computeGalaxyParentIndex(universe, i) },
    ),
  };
}

/**
 * Matérialise en UNE transaction les galaxies encore absentes de la base et aligne
 * `games.galaxyCount`. Idempotent : une galaxie déjà en base est ignorée (jamais
 * réécrite). Les `Galaxy` passées doivent porter `parentIndex` (voir
 * `withParentIndexes`) — l'arbre inter-galactique se fige ici.
 */
export function appendGalaxies(
  gameId: string,
  galaxies: readonly Galaxy[],
  galaxyCount: number,
): void {
  const now = Date.now();
  db.transaction((tx) => {
    for (const galaxy of galaxies) {
      const index = galaxyIndexOfId(galaxy.id);
      if (index > 0 && galaxy.parentIndex === undefined) {
        throw new Error(`Galaxie ${galaxy.id} sans parentIndex figé — voir withParentIndexes()`);
      }
      const exists = tx
        .select({ id: schema.universeGalaxies.id })
        .from(schema.universeGalaxies)
        .where(eq(schema.universeGalaxies.id, galaxy.id))
        .get();
      if (exists) continue;

      tx.insert(schema.universeGalaxies)
        .values({
          id: galaxy.id,
          gameId,
          index,
          name: galaxy.name,
          x: galaxy.x,
          y: galaxy.y,
          depositBonus: galaxy.depositBonus,
          anchorSystemId: galaxy.anchorSystemId,
          parentGalaxyIndex: galaxy.parentIndex ?? null,
          generatorVersion: GENERATOR_VERSION,
          materializedAt: now,
        })
        .run();

      tx.insert(schema.universeSystems)
        .values(
          galaxy.systems.map((system, systemIndex) => ({
            id: system.id,
            galaxyId: galaxy.id,
            systemIndex,
            name: system.name,
            x: system.x,
            y: system.y,
          })),
        )
        .run();

      for (const system of galaxy.systems) {
        if (system.planets.length > 0) {
          tx.insert(schema.universeBodies)
            .values(
              system.planets.map((body, bodyIndex) => ({
                id: body.id,
                systemId: system.id,
                bodyIndex,
                kind: body.kind,
                parentPlanetId: body.parentPlanetId ?? null,
                name: body.name,
                type: body.type,
                habitability: body.habitability,
                slots: body.slots,
                deposits: JSON.stringify(body.deposits),
                orbitRadius: body.orbitRadius,
                orbitAngle: body.orbitAngle,
              })),
            )
            .run();
        }
        if (system.belts.length > 0) {
          tx.insert(schema.universeBelts)
            .values(
              system.belts.map((belt, beltIndex) => ({
                id: belt.id,
                systemId: system.id,
                beltIndex,
                name: belt.name,
                orbitRadius: belt.orbitRadius,
                deposits: JSON.stringify(belt.deposits),
              })),
            )
            .run();
        }
        if (system.station) {
          tx.insert(schema.universeStations)
            .values({
              id: system.station.id,
              systemId: system.id,
              factionId: system.station.factionId,
              name: system.station.name,
            })
            .run();
        }
      }

      if (galaxy.links.length > 0) {
        tx.insert(schema.universeLinks)
          .values(
            galaxy.links.map(([aSystemId, bSystemId], linkIndex) => ({
              galaxyId: galaxy.id,
              aSystemId,
              bSystemId,
              linkIndex,
            })),
          )
          .run();
      }
    }

    tx.update(schema.games).set({ galaxyCount }).where(eq(schema.games.id, gameId)).run();
  });
}

/** Nombre de galaxies matérialisées pour cet univers. */
export function materializedGalaxyCount(gameId: string): number {
  return db
    .select({ id: schema.universeGalaxies.id })
    .from(schema.universeGalaxies)
    .where(eq(schema.universeGalaxies.gameId, gameId))
    .all().length;
}

/**
 * Reconstruit l'univers depuis les tables (ordre garanti par les colonnes `*_index`).
 * Renvoie `null` si aucune galaxie n'est matérialisée.
 */
export function loadUniverse(gameId: string, seed: string): Universe | null {
  const galaxyRows = db
    .select()
    .from(schema.universeGalaxies)
    .where(eq(schema.universeGalaxies.gameId, gameId))
    .all()
    .sort((a, b) => a.index - b.index);
  if (galaxyRows.length === 0) return null;

  const systemRows = db.select().from(schema.universeSystems).all();
  const bodyRows = db.select().from(schema.universeBodies).all();
  const beltRows = db.select().from(schema.universeBelts).all();
  const stationRows = db.select().from(schema.universeStations).all();
  const linkRows = db.select().from(schema.universeLinks).all();

  const bodiesBySystem = groupBy(bodyRows, (r) => r.systemId);
  const beltsBySystem = groupBy(beltRows, (r) => r.systemId);
  const stationBySystem = new Map(stationRows.map((r) => [r.systemId, r]));
  const systemsByGalaxy = groupBy(systemRows, (r) => r.galaxyId);
  const linksByGalaxy = groupBy(linkRows, (r) => r.galaxyId);

  const galaxies: Galaxy[] = galaxyRows.map((galaxyRow) => {
    const systems: StarSystem[] = (systemsByGalaxy.get(galaxyRow.id) ?? [])
      .sort((a, b) => a.systemIndex - b.systemIndex)
      .map((systemRow) => {
        const planets: Planet[] = (bodiesBySystem.get(systemRow.id) ?? [])
          .sort((a, b) => a.bodyIndex - b.bodyIndex)
          .map((body) => ({
            id: body.id,
            systemId: systemRow.id,
            name: body.name,
            kind: body.kind as Planet["kind"],
            ...(body.parentPlanetId ? { parentPlanetId: body.parentPlanetId } : {}),
            type: body.type as PlanetType,
            habitability: body.habitability,
            slots: body.slots,
            deposits: JSON.parse(body.deposits),
            orbitRadius: body.orbitRadius,
            orbitAngle: body.orbitAngle,
          }));
        const belts: AsteroidBelt[] = (beltsBySystem.get(systemRow.id) ?? [])
          .sort((a, b) => a.beltIndex - b.beltIndex)
          .map((belt) => ({
            id: belt.id,
            systemId: systemRow.id,
            name: belt.name,
            orbitRadius: belt.orbitRadius,
            deposits: JSON.parse(belt.deposits),
          }));
        const stationRow = stationBySystem.get(systemRow.id);
        const station: TradeStation | undefined = stationRow
          ? {
              id: stationRow.id,
              systemId: systemRow.id,
              factionId: stationRow.factionId,
              name: stationRow.name,
            }
          : undefined;
        return {
          id: systemRow.id,
          name: systemRow.name,
          x: systemRow.x,
          y: systemRow.y,
          planets,
          belts,
          ...(station ? { station } : {}),
        };
      });
    return {
      id: galaxyRow.id,
      name: galaxyRow.name,
      x: galaxyRow.x,
      y: galaxyRow.y,
      systems,
      links: (linksByGalaxy.get(galaxyRow.id) ?? [])
        .sort((a, b) => a.linkIndex - b.linkIndex)
        .map((l) => [l.aSystemId, l.bSystemId] as [string, string]),
      anchorSystemId: galaxyRow.anchorSystemId,
      depositBonus: galaxyRow.depositBonus,
      parentIndex: galaxyRow.parentGalaxyIndex,
    };
  });

  return { seed, galaxies };
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}
