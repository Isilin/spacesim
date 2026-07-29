import { upsertWarshipSchema } from "@spacesim/protocol";
import type { FastifyInstance } from "fastify";
import { recordAuditEntry } from "../../../admin/audit-service.js";
import type { GameEngine } from "../../../game.js";
import { ContentRepository } from "../../../runtime/content/content-repository.js";
import type { ContentWarship } from "../../../runtime/content/content-types.js";

const repo = new ContentRepository();

/**
 * Routes `/api/admin/content/*` (chantier 23.5) : premier domaine du CMS de contenu —
 * vaisseaux de guerre, domaine pilote. `admin.put(".../warships/:id")` fait office de
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
}
