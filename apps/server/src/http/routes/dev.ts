import type { FastifyInstance } from "fastify";
import type { GameEngine } from "../../game.js";

/** Triches de dev : injection de ressources, avance rapide. Jamais en production. */
export function registerDevRoutes(
  app: FastifyInstance,
  engine: GameEngine,
): void {
  app.post("/dev/grant", (request) => {
    engine.devGrant((request.body ?? {}) as Record<string, number>);
    return { ok: true };
  });
  app.post("/dev/fastforward", (request) => {
    const { seconds } = (request.body ?? {}) as { seconds?: number };
    engine.devFastForward(seconds ?? 0);
    return { ok: true, tick: engine.game.tick };
  });
  app.post("/dev/fundgateway", (request) => {
    const { galaxyId, leave } = (request.body ?? {}) as {
      galaxyId?: string;
      leave?: number;
    };
    engine.devFundGateway(galaxyId ?? "", leave ?? 50);
    return { ok: true };
  });
  app.post("/dev/spawnpirate", (request) => {
    const { systemId, threat } = (request.body ?? {}) as {
      systemId?: string;
      threat?: number;
    };
    engine.devSpawnPirate(systemId ?? "", threat ?? 2);
    return { ok: true };
  });
  app.post("/dev/setfactionmood", (request, reply) => {
    const { factionId, mood, durationMs } = (request.body ?? {}) as {
      factionId?: string;
      mood?: string;
      durationMs?: number;
    };
    const ok = engine.devSetFactionMood(
      factionId ?? "",
      (mood ?? "neutral") as Parameters<typeof engine.devSetFactionMood>[1],
      durationMs,
    );
    if (!ok) return reply.code(404).send({ error: "Faction inconnue" });
    return { ok: true };
  });
  app.post("/dev/triggerworldevent", (request, reply) => {
    const { kind, target, durationMs } = (request.body ?? {}) as {
      kind?: string;
      target?: string;
      durationMs?: number;
    };
    const eventId = engine.devTriggerWorldEvent(
      (kind ?? "economic_crisis") as Parameters<
        typeof engine.devTriggerWorldEvent
      >[0],
      target ?? "",
      durationMs,
    );
    if (!eventId) return reply.code(404).send({ error: "Cible inconnue" });
    return { ok: true, eventId };
  });
  app.post("/dev/foundstation", (request, reply) => {
    const { empireId, name, access, taxRate, zones, installations, queued } =
      (request.body ?? {}) as {
        empireId?: string;
        name?: string;
        access?: string;
        taxRate?: number;
        zones?: string[];
        installations?: Record<string, number>;
        queued?: string;
      };
    const empire = empireId
      ? engine.empireById(empireId)
      : engine.defaultEmpireForDev;
    if (!empire) return reply.code(404).send({ error: "Empire inconnu" });
    const id = engine.devService.devFoundStation(
      empire,
      name,
      (access ?? "public") as never,
      taxRate ?? 0,
      zones ?? [],
      installations ?? {},
      queued,
    );
    return { ok: id !== null, stationId: id };
  });
  app.post("/dev/spawnempire", (request) => {
    const { name } = (request.body ?? {}) as { name?: string };
    const empireId = engine.devSpawnEmpire(name);
    return { ok: empireId !== null, empireId };
  });
  app.post("/dev/spawnnpc", (request) => {
    const { name } = (request.body ?? {}) as { name?: string };
    const empireId = engine.devSpawnNpcEmpire(name);
    return { ok: empireId !== null, empireId };
  });
  app.get("/dev/empires", () => engine.devEmpireSummaries());
  app.post("/dev/armfleet", (request, reply) => {
    const { empireId, systemId, ships } = (request.body ?? {}) as {
      empireId?: string;
      systemId?: string;
      ships?: Record<string, number>;
    };
    const empire = empireId
      ? engine.empireById(empireId)
      : engine.defaultEmpireForDev;
    if (!empire) return reply.code(404).send({ error: "Empire inconnu" });
    const fleetId = engine.devArmFleet(empire, systemId ?? "", ships ?? {});
    return { ok: true, fleetId };
  });
}
