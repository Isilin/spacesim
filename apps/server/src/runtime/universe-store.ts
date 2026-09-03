import {
  computeGalaxyParentIndex,
  GENERATOR_VERSION,
  galaxyIndexOfId,
  type AsteroidBelt,
  type Galaxy,
  type Planet,
  type PlanetType,
  type StarSystem,
  type TradingPost,
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

/**
 * Lignes par requête d'insertion (chantier 37).
 *
 * Une galaxie s'insérait en une requête par table. À 14 systèmes, cela faisait quelques
 * centaines de lignes ; à 520, plus de trois mille corps, et le protocole Postgres n'encode
 * qu'un nombre de paramètres sur seize bits — la requête ne remonte pas une erreur lisible
 * mais un `RangeError: Invalid array length` depuis le parseur du protocole.
 *
 * Cinq cents lignes tiennent très en deçà de la limite pour la table la plus large
 * (`universe_bodies`, quatorze colonnes) sans multiplier les allers-retours. Le lot reste
 * dans la MÊME transaction : une galaxie s'écrit toujours en entier ou pas du tout.
 */
const INSERT_CHUNK = 500;

/** Insère `rows` par lots, dans la transaction courante. */
// `any` assumé : table et transaction dynamiques, comme dans `persister.ts`.
async function insertChunked(
  tx: any,
  table: unknown,
  rows: readonly unknown[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    await tx.insert(table).values(rows.slice(i, i + INSERT_CHUNK));
  }
}

/** Lignes à écrire pour une galaxie (partagées entre les deux chemins d'écriture ci-dessous). */
function galaxyRows(galaxy: Galaxy, gameId: string, now: number) {
  const index = galaxyIndexOfId(galaxy.id);
  if (index > 0 && galaxy.parentIndex === undefined) {
    throw new Error(
      `Galaxie ${galaxy.id} sans parentIndex figé — voir withParentIndexes()`,
    );
  }
  return {
    galaxy: {
      id: galaxy.id,
      gameId,
      index,
      name: galaxy.name,
      x: galaxy.x,
      y: galaxy.y,
      z: galaxy.z,
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
      z: system.z,
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
        inclination: body.inclination,
        ascendingNode: body.ascendingNode,
      })),
    ),
    belts: galaxy.systems.flatMap((system) =>
      system.belts.map((belt, beltIndex) => ({
        id: belt.id,
        systemId: system.id,
        beltIndex,
        name: belt.name,
        orbitRadius: belt.orbitRadius,
        inclination: belt.inclination,
        ascendingNode: belt.ascendingNode,
        deposits: JSON.stringify(belt.deposits),
      })),
    ),
    comptoirs: galaxy.systems.flatMap((system) =>
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
 * SEUL chemin d'écriture des galaxies depuis le chantier 37.15, boot comme extension en
 * cours de partie. Il existait un jumeau, `stageGalaxies`, qui passait par le `WriteSet`
 * pour rester synchrone dans le tick : le `Persister` écrivant ligne à ligne, une
 * extension de frontière y coûtait 21,5 s de serveur bloqué. `growUniverse` lance
 * désormais cette transaction sans l'attendre et la publie comme barrière de flush.
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
      await insertChunked(tx, schema.universeSystems, rows.systems);
      await insertChunked(tx, schema.universeBodies, rows.bodies);
      await insertChunked(tx, schema.universeBelts, rows.belts);
      await insertChunked(tx, schema.universeTradingPosts, rows.comptoirs);
      await insertChunked(tx, schema.universeLinks, rows.links);
    }
    await tx
      .update(schema.games)
      .set({ galaxyCount })
      .where(eq(schema.games.id, gameId));
  });
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
export async function loadUniverse(
  gameId: string,
  seed: string,
): Promise<Universe | null> {
  const galaxyRowsDb = (
    await db
      .select()
      .from(schema.universeGalaxies)
      .where(eq(schema.universeGalaxies.gameId, gameId))
  ).sort((a, b) => a.index - b.index);
  if (galaxyRowsDb.length === 0) return null;

  const [systemRows, bodyRows, beltRows, tradingPostRows, linkRows] =
    await Promise.all([
      db.select().from(schema.universeSystems),
      db.select().from(schema.universeBodies),
      db.select().from(schema.universeBelts),
      db.select().from(schema.universeTradingPosts),
      db.select().from(schema.universeLinks),
    ]);

  const bodiesBySystem = groupBy(bodyRows, (r) => r.systemId);
  const beltsBySystem = groupBy(beltRows, (r) => r.systemId);
  const tradingPostBySystem = new Map(
    tradingPostRows.map((r) => [r.systemId, r]),
  );
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
            ...(body.parentPlanetId
              ? { parentPlanetId: body.parentPlanetId }
              : {}),
            type: body.type as PlanetType,
            habitability: body.habitability,
            slots: body.slots,
            deposits: JSON.parse(body.deposits),
            orbitRadius: body.orbitRadius,
            orbitAngle: body.orbitAngle,
            inclination: body.inclination,
            ascendingNode: body.ascendingNode,
          }));
        const belts: AsteroidBelt[] = (beltsBySystem.get(systemRow.id) ?? [])
          .sort((a, b) => a.beltIndex - b.beltIndex)
          .map((belt) => ({
            id: belt.id,
            systemId: systemRow.id,
            name: belt.name,
            orbitRadius: belt.orbitRadius,
            inclination: belt.inclination,
            ascendingNode: belt.ascendingNode,
            deposits: JSON.parse(belt.deposits),
          }));
        const tradingPostRow = tradingPostBySystem.get(systemRow.id);
        const comptoir: TradingPost | undefined = tradingPostRow
          ? {
              id: tradingPostRow.id,
              systemId: systemRow.id,
              factionId: tradingPostRow.factionId,
              name: tradingPostRow.name,
            }
          : undefined;
        return {
          id: systemRow.id,
          name: systemRow.name,
          x: systemRow.x,
          y: systemRow.y,
          z: systemRow.z,
          planets,
          belts,
          ...(comptoir ? { station: comptoir } : {}),
        };
      });
    return {
      id: galaxyRow.id,
      name: galaxyRow.name,
      x: galaxyRow.x,
      y: galaxyRow.y,
      z: galaxyRow.z,
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
