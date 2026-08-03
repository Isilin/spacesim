import {
  upsertBuildingSchema,
  upsertChassisSchema,
  upsertConstantSchema,
  upsertFactionSchema,
  upsertInstallationSchema,
  upsertMilestoneSchema,
  upsertModuleSchema,
  upsertPresetSchema,
  upsertShipSchema,
  upsertTechSchema,
  upsertWarshipSchema,
  upsertZoneTypeSchema,
} from "@spacesim/protocol";
import {
  BUILDING_IDS,
  DEFAULT_BALANCE,
  validateTree,
  type BuildingId,
} from "@spacesim/shared";
import type { FastifyInstance } from "fastify";
import { recordAuditEntry } from "../../../admin/audit-service.js";
import type { GameEngine } from "../../../game.js";
import { ContentRepository } from "../../../runtime/content/content-repository.js";
import { techDefsFromContent } from "../../../runtime/content/content-service.js";
import type {
  ContentBuilding,
  ContentChassis,
  ContentConstant,
  ContentFaction,
  ContentInstallation,
  ContentMilestone,
  ContentModule,
  ContentPreset,
  ContentShip,
  ContentTech,
  ContentWarship,
  ContentZoneType,
} from "../../../runtime/content/content-types.js";

const repo = new ContentRepository();

/**
 * Routes `/api/admin/content/*` (chantier 23.5+) : un domaine à la fois, en commençant
 * par les vaisseaux de guerre. `admin.put(".../<domaine>/:id")` fait office de
 * create-ou-update (upsert) : pas de `POST` séparé, l'id est choisi par l'admin (une
 * chaîne lisible, pas un UUID serveur) — permet de créer une entrée neuve sans mécanique
 * dédiée (chantier 23, « conséquence assumée » de la décision 1).
 */
