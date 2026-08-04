import type {
  FastifyBaseLogger,
  FastifyInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

/** Instance Fastify typée Zod (chantier 27.8) — le type de retour de
 *  `app.withTypeProvider<ZodTypeProvider>()`, à passer aux fonctions qui enregistrent
 *  des routes avec un schéma `params`/`querystring`/`body` pour garder l'inférence. */
export type ZodFastifyInstance = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  FastifyBaseLogger,
  ZodTypeProvider
>;
