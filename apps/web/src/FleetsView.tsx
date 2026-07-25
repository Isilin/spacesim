import {
  allSystems,
  combatDefFromStats,
  COMBAT_DIRECTIVES,
  COMBAT_PHASES,
  fleetPower,
  resolveBlueprint,
  WARSHIP_COMBAT_DEFS,
  WARSHIP_IDS,
  WARSHIPS,
  type BattleReport,
  type Blueprint,
  type ClientMessage,
  type Colony,
  type CombatDef,
  type Fleet,
  type FleetComposition,
  type ForeignColony,
  type ForeignFleet,
  type PirateLair,
  type ResourceId,
  type StoredBattle,
  type TechId,
  type Universe,
  type WarshipId,
} from "@spacesim/shared";
import { useMemo, useState } from "react";
import { formatDuration } from "./format.js";
import { DIRECTIVE_LABELS, RESOURCE_LABELS, WARSHIP_LABELS } from "./labels.js";

interface Props {
  fleets: Fleet[];
  pirateLairs: PirateLair[];
  battles: StoredBattle[];
  colonies: Colony[];
  /** Plans de vaisseaux de l'empire (chantier 13) : résout le nom des ids de plan en flotte. */
  blueprints: Blueprint[];
  foreignFleets: ForeignFleet[];
  foreignColonies: ForeignColony[];
  universe: Universe;
  researched: readonly string[];
  now: number;
  send: (msg: ClientMessage) => void;
}

/** Rapport de raid PvP (pas une bataille rangée) : { raid, stolen }. */
interface RaidReport {
  raid: true;
  stolen: Partial<Record<ResourceId, number>>;
}
const isRaid = (r: unknown): r is RaidReport =>
  typeof r === "object" && r !== null && (r as { raid?: unknown }).raid === true;

const PHASE_LABELS: Record<string, string> = {
  long: "Longue portée",
  medium: "Moyenne portée",
  short: "Mêlée",
};


function compositionText(comp: FleetComposition, nameOf: (id: string) => string): string {
  const parts = Object.entries(comp)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([id, n]) => `${n} ${nameOf(id)}`);
  return parts.length > 0 ? parts.join(" · ") : "vide";
}

