import { MAX_CATCHUP_TICKS, TICK_MS } from "@spacesim/shared";
import { bench, beforeAll, describe } from "vitest";
import { db, schema } from "../db/index.js";
import { GameEngine } from "../game.js";

/**
 * Mesure le risque réel identifié en 27.6 : le rattrapage synchrone au boot
 * (`GameEngine.catchUp()`, appelé une fois depuis `runtime/boot.ts`), pas le régime
 * stationnaire (couvert par 27.7). `devFastForward` recule `lastTickAt` d'un delta FIXE puis
 * rejoue exactement ce delta en ticks (chantier 44), si bien que `lastTickAt` revient à sa
 * valeur d'entrée : chaque itération rejoue les mêmes 17 280 ticks, sans reset manuel.
 *
 * L'entête disait auparavant que l'horloge revenait « à ~maintenant » parce que le rattrapage
 * consommait aussi le temps réel. Le chiffre ne change pas — le plafond `MAX_CATCHUP_TICKS`
 * écrêtait déjà cette dérive ici — mais la raison, si.
 *
 * **La population PNJ fait partie du montage depuis le chantier 43.5, et c'est le sujet.**
 * Ce bench partait d'un `loadOrBootstrap()` nu : un empire, aucun PNJ, aucune économie qui
 * tourne. Il rendait 2,9 s pour 24 h simulées — un chiffre rassurant qui ne décrivait
 * AUCUNE configuration réelle, puisque `apps/server/src/index.ts` appelle
 * `ensureNpcPopulation()` juste après le boot, à chaque démarrage. Le pilote économique PNJ
 * publie des contrats, arbitre des prix et fait voyager des convois à chaque tick : c'est
 * lui qui remplit un tick, et il manquait à la mesure.
 *
 * Le `beforeAll` est au niveau du FICHIER et non dans le `describe` : sous `vitest bench`,
 * un hook de `describe` ne s'applique pas aux benches qu'il contient, et le montage ne
 * tourne jamais — la mesure échoue alors sur un moteur `undefined` plutôt que de mentir,
 * ce qui est déjà ça, mais le piège vaut d'être écrit.
 */
let engine: GameEngine;

beforeAll(async () => {
  await db.delete(schema.games);
  await db.delete(schema.players);
  engine = await GameEngine.loadOrBootstrap();
  engine.ensureNpcPopulation();
});

describe("rattrapage au boot", () => {
  bench(
    `catchUp() sur ${MAX_CATCHUP_TICKS} ticks (24h simulées, TICK_MS=${TICK_MS}), PNJ compris`,
    () => {
      engine.devFastForward(24 * 3600);
    },
    { time: 0, iterations: 3, warmupTime: 0, warmupIterations: 0 },
  );
});
