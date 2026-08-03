import { MAX_CATCHUP_TICKS, TICK_MS } from "@spacesim/shared";
import { bench, beforeAll, describe } from "vitest";
import { db, schema } from "../db/index.js";
import { GameEngine } from "../game.js";

/**
 * Mesure le risque réel identifié en 27.6 : le rattrapage synchrone au boot
 * (`GameEngine.catchUp()`, appelé une fois depuis `runtime/boot.ts`), pas le régime
 * stationnaire (couvert par 27.7). `devFastForward` décale `lastTickAt` d'un delta FIXE
 * puis rejoue les ticks manqués (bornés à `MAX_CATCHUP_TICKS`) — comme il ramène l'horloge
 * à ~maintenant après coup (le rattrapage avance `lastTickAt` du même nombre de ticks
 * qu'il vient de rejouer), chaque appel redéclenche indépendamment un rattrapage complet :
 * pas besoin de reset manuel entre itérations.
 */
let engine: GameEngine;

beforeAll(async () => {
  await db.delete(schema.games);
  await db.delete(schema.players);
  engine = await GameEngine.loadOrBootstrap();
});

describe("rattrapage au boot", () => {
  bench(
    `catchUp() sur ${MAX_CATCHUP_TICKS} ticks (24h simulées, TICK_MS=${TICK_MS})`,
    () => {
      engine.devFastForward(24 * 3600);
    },
    { time: 0, iterations: 3, warmupTime: 0, warmupIterations: 0 },
  );
});