export function FleetsView({
  fleets,
  pirateLairs,
  battles,
  colonies,
  blueprints,
  foreignFleets,
  foreignColonies,
  universe,
  researched,
  now,
  send,
}: Props) {
  const [newFleetColony, setNewFleetColony] = useState("");
  const [newFleetName, setNewFleetName] = useState("");
  const [openBattle, setOpenBattle] = useState<string | null>(null);
  const systemName = (id: string) => allSystems(universe).find((s) => s.id === id)?.name ?? id;
  /** Nom d'un id de vaisseau : classe historique, ou nom du plan (chantier 13), ou l'id brut. */
  const nameOf = (id: string): string =>
    WARSHIP_LABELS[id as WarshipId]?.name ?? blueprints.find((b) => b.id === id)?.name ?? id;
  /** Defs de combat pour l'affichage de puissance : classes historiques + plans de l'empire. */
  const combatDefs = useMemo((): Record<string, CombatDef> => {
    const defs: Record<string, CombatDef> = { ...WARSHIP_COMBAT_DEFS };
    for (const bp of blueprints) defs[bp.id] = combatDefFromStats(resolveBlueprint(bp));
    return defs;
  }, [blueprints]);

  const colony = colonies.find((c) => c.id === newFleetColony) ?? colonies[0];

  return (
    <div className="fleets-view">
      <div className="colony-columns">
        <section className="buildings-panel">
          <h3>Flottes</h3>
          {fleets.length === 0 && <p className="muted">Aucune flotte.</p>}
          <ul className="route-list">
            {fleets.map((fleet) => {
              const lairsHere = pirateLairs.filter((l) => l.systemId === fleet.systemId);
              const enemyFleetsHere = foreignFleets.filter((f) => f.systemId === fleet.systemId);
              const enemyColoniesHere = foreignColonies.filter(
                (c) => c.systemId === fleet.systemId,
              );
              return (
                <li key={fleet.id} className="route-item">
                  <div className="queue-head">
                    <strong>{fleet.name}</strong>
                    <span className="muted small">
                      {fleet.movement
                        ? `→ ${systemName(fleet.movement.toSystemId)} (${formatDuration(fleet.movement.arrivesAt - now)})`
                        : systemName(fleet.systemId)}
                    </span>
                  </div>
                  <span className="small">
                    {compositionText(fleet.ships, nameOf)} · puissance{" "}
                    {fleetPower(fleet.ships, combatDefs)}
                  </span>

                  {fleet.queue.length > 0 && (
                    <span className="small muted">
                      Production : {nameOf(fleet.queue[0]!.warshipId)} —{" "}
                      {formatDuration(fleet.queue[0]!.finishesAt - now)}
                      {fleet.queue.length > 1 ? ` (+${fleet.queue.length - 1})` : ""}
                    </span>
                  )}

                  {/* Production de vaisseaux */}
                  {!fleet.movement && (
                    <div className="warship-build">
                      {WARSHIP_IDS.map((id) => {
                        const def = WARSHIPS[id];
                        const locked = !researched.includes(def.requiresTech);
                        return (
                          <button
                            key={id}
                            className="action-button small"
                            disabled={locked}
                            title={
                              locked
                                ? "Tech militaire requise"
                                : Object.entries(def.cost)
                                    .map(([r, n]) => `${n} ${RESOURCE_LABELS[r as ResourceId]}`)
                                    .join(" · ")
                            }
                            onClick={() => send({ type: "buildWarship", fleetId: fleet.id, warshipId: id })}
                          >
                            + {WARSHIP_LABELS[id].name}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Directives par phase */}
                  <div className="directives">
                    {COMBAT_PHASES.map((phase) => (
                      <label key={phase} className="small muted">
                        {PHASE_LABELS[phase]}
                        <select
                          value={fleet.directives[phase]}
                          onChange={(e) =>
                            send({
                              type: "setFleetDirectives",
                              fleetId: fleet.id,
                              directives: { ...fleet.directives, [phase]: e.target.value },
                            })
                          }
                        >
                          {COMBAT_DIRECTIVES.map((d) => (
                            <option key={d} value={d}>
                              {DIRECTIVE_LABELS[d].name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>

                  {/* Déplacement */}
                  {!fleet.movement && (
                    <div className="route-actions">
                      <select
                        className="colony-select"
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value)
                            send({ type: "moveFleet", fleetId: fleet.id, toSystemId: e.target.value });
                          e.target.value = "";
                        }}
                      >
                        <option value="">Déplacer vers…</option>
                        {allSystems(universe)
                          .filter((s) => s.id !== fleet.systemId)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </select>
                      <button
                        className="action-button"
                        onClick={() => send({ type: "disbandFleet", fleetId: fleet.id })}
                      >
                        Dissoudre
                      </button>
                    </div>
                  )}

                  {/* Repaires attaquables sur place */}
                  {lairsHere.map((lair) => (
                    <div key={lair.id} className="lair-target">
                      <span className="small ko">
                        ☠ Repaire pirate — {compositionText(lair.ships, nameOf)} · butin {lair.bounty} ✧
                      </span>
                      <button
                        className="action-button"
                        disabled={!!fleet.movement}
                        onClick={() => send({ type: "attackLair", fleetId: fleet.id, lairId: lair.id })}
                      >
                        Attaquer
                      </button>
                    </div>
                  ))}

                  {/* PvP : flottes étrangères sur zone */}
                  {enemyFleetsHere.map((ef) => (
                    <div key={ef.id} className="lair-target">
                      <span className="small ko">
                        ⚔ Flotte {ef.name}{" "}
                        <span style={{ color: ef.ownerColor }}>({ef.ownerName})</span> —{" "}
                        {compositionText(ef.ships as FleetComposition, nameOf)}
                      </span>
                      <button
                        className="action-button"
                        disabled={!!fleet.movement}
                        onClick={() =>
                          send({ type: "attackFleet", fleetId: fleet.id, targetFleetId: ef.id })
                        }
                      >
                        Attaquer
                      </button>
                    </div>
                  ))}

                  {/* PvP : colonies étrangères sur zone (raid) */}
                  {enemyColoniesHere.map((ec) => (
                    <div key={ec.id} className="lair-target">
                      <span className="small ko">
                        🎯 Colonie {ec.name}{" "}
                        <span style={{ color: ec.ownerColor }}>({ec.ownerName})</span>
                      </span>
                      <button
                        className="action-button"
                        disabled={!!fleet.movement}
                        onClick={() =>
                          send({ type: "attackColony", fleetId: fleet.id, targetColonyId: ec.id })
                        }
                      >
                        Raid
                      </button>
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>

          {colonies.length > 0 && (
            <div className="transfer-form">
              <strong className="small">Nouvelle flotte</strong>
              <label className="small muted">
                Rattachée à{" "}
                <select value={colony?.id ?? ""} onChange={(e) => setNewFleetColony(e.target.value)}>
                  {colonies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <input
                className="fleet-name"
                placeholder="Nom de la flotte"
                value={newFleetName}
                onChange={(e) => setNewFleetName(e.target.value)}
              />
              <button
                disabled={!colony}
                onClick={() => {
                  if (!colony) return;
                  send({ type: "createFleet", colonyId: colony.id, name: newFleetName });
                  setNewFleetName("");
                }}
              >
                Créer la flotte
              </button>
            </div>
          )}
        </section>

        <section className="queue-panel">
          <h3>Menaces & rapports</h3>
          {pirateLairs.length > 0 && (
            <ul className="queue-list">
              {pirateLairs.map((lair) => (
                <li key={lair.id} className="queue-item">
                  <div className="queue-head">
                    <span className="ko">☠ {systemName(lair.systemId)}</span>
                    <span className="muted small">{fleetPower(lair.ships, combatDefs)}</span>
                  </div>
                  <span className="small muted">{compositionText(lair.ships, nameOf)}</span>
                </li>
              ))}
            </ul>
          )}

          <h4 className="small muted" style={{ marginTop: 12 }}>
            Rapports de bataille
          </h4>
          {battles.length === 0 ? (
            <p className="muted small">Aucune bataille.</p>
          ) : (
            <ul className="queue-list">
              {battles.map((b) => {
                if (isRaid(b.report)) {
                  const loot = (Object.entries(b.report.stolen) as [ResourceId, number][])
                    .filter(([, n]) => n > 0)
                    .map(([r, n]) => `${n} ${RESOURCE_LABELS[r]}`)
                    .join(" · ");
                  return (
                    <li key={b.id} className="queue-item">
                      <div className="queue-head">
                        <span className="ok">🎯 Raid — {systemName(b.systemId)}</span>
                        <span className="muted small">{b.attackerName}</span>
                      </div>
                      <span className="small muted">
                        Pillé : {loot || "rien"} · cible {b.defenderName}
                      </span>
                    </li>
                  );
                }
                const report = b.report as BattleReport;
                const won = report.winner === "attacker";
                return (
                  <li key={b.id} className="queue-item">
                    <div
                      className="queue-head battle-head"
                      onClick={() => setOpenBattle(openBattle === b.id ? null : b.id)}
                    >
                      <span className={won ? "ok" : "ko"}>
                        {won ? "Victoire" : report.winner === "draw" ? "Nul" : "Défaite"} —{" "}
                        {systemName(b.systemId)}
                      </span>
                      <span className="muted small">{b.attackerName}</span>
                    </div>
                    {openBattle === b.id && (
                      <div className="battle-detail small">
                        {report.phases.map((p, i) => (
                          <div key={i} className="battle-phase">
                            <strong>{PHASE_LABELS[p.phase]}</strong> —{" "}
                            {DIRECTIVE_LABELS[p.attackerDirective].name} vs{" "}
                            {DIRECTIVE_LABELS[p.defenderDirective].name}
                            <div className="muted">
                              Pertes : {compositionText(p.attackerLosses, nameOf)} / ennemi{" "}
                              {compositionText(p.defenderLosses, nameOf)}
                            </div>
                          </div>
                        ))}
                        <div className="muted">
                          Survivants : {compositionText(report.attackerSurvivors, nameOf)}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
