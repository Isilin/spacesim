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
import { db, schema, withTransaction } from "../db/index.js";
import type { WriteSet } from "./persistence/write-set.js";

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

/** Lignes à écrire pour une galaxie (partagées entre les deux chemins d'écriture ci-dessous). */
function galaxyRows(galaxy: Galaxy, gameId: string, now: number) {
  const index = galaxyIndexOfId(galaxy.id);
  if (index > 0 && galaxy.parentIndex === undefined) {
    throw new Error(`Galaxie ${galaxy.id} sans parentIndex figé — voir withParentIndexes()`);
  }
  return {
    galaxy: {
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
    },
    systems: galaxy.systems.map((system, systemIndex) => ({
      id: system.id,
      galaxyId: galaxy.id,
      systemIndex,
      name: system.name,
      x: system.x,
      y: system.y,
    })),
    bodies: galaxy.systems.flatMap((system) =>
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
    ),
    belts: galaxy.systems.flatMap((system) =>
      system.belts.map((belt, beltIndex) => ({
        id: belt.id,
        systemId: system.id,
        beltIndex,
        name: belt.name,
        orbitRadius: belt.orbitRadius,
        deposits: JSON.stringify(belt.deposits),
      })),
    ),
    stations: galaxy.systems.flatMap((system) =>
      system.station
        ? [
            {
              id: system.station.id,
              systemId: system.id,
              factionId: system.station.factionId,
              name: system.station.name,
            },
          ]
        : [],
    ),
    links: galaxy.links.map(([aSystemId, bSystemId], linkIndex) => ({
      galaxyId: galaxy.id,
      aSystemId,
      bSystemId,
      linkIndex,
    })),
  };
}

/**
 * Matérialise en UNE transaction les galaxies encore absentes de la base et aligne
 * `games.galaxyCount`. Idempotent : une galaxie déjà en base est ignorée (jamais
 * réécrite). Les `Galaxy` passées doivent porter `parentIndex` (voir
 * `withParentIndexes`) — l'arbre inter-galactique se fige ici.
 *
 * Chemin BOOT SEULEMENT (`GameEngine.load()`/`bootstrapNewUniverse()`) : appelé
 * avant que `GameRuntime`/`WriteSet` n'existent, donc écriture DIRECTE — voir
 * `stageGalaxies` pour le chemin tick (`growUniverse`), qui lui passe par le
 * `WriteSet` pour rester synchrone.
 */
export async function appendGalaxies(
  gameId: string,
  galaxies: readonly Galaxy[],
  galaxyCount: number,
): Promise<void> {
  const now = Date.now();
  await withTransaction(async (tx) => {
    for (const galaxy of galaxies) {
      const exists = await tx
        .select({ id: schema.universeGalaxies.id })
        .from(schema.universeGalaxies)
        .where(eq(schema.universeGalaxies.id, galaxy.id))
        .limit(1);
      if (exists.length > 0) continue;

      const rows = galaxyRows(galaxy, gameId, now);
      await tx.insert(schema.universeGalaxies).values(rows.galaxy);
      await tx.insert(schema.universeSystems).values(rows.systems);
      if (rows.bodies.length > 0) await tx.insert(schema.universeBodies).values(rows.bodies);
      if (rows.belts.length > 0) await tx.insert(schema.universeBelts).values(rows.belts);
      if (rows.stations.length > 0) await tx.insert(schema.universeStations).values(rows.stations);
      if (rows.links.length > 0) await tx.insert(schema.universeLinks).values(rows.links);
    }
    await tx.update(schema.games).set({ galaxyCount }).where(eq(schema.games.id, gameId));
  });
}

/**
 * Équivalent tick-path de `appendGalaxies` : stage les galaxies neuves dans le
 * `WriteSet` au lieu d'une transaction directe — `growUniverse()` (appelé depuis
 * `TickRunner.run()`, synchrone) ne peut pas `await` une requête Postgres. Ne touche
 * PAS `games.galaxyCount` : `TickRunner.run()` le persiste déjà à chaque lot via
 * `GameRepository.saveTick`, qui s'exécute après `ensureFrontier()` dans le même tick.
 * Pas de vérification d'existence : le seul appelant (`growUniverse`) ne passe jamais
 * que des galaxies au-delà de ce que la RAM (chargée depuis la DB au boot) connaît déjà
 * — un doublon serait de toute façon un upsert inoffensif (contenu déterministe par seed).
 */
export function stageGalaxies(
  writeSet: WriteSet,
  gameId: string,
  galaxies: readonly Galaxy[],
): void {
  const now = Date.now();
  for (const galaxy of galaxies) {
    const rows = galaxyRows(galaxy, gameId, now);
    writeSet.upsert("universeGalaxies", rows.galaxy.id, rows.galaxy);
    for (const system of rows.systems) writeSet.upsert("universeSystems", system.id, system);
    for (const body of rows.bodies) writeSet.upsert("universeBodies", body.id, body);
    for (const belt of rows.belts) writeSet.upsert("universeBelts", belt.id, belt);
    for (const station of rows.stations) writeSet.upsert("universeStations", station.id, station);
    for (const link of rows.links) {
      writeSet.upsert("universeLinks", [link.aSystemId, link.bSystemId], link);
    }
  }
}

/** Nombre de galaxies matérialisées pour cet univers. */
export async function materializedGalaxyCount(gameId: string): Promise<number> {
  const rows = await db
    .select({ id: schema.universeGalaxies.id })
    .from(schema.universeGalaxies)
    .where(eq(schema.universeGalaxies.gameId, gameId));
  return rows.length;
}

/**
 * Reconstruit l'univers depuis les tables (ordre garanti par les colonnes `*_index`).
 * Renvoie `null` si aucune galaxie n'est matérialisée.
 */
export async function loadUniverse(gameId: string, seed: string): Promise<Universe | null> {
  const galaxyRowsDb = (
    await db
      .select()
      .from(schema.universeGalaxies)
      .where(eq(schema.universeGalaxies.gameId, gameId))
  ).sort((a, b) => a.index - b.index);
  if (galaxyRowsDb.length === 0) return null;

  const [systemRows, bodyRows, beltRows, stationRows, linkRows] = await Promise.all([
    db.select().from(schema.universeSystems),
    db.select().from(schema.universeBodies),
    db.select().from(schema.universeBelts),
    db.select().from(schema.universeStations),
    db.select().from(schema.universeLinks),
  ]);

  const bodiesBySystem = groupBy(bodyRows, (r) => r.systemId);
  const beltsBySystem = groupBy(beltRows, (r) => r.systemId);
  const stationBySystem = new Map(stationRows.map((r) => [r.systemId, r]));
  const systemsByGalaxy = groupBy(systemRows, (r) => r.galaxyId);
  const linksByGalaxy = groupBy(linkRows, (r) => r.galaxyId);

  const galaxies: Galaxy[] = galaxyRowsDb.map((galaxyRow) => {
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
