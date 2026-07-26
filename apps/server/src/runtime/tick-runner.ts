import { ECONOMY_TICK_TICKS, TICK_MS, type Colony } from "@spacesim/shared";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import type { Empire } from "../empire.js";
import type { GameRuntime } from "./game-runtime.js";

/**
 * Les phases d'un tick, dans l'ordre exact observé en production. Chaque méthode reste
 * l'implémentation existante de `GameEngine` — `TickRunner` n'en encode que la séquence
 * et les moments de persistance/notification ; la migration des corps de méthode vers des
 * services par domaine est un chantier séparé.
 */
export interface TickHost {
  deliverTransfers(empire: Empire, t: number): void;
  resolveMissions(empire: Empire, t: number): void;
  resolveResearch(empire: Empire, t: number): void;
  resolveGateways(t: number): void;
  resolveContracts(t: number): void;
  resolveObjectives(t: number): void;
  resolveWorldEvents(t: number): void;
  worldEventTick(tickNumber: number, now: number): void;
  processRoutes(empire: Empire, t: number): void;
  outpostsTick(empire: Empire): void;
  fleetsTick(empire: Empire, t: number): void;
  spawnPirates(tickNumber: number): void;
  influenceTick(empire: Empire): void;
  economyTick(tickNumber: number): void;
  factionMoodTick(now: number, tickNumber: number): void;
  npcTick(empire: Empire): void;
  generateObjectives(tickNumber: number, now: number): void;
  ensureFrontier(): void;
  colonyProductionTick(empire: Empire, t: number): void;
  persistColony(colony: Colony): void;
  persistOutposts(empire: Empire): void;
  notify(): void;
}

/** Fait avancer la simulation d'un nombre de ticks donné — boucle, persistance, notification. */
export class TickRunner {
  constructor(
    private readonly runtime: GameRuntime,
    private readonly host: TickHost,
  ) {}

  run(ticks: number): void {
    for (let i = 1; i <= ticks; i++) {
      this.runOne(this.runtime.clock.lastTickAt + i * TICK_MS, this.runtime.clock.tick + i);
    }
    this.runtime.clock.tick += ticks;
    this.runtime.clock.lastTickAt += ticks * TICK_MS;
    db.update(schema.games)
      .set({ tick: this.runtime.clock.tick, lastTickAt: this.runtime.clock.lastTickAt })
      .where(eq(schema.games.id, this.runtime.clock.id))
      .run();
    for (const empire of this.runtime.empires.values()) {
      db.update(schema.players)
        .set({ influence: empire.influence, factionRep: JSON.stringify(empire.factionRep) })
        .where(eq(schema.players.id, empire.id))
        .run();
      for (const colony of empire.colonyMap.values()) this.host.persistColony(colony);
      this.host.persistOutposts(empire);
    }
    this.host.notify();
  }

  /** Une passe de tick : arrivées/recherche, monde partagé, routes/flottes/influence,
   *  économie/PNJ/objectifs/frontière (tick éco seulement), puis production des colonies. */
  private runOne(t: number, tickNumber: number): void {
    const { host, runtime } = this;
    const isEconomyTick = tickNumber % ECONOMY_TICK_TICKS === 0;

    // Étapes par empire (un seul instancié à ce stade — la boucle tourne une fois).
    for (const empire of runtime.empires.values()) {
      host.deliverTransfers(empire, t);
      host.resolveMissions(empire, t);
      host.resolveResearch(empire, t);
    }
    // Portails et contrats : univers partagé, résolus une fois par tick.
    host.resolveGateways(t);
    host.resolveContracts(t);
    // Objectifs éphémères : réactifs à tout changement (colonisation, claim…), pas
    // seulement au tick éco.
    host.resolveObjectives(t);
    // Événements de monde : expiration à chaque tick, nouveau tirage au tick éco (avant
    // spawnPirates, pour qu'une vague pirate fraîchement déclenchée s'applique tout de suite).
    host.resolveWorldEvents(t);
    if (isEconomyTick) host.worldEventTick(tickNumber, t);
    for (const empire of runtime.empires.values()) {
      host.processRoutes(empire, t);
      host.outpostsTick(empire);
      host.fleetsTick(empire, t);
    }
    // Apparition de repaires (PNJ partagés) : après les mouvements de flotte, avant
    // l'entretien d'influence — position historique (fin de `fleetsTick`), tick éco.
    if (isEconomyTick) host.spawnPirates(tickNumber);
    for (const empire of runtime.empires.values()) host.influenceTick(empire);
    // Marchés PNJ : univers partagé, une fois par tick éco.
    if (isEconomyTick) {
      host.economyTick(tickNumber);
      // Humeurs de faction (chantier 15) : après les marchés, avant les PNJ qui
      // tarifent leurs contrats sur les cours (et bientôt les humeurs) à jour.
      host.factionMoodTick(t, tickNumber);
      // Économie des empires PNJ (chantier 14) : après les marchés, pour tarifer
      // leurs contrats sur des cours à jour.
      for (const empire of runtime.empires.values()) host.npcTick(empire);
      // Objectifs éphémères (chantier 17) : un nouveau tirage par cycle éco, pas par tick.
      host.generateObjectives(tickNumber, t);
    }
    // Front de peuplement : une colonisation a pu entamer la frontière (chantier 9).
    if (isEconomyTick) host.ensureFrontier();
    for (const empire of runtime.empires.values()) host.colonyProductionTick(empire, t);
  }
}