export function registerContentRoutes(
  admin: FastifyInstance,
  engine: GameEngine,
): void {
  admin.get(
    "/content/warships",
    { config: { adminAction: "content.warships.read" } },
    () => ({
      warships: Object.values(engine.content.warships),
    }),
  );

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
          .send({
            error: parsed.error.issues[0]?.message ?? "Requête invalide",
          });
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
  admin.get(
    "/content/factions",
    { config: { adminAction: "content.factions.read" } },
    () => ({
      factions: Object.values(engine.content.factions),
    }),
  );

  admin.put(
    "/content/factions/:id",
    { config: { adminAction: "content.factions.write" } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = upsertFactionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({
            error: parsed.error.issues[0]?.message ?? "Requête invalide",
          });
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
  admin.get(
    "/content/buildings",
    { config: { adminAction: "content.buildings.read" } },
    () => ({
      buildings: Object.values(engine.content.buildings),
    }),
  );

  admin.put(
    "/content/buildings/:id",
    { config: { adminAction: "content.buildings.write" } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!(BUILDING_IDS as readonly string[]).includes(id)) {
        return reply.code(400).send({
          error:
            "Id de bâtiment inconnu — la création n'est pas prise en charge pour ce domaine",
        });
      }
      const parsed = upsertBuildingSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({
            error: parsed.error.issues[0]?.message ?? "Requête invalide",
          });
      }
      const building: ContentBuilding = {
        id: id as BuildingId,
        ...parsed.data,
      };
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
  admin.get(
    "/content/ships",
    { config: { adminAction: "content.ships.read" } },
    () => ({
      ships: Object.values(engine.content.ships),
    }),
  );

  admin.put(
    "/content/ships/:id",
    { config: { adminAction: "content.ships.write" } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = upsertShipSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({
            error: parsed.error.issues[0]?.message ?? "Requête invalide",
          });
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
  admin.get(
    "/content/constants",
    { config: { adminAction: "content.constants.read" } },
    () => ({
      constants: Object.values(engine.content.constants),
    }),
  );

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
          .send({
            error: parsed.error.issues[0]?.message ?? "Requête invalide",
          });
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

  // Arbre de recherche (chantier 23.9) : id libre (id-minting), mais chaque écriture
  // rejoue `validateTree` sur la table candidate (prérequis inconnus, cycles) — le même
  // garde-fou que le contrôle d'intégrité en CI, appliqué ici à l'admin en direct.
  admin.get(
    "/content/techs",
    { config: { adminAction: "content.techs.read" } },
    () => ({
      techs: Object.values(engine.content.techs),
    }),
  );

  admin.put(
    "/content/techs/:id",
    { config: { adminAction: "content.techs.write" } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = upsertTechSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({
            error: parsed.error.issues[0]?.message ?? "Requête invalide",
          });
      }
      const isNew = !(id in engine.content.techs);
      const tech: ContentTech = { id, ...parsed.data };
      const candidate = { ...engine.content.techs, [id]: tech };
      const problems = validateTree(techDefsFromContent(candidate));
      if (problems.length > 0) {
        return reply.code(400).send({ error: problems[0] });
      }
      await repo.saveTech(tech);
      await engine.loadContent();

      const actor = request.adminAccount!;
      await recordAuditEntry({
        actorAccountId: actor.id,
        actorEmail: actor.email,
        action: "content.techs.write",
        targetType: "content_tech",
        targetId: id,
        reason: isNew ? "création" : "modification",
      });
      return { techs: Object.values(engine.content.techs) };
    },
  );

  // Châssis + modules (chantier 23.10) : id libre (id-minting), même recette que les
  // vaisseaux/techs. Domaine le plus risqué de la vague — `sim/industry/design.ts`
  // n'avait aucune injection avant ce chantier.
  admin.get(
    "/content/chassis",
    { config: { adminAction: "content.chassis.read" } },
    () => ({
      chassis: Object.values(engine.content.chassis),
    }),
  );

  admin.put(
    "/content/chassis/:id",
    { config: { adminAction: "content.chassis.write" } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = upsertChassisSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({
            error: parsed.error.issues[0]?.message ?? "Requête invalide",
          });
      }
      const isNew = !(id in engine.content.chassis);
      const chassis: ContentChassis = { id, ...parsed.data };
      await repo.saveChassis(chassis);
      await engine.loadContent();

      const actor = request.adminAccount!;
      await recordAuditEntry({
        actorAccountId: actor.id,
        actorEmail: actor.email,
        action: "content.chassis.write",
        targetType: "content_chassis",
        targetId: id,
        reason: isNew ? "création" : "modification",
      });
      return { chassis: Object.values(engine.content.chassis) };
    },
  );

  admin.get(
    "/content/modules",
    { config: { adminAction: "content.modules.read" } },
    () => ({
      modules: Object.values(engine.content.modules),
    }),
  );

  admin.put(
    "/content/modules/:id",
    { config: { adminAction: "content.modules.write" } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = upsertModuleSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({
            error: parsed.error.issues[0]?.message ?? "Requête invalide",
          });
      }
      const isNew = !(id in engine.content.modules);
      const module: ContentModule = { id, ...parsed.data };
      await repo.saveModule(module);
      await engine.loadContent();

      const actor = request.adminAccount!;
      await recordAuditEntry({
        actorAccountId: actor.id,
        actorEmail: actor.email,
        action: "content.modules.write",
        targetType: "content_module",
        targetId: id,
        reason: isNew ? "création" : "modification",
      });
      return { modules: Object.values(engine.content.modules) };
    },
  );

  // Presets (chantier 23.11) : id libre, un preset n'est qu'un couple châssis/modules déjà
  // validé par les tables injectables de 23.10 — pas de garde-fou dédié à rejouer ici.
  admin.get(
    "/content/presets",
    { config: { adminAction: "content.presets.read" } },
    () => ({
      presets: Object.values(engine.content.presets),
    }),
  );

  admin.put(
    "/content/presets/:id",
    { config: { adminAction: "content.presets.write" } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = upsertPresetSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({
            error: parsed.error.issues[0]?.message ?? "Requête invalide",
          });
      }
      const isNew = !(id in engine.content.presets);
      const preset: ContentPreset = { id, ...parsed.data };
      await repo.savePreset(preset);
      await engine.loadContent();

      const actor = request.adminAccount!;
      await recordAuditEntry({
        actorAccountId: actor.id,
        actorEmail: actor.email,
        action: "content.presets.write",
        targetType: "content_preset",
        targetId: id,
        reason: isNew ? "création" : "modification",
      });
      return { presets: Object.values(engine.content.presets) };
    },
  );

  // Jalons (chantier 23.11) : id libre, mais `metric` reste un enum fermé (voir
  // packages/protocol/src/content.ts) — dernier domaine de la première vague de contenu.
  admin.get(
    "/content/milestones",
    { config: { adminAction: "content.milestones.read" } },
    () => ({
      milestones: Object.values(engine.content.milestones),
    }),
  );

  admin.put(
    "/content/milestones/:id",
    { config: { adminAction: "content.milestones.write" } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = upsertMilestoneSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({
            error: parsed.error.issues[0]?.message ?? "Requête invalide",
          });
      }
      const isNew = !(id in engine.content.milestones);
      const milestone: ContentMilestone = { id, ...parsed.data };
      await repo.saveMilestone(milestone);
      await engine.loadContent();

      const actor = request.adminAccount!;
      await recordAuditEntry({
        actorAccountId: actor.id,
        actorEmail: actor.email,
        action: "content.milestones.write",
        targetType: "content_milestone",
        targetId: id,
        reason: isNew ? "création" : "modification",
      });
      return { milestones: Object.values(engine.content.milestones) };
    },
  );

  // Types de zone de station orbitale (chantier 24.7) : id libre, même recette que
  // châssis/modules.
  admin.get(
    "/content/zone-types",
    { config: { adminAction: "content.zoneTypes.read" } },
    () => ({
      zoneTypes: Object.values(engine.content.zoneTypes),
    }),
  );

  admin.put(
    "/content/zone-types/:id",
    { config: { adminAction: "content.zoneTypes.write" } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = upsertZoneTypeSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({
            error: parsed.error.issues[0]?.message ?? "Requête invalide",
          });
      }
      const isNew = !(id in engine.content.zoneTypes);
      const zoneType: ContentZoneType = { id, ...parsed.data };
      await repo.saveZoneType(zoneType);
      await engine.loadContent();

      const actor = request.adminAccount!;
      await recordAuditEntry({
        actorAccountId: actor.id,
        actorEmail: actor.email,
        action: "content.zoneTypes.write",
        targetType: "content_zone_type",
        targetId: id,
        reason: isNew ? "création" : "modification",
      });
      return { zoneTypes: Object.values(engine.content.zoneTypes) };
    },
  );

  // Installations de station orbitale (chantier 24.7) : id libre, `zoneType` référence
  // un type de zone par son id, non vérifié contre `content.zoneTypes` ici (même choix
  // que `unlockBuildings` sur les techs — une faute de frappe ne débloquerait simplement
  // rien de reconnu, sans casser l'écriture).
  admin.get(
    "/content/installations",
    { config: { adminAction: "content.installations.read" } },
    () => ({ installations: Object.values(engine.content.installations) }),
  );

  admin.put(
    "/content/installations/:id",
    { config: { adminAction: "content.installations.write" } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = upsertInstallationSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({
            error: parsed.error.issues[0]?.message ?? "Requête invalide",
          });
      }
      const isNew = !(id in engine.content.installations);
      const installation: ContentInstallation = { id, ...parsed.data };
      await repo.saveInstallation(installation);
      await engine.loadContent();

      const actor = request.adminAccount!;
      await recordAuditEntry({
        actorAccountId: actor.id,
        actorEmail: actor.email,
        action: "content.installations.write",
        targetType: "content_installation",
        targetId: id,
        reason: isNew ? "création" : "modification",
      });
      return { installations: Object.values(engine.content.installations) };
    },
  );
}
