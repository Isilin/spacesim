import { DEFAULT_BALANCE, type BalanceConstants } from "../../balance.js";
import type { ClientUniverse, Galaxy } from "../../model/universe.js";

/**
 * Points de nuage transmis pour une galaxie condensée.
 *
 * Assez pour qu'elle ait la même DENSITÉ APPARENTE qu'une galaxie détaillée posée à côté
 * d'elle : à soixante points, les galaxies hors de portée se lisaient comme des ébauches
 * à côté de celle du joueur, ce que rien dans la fiction ne justifie. Reste très en deçà
 * des cinq cents positions dont le joueur ne peut de toute façon rien faire — et à ~3 Ko
 * la galaxie, le plafond de deux cents tient dans quelques centaines de kilo-octets.
 */
const CLOUD_POINTS = 150;

/**
 * Réduit une galaxie à ce qui se voit du palier univers : sa fiche, son compte de systèmes,
 * et un nuage sous-échantillonné. Ni systèmes, ni corps, ni graphe de sauts.
 */
function digestGalaxy(galaxy: Galaxy): Galaxy {
  const count = Math.min(galaxy.systems.length, CLOUD_POINTS);
  const cloud: number[] = [];
  for (let i = 0; i < count; i++) {
    const system =
      galaxy.systems[Math.floor(((i + 0.5) * galaxy.systems.length) / count)];
    if (system) cloud.push(system.x, system.y, system.z);
  }
  return {
    ...galaxy,
    systems: [],
    links: [],
    systemCount: galaxy.systems.length,
    cloud,
  };
}

/**
 * Expurge l'univers pour le client (chantiers 7c-B puis 37.10).
 *
 * Deux niveaux, et non plus un seul :
 *
 * - **Galaxies détaillées** — celles où le joueur a exploré, colonisé, ou qu'il peut
 *   atteindre : tous les systèmes, avec leur position et leur nom (visibles de loin), mais
 *   les corps masqués tant que le système n'est pas exploré.
 * - **Le reste** — un condensé. L'univers partait EN ENTIER à chaque `hello` et à chaque
 *   changement d'exploration, sans pagination : tenable quand une galaxie comptait quatorze
 *   systèmes, plus du tout à quatre cents, et intenable au plafond de deux cents galaxies.
 *   Un joueur ne peut rien faire d'une galaxie qu'aucun portail ne lui ouvre ; il n'a besoin
 *   que de la voir.
 *
 * La **seed n'est jamais transmise**. Elle l'était, avec un générateur déterministe livré
 * dans le paquet du navigateur : un client pouvait reconstruire tout l'univers, planètes et
 * gisements des systèmes inexplorés compris. Le brouillard était décoratif face à qui
 * voulait le lever ; sans elle, le condensé protège vraiment ce qu'il tait.
 */
export function redactUniverse(
  universe: ClientUniverse,
  exploredSystemIds: ReadonlySet<string>,
  detailedGalaxyIds?: ReadonlySet<string>,
): ClientUniverse {
  return {
    galaxies: universe.galaxies.map((galaxy) =>
      detailedGalaxyIds && !detailedGalaxyIds.has(galaxy.id)
        ? digestGalaxy(galaxy)
        : {
            ...galaxy,
            systems: galaxy.systems.map((sys) =>
              exploredSystemIds.has(sys.id)
                ? sys
                : { ...sys, planets: [], belts: [], station: undefined },
            ),
          },
    ),
  };
}

export function probeDurationMs(
  jumps: number,
  balance: BalanceConstants = DEFAULT_BALANCE,
): number {
  return balance.probeBaseMs + jumps * balance.probeMsPerJump;
}

export function colonyShipDurationMs(
  jumps: number,
  balance: BalanceConstants = DEFAULT_BALANCE,
): number {
  return balance.colonyShipBaseMs + jumps * balance.colonyShipMsPerJump;
}

export function stationShipDurationMs(
  jumps: number,
  balance: BalanceConstants = DEFAULT_BALANCE,
): number {
  return balance.stationShipBaseMs + jumps * balance.stationShipMsPerJump;
}
