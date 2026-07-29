import {
  upsertBuildingSchema,
  upsertConstantSchema,
  upsertFactionSchema,
  upsertShipSchema,
  upsertWarshipSchema,
} from "@spacesim/protocol";
import { BUILDING_IDS, DEFAULT_BALANCE, type BuildingId } from "@spacesim/shared";
import type { FastifyInstance } from "fastify";
import { recordAuditEntry } from "../../../admin/audit-service.js";
import type { GameEngine } from "../../../game.js";
import { ContentRepository } from "../../../runtime/content/content-repository.js";
import type {
  ContentBuilding,
  ContentConstant,
  ContentFaction,
  ContentShip,
  ContentWarship,
} from "../../../runtime/content/content-types.js";

const repo = new ContentRepository();

/**
 * Routes `/api/admin/content/*` (chantier 23.5+) : un domaine à la fois, en commençant
 * par les vaisseaux de guerre. `admin.put(".../<domaine>/:id")` fait office de
 * create-ou-update (upsert) : pas de `POST` séparé, l'id est choisi par l'admin (une
 * chaîne lisible, pas un UUID serveur) — permet de créer une entrée neuve sans mécanique
 * dédiée (chantier 23, « conséquence assumée » de la décision 1).
 */
export function registerContentRoutes(admin: FastifyInstance, engine: GameEngine): void {
  admin.get("/content/warships", { config: { adminAction: "content.warships.read" } }, () => ({
    warships: Object.values(engine.content.warships),
  }));

  // Réglages de combat au-delà des stats par vaisseau (chantier 23.5) : exposé en
  // lecture pour l'instant, l'édition (matrice de triangle + directives) reste hors
  // périmètre de ce sous-chantier — voir docs/design.md.
  admin.get(
    "/content/combat-tuning",
    { config: { adminAction: "content.warships.read" } },
    () => engine.content.combatTuning,
  );

  admin.put(
    "/content/warships/:id",
    { config: { adminAction: "content.warships.write" } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = upsertWarshipSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: parsed.error.issues[0]?.message ?? "Requête invalide" });
      }
      const isNew = !(id in engine.content.warships);
      const warship: ContentWarship = { id, ...parsed.data };
      await repo.saveWarship(warship);
      await engine.loadContent();

      const actor = request.adminAccount!;
      await recordAuditEntry({
        actorAccountId: actor.id,
        actorEmail: actor.email,
        action: "content.warships.write",
        targetType: "content_warship",
        targetId: id,
        reason: isNew ? "création" : "modification",
      });
      return { warships: Object.values(engine.content.warships) };
    },
  );

  // Factions (chantier 23.6) : même recette que les vaisseaux de guerre.
  admin.get("/content/factions", { config: { adminAction: "content.factions.read" } }, () => ({
    factions: Object.values(engine.content.factions),
  }));

  admin.put(
    "/content/factions/:id",
    { config: { adminAction: "content.factions.write" } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = upsertFactionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: parsed.error.issues[0]?.message ?? "Requête invalide" });
      }
      const isNew = !(id in engine.content.factions);
      const faction: ContentFaction = { id, ...parsed.data };
      await repo.saveFaction(faction);
      await engine.loadContent();

      const actor = request.adminAccount!;
      await recordAuditEntry({
        actorAccountId: actor.id,
        actorEmail: actor.email,
        action: "content.factions.write",
        targetType: "content_faction",
        targetId: id,
        reason: isNew ? "création" : "modification",
      });
      return { factions: Object.values(engine.content.factions) };
    },
  );

  // Bâtiments (chantier 23.7) : même recette, sauf l'id — `BUILDING_IDS` reste un tuple
  // fermé pour cette passe (voir packages/protocol/src/content.ts), la route refuse donc
  // un id qui n'en fait pas partie plutôt que de créer une entrée inutilisable en jeu.
  admin.get("/content/buildings", { config: { adminAction: "content.buildings.read" } }, () => ({
    buildings: Object.values(engine.content.buildings),
  }));

  admin.put(
    "/content/buildings/:id",
    { config: { adminAction: "content.buildings.write" } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!(BUILDING_IDS as readonly string[]).includes(id)) {
        return reply.code(400).send({
          error: "Id de bâtiment inconnu — la création n'est pas prise en charge pour ce domaine",
        });
      }
      const parsed = upsertBuildingSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: parsed.error.issues[0]?.message ?? "Requête invalide" });
      }
      const building: ContentBuilding = { id: id as BuildingId, ...parsed.data };
      await repo.saveBuilding(building);
      await engine.loadContent();

      const actor = request.adminAccount!;
      await recordAuditEntry({
        actorAccountId: actor.id,
        actorEmail: actor.email,
        action: "content.buildings.write",
        targetType: "content_building",
        targetId: id,
        reason: "modification",
      });
      return { buildings: Object.values(engine.content.buildings) };
    },
  );

  // Vaisseaux civils historiques (chantier 23.8) : même recette que les vaisseaux de
  // guerre/factions (id libre, id-minting).
  admin.get("/content/ships", { config: { adminAction: "content.ships.read" } }, () => ({
    ships: Object.values(engine.content.ships),
  }));

  admin.put(
    "/content/ships/:id",
    { config: { adminAction: "content.ships.write" } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = upsertShipSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: parsed.error.issues[0]?.message ?? "Requête invalide" });
      }
      const isNew = !(id in engine.content.ships);
      const ship: ContentShip = { id, ...parsed.data };
      await repo.saveShip(ship);
      await engine.loadContent();

      const actor = request.adminAccount!;
      await recordAuditEntry({
        actorAccountId: actor.id,
        actorEmail: actor.email,
        action: "content.ships.write",
        targetType: "content_ship",
        targetId: id,
        reason: isNew ? "création" : "modification",
      });
      return { ships: Object.values(engine.content.ships) };
    },
  );

  // Constantes d'équilibrage (chantier 23.8) : même recette que les bâtiments — la clé
  // doit être un des champs de BalanceConstants, pas un id libre (pas d'id-minting).
  admin.get("/content/constants", { config: { adminAction: "content.constants.read" } }, () => ({
    constants: Object.values(engine.content.constants),
  }));

  admin.put(
    "/content/constants/:key",
    { config: { adminAction: "content.constants.write" } },
    async (request, reply) => {
      const { key } = request.params as { key: string };
      if (!(key in DEFAULT_BALANCE)) {
        return reply.code(400).send({
          error:
            "Clé de constante inconnue — la création n'est pas prise en charge pour ce domaine",
        });
      }
      const parsed = upsertConstantSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: parsed.error.issues[0]?.message ?? "Requête invalide" });
      }
      const constant: ContentConstant = { key, ...parsed.data };
      await repo.saveConstant(constant);
      await engine.loadContent();

      const actor = request.adminAccount!;
      await recordAuditEntry({
        actorAccountId: actor.id,
        actorEmail: actor.email,
        action: "content.constants.write",
        targetType: "content_constant",
        targetId: key,
        reason: "modification",
      });
      return { constants: Object.values(engine.content.constants) };
    },
  );
}
