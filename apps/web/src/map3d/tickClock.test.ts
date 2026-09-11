import { TICK_MS } from "@spacesim/shared";
import { describe, expect, it } from "vite-plus/test";
import { fractionalTick } from "./tickClock.js";

/**
 * Le tick fractionnaire lit une heure du SERVEUR (`lastTickAt`) avec l'horloge du CLIENT, et
 * les deux ne s'accordent jamais tout à fait. Ces cas rejouent la vie réelle : le serveur
 * avance `lastTickAt` d'un pas exact à chaque tick, l'instantané arrive après une latence, et
 * l'horloge du joueur retarde d'une seconde et demie — ce qu'une horloge Windows synchronisée
 * une fois par semaine fait sans peine.
 */
const T0 = 1_000_000;
/** L'horloge du client retarde sur celle du serveur. */
const SKEW = 1500;
/** Délai entre l'écriture du tick et la réception de l'instantané. */
const LATENCY = 80;

const lastTickAt = (tick: number) => T0 + tick * TICK_MS;
/** Heure du CLIENT à laquelle l'instantané du tick donné lui parvient. */
const arrival = (tick: number) => lastTickAt(tick) + LATENCY - SKEW;

describe("fractionalTick (chantier 50.5)", () => {
  it("est continu au passage d'un tick, même sur une horloge en retard", () => {
    // Juste avant l'instantané, la scène vit sur le tick 7 ; juste après, sur le 8. Un écart
    // entre les deux est un bond de toute la scène à chaque tick serveur.
    const at = arrival(8);
    const before = fractionalTick(7, lastTickAt(7), at);
    const after = fractionalTick(8, lastTickAt(8), at);
    expect(after).toBeCloseTo(before, 9);
  });

  it("ne cale pas après un tick : il avance au même pas", () => {
    // Une demi-seconde s'écoule juste après la réception : un dixième de tick.
    const at = arrival(8);
    const start = fractionalTick(8, lastTickAt(8), at);
    const later = fractionalTick(8, lastTickAt(8), at + 500);
    expect(later - start).toBeCloseTo(500 / TICK_MS, 9);
  });

  it("à l'heure du tick, il vaut le tick", () => {
    expect(fractionalTick(8, lastTickAt(8), lastTickAt(8))).toBe(8);
  });
});
