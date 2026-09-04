import { schema } from "../../db/index.js";

type SchemaKey = keyof typeof schema;

/**
 * Colonnes de clé (naturelle ou primaire) par table, dans l'ORDRE attendu des valeurs
 * `pk` du `WriteSet`. Sert à construire le `WHERE` du flush (update-ou-insert) — pas
 * besoin d'index UNIQUE déclaré en base (ex. `relations` n'en a pas) puisqu'on ne
 * s'appuie pas sur `ON CONFLICT`, voir `applyUpsert`.
 *
 * Ce registre vit dans son propre module pour une raison de sûreté, pas de rangement :
 * `WriteSet` type son paramètre `table` sur ses clés (`PersistedTable`), si bien qu'une
 * table écrite par un repository sans être enregistrée ici ne compile plus. Elle
 * compilait avant, et le prix était élevé — voir plus bas.
 *
 * Une table ABSENTE de ce registre empoisonne le tampon d'écritures pour de bon :
 * `tableFor` lève, la transaction entière fait rollback, et `runFlush` remet TOUTES les
 * entrées drainées en attente — y compris celle qui lève. Le flush suivant rejoue le
 * même lot et échoue pareil. La RAM faisant autorité (ADR 0003), le jeu continue de
 * tourner juste : plus rien n'atteint Postgres, et cela ne se voit qu'au redémarrage
 * suivant. `corpRelations` et `standings` (chantier 32.19) ont vécu dans cet état.
 */
export const PRIMARY_KEYS = {
  games: ["id"],
  colonies: ["id"],
  stations: ["id"],
  relations: ["empireA", "empireB"],
  relationProposals: ["id"],
  objectives: ["id"],
  empireEvents: ["id"],
  corporations: ["id"],
  corporationMembers: ["empireId"],
  corporationInvites: ["id"],
  corpRelations: ["corpA", "corpB"],
  standings: ["corporationId", "targetId"],
  marketOrders: ["id"],
  stationHoldings: ["stationId", "empireId"],
  chatMessages: ["id"],
  mails: ["id"],
  worldEvents: ["id"],
  factionStates: ["factionId"],
  blueprints: ["id"],
  transfers: ["id"],
  missions: ["id"],
  routes: ["id"],
  outposts: ["id"],
  tradingPostStates: ["tradingPostId"],
  gateways: ["galaxyId"],
  claims: ["systemId"],
  fleets: ["id"],
  pirateLairs: ["id"],
  battles: ["id"],
  players: ["id"],
  contracts: ["id"],
  universeGalaxies: ["id"],
  universeSystems: ["id"],
  universeBodies: ["id"],
  universeBelts: ["id"],
  universeTradingPosts: ["id"],
  universeLinks: ["aSystemId", "bSystemId"],
} as const satisfies Partial<Record<SchemaKey, readonly string[]>>;

/** Les seules tables qu'un repository peut écrire via le `WriteSet`. */
export type PersistedTable = keyof typeof PRIMARY_KEYS;
