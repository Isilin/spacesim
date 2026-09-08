import { astroOverridesResponseSchema } from "@spacesim/protocol";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { GameEngine } from "../../game.js";
import type { ZodFastifyInstance } from "../zod-fastify.js";

/**
 * Publication du contenu astronomique au client joueur (chantier 45.4).
 *
 * ## La dette que cette route solde
 *
 * `docs/design.md` la consignait depuis le chantier 31.22 : « `apps/web` ne voit pas
 * l'apparence éditée — le client lit le contenu statique de `packages/shared` et le protocole
 * ne transporte aucune définition de contenu ». Une couleur changée en admin restait
 * invisible sur la carte, et les replis génériques que l'ADR 0007 rend obligatoires ne
 * servaient à rien puisque aucun identifiant inconnu ne pouvait arriver.
 *
 * ## Pourquoi une route HTTP et pas le message `hello`
 *
 * `universe.payload.test.ts` mesure et plafonne la charge utile de la connexion, et le
 * chantier 37 a passé un palier entier à la faire tenir. Le contenu astronomique n'a rien à y
 * faire : il ne change pas d'un joueur à l'autre, ne dépend pas du brouillard, et se met en
 * cache. Une route à part le rend cachable par le navigateur et laisse la connexion mesurée
 * telle qu'elle est.
 *
 * ## Pourquoi seulement les surcharges
 *
 * Les définitions intégrées vivent déjà dans le paquet du navigateur — `packages/shared` est
 * importé par `apps/web`. Publier les catalogues entiers dupliquerait des dizaines de
 * kilo-octets pour, la plupart du temps, redire mot pour mot ce que le client a déjà. La
 * route ne transporte donc que le correctif, souvent vide.
 *
 * Pas d'authentification : c'est du contenu de jeu, visible de toute façon en jouant, et le
 * client en a besoin avant même de se connecter pour rendre l'écran de sélection.
 */
export function registerContentRoutes(
  app: FastifyInstance,
  engine: GameEngine,
): void {
  const typed: ZodFastifyInstance = app.withTypeProvider<ZodTypeProvider>();
  typed.get(
    "/api/content/astro",
    { schema: { response: { 200: astroOverridesResponseSchema } } },
    (_request, reply) => {
      // Court, et volontairement : une édition d'admin doit se voir au rechargement suivant,
      // pas le lendemain. `max-age` couvre la rafale de requêtes d'un chargement de page,
      // rien de plus.
      reply.header("cache-control", "public, max-age=60");
      return { astro: engine.content.astro };
    },
  );
}
