import { TICK_MS } from "@spacesim/shared";

/**
 * Tick fractionnaire à l'instant `now` : ce que toute la scène anime (chantier 31.15, extrait
 * au chantier 50.5 pour être testé).
 *
 * Le serveur n'avance que par pas de `TICK_MS`, l'écran par image : la partie fractionnaire
 * interpole entre deux ticks. Elle se mesure depuis `lastTickAt` — une heure du SERVEUR — avec
 * l'horloge du CLIENT, et les deux ne s'accordent jamais tout à fait.
 *
 * ## Pourquoi elle n'est pas bornée à zéro
 *
 * Elle l'était, par un `Math.max(0, …)` qui semblait prudent et créait le défaut qu'il croyait
 * éviter. Sur une horloge en retard de δ, la fraction restait collée à zéro pendant δ après
 * chaque tick, puis bondissait à l'arrivée du suivant : toute la scène calait et sautait, cinq
 * secondes après cinq secondes. Mesuré dans `tickClock.test.ts` sur un retard d'une seconde et
 * demie : un bond de 0,28 tick à chaque instantané, et une demi-seconde d'immobilité après.
 *
 * Personne ne l'avait vu, parce que rien ne bougeait assez vite : une planète parcourt un degré
 * par minute. Le spin du chantier 50 tourne jusqu'à trois degrés par seconde, et l'aurait rendu
 * flagrant.
 *
 * Non bornée, la fraction est une fonction continue de l'heure du client, simplement décalée de
 * δ : le décalage se perd dans la phase des orbites, et le mouvement reste fluide.
 */
export function fractionalTick(
  tick: number,
  lastTickAt: number,
  now: number,
): number {
  return tick + (now - lastTickAt) / TICK_MS;
}
