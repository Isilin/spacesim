import type { ClientMessage } from "@spacesim/protocol";
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
import { Badge, Button, ListRow, Panel, Select } from "@spacesim/ui";
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
        <Panel title="Flottes">
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
                          <Button
                            key={id}
                            size="sm"
                            disabled={locked}
                            title={
                              locked
                                ? "Tech militaire requise"
                                : Object.entries(def.cost)
                                    .map(([r, n]) => `${n} ${RESOURCE_LABELS[r as ResourceId]}`)
                                    .join(" · ")
                            }
                            onClick={() =>
                              send({ type: "buildWarship", fleetId: fleet.id, warshipId: id })
                            }
                          >
                            + {WARSHIP_LABELS[id].name}
                          </Button>
                        );
                      })}
                    </div>
                  )}

                  {/* Directives par phase */}
                  <div className="directives">
                    {COMBAT_PHASES.map((phase) => (
                      <Select
                        key={phase}
                        label={PHASE_LABELS[phase]}
                        value={fleet.directives[phase]}
                        onChange={(e) =>
                          send({
                            type: "setFleetDirectives",
                            fleetId: fleet.id,
                            directives: { ...fleet.directives, [phase]: e.target.value },
                          })
                        }
                        options={COMBAT_DIRECTIVES.map((d) => ({
                          value: d,
                          label: DIRECTIVE_LABELS[d].name,
                        }))}
                      />
                    ))}
                  </div>

                  {/* Déplacement */}
                  {!fleet.movement && (
                    <div className="route-actions">
                      <Select
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value)
                            send({
                              type: "moveFleet",
                              fleetId: fleet.id,
                              toSystemId: e.target.value,
                            });
                          e.target.value = "";
                        }}
                        options={[
                          { value: "", label: "Déplacer vers…" },
                          ...allSystems(universe)
                            .filter((s) => s.id !== fleet.systemId)
                            .map((s) => ({ value: s.id, label: s.name })),
                        ]}
                      />
                      <Button onClick={() => send({ type: "disbandFleet", fleetId: fleet.id })}>
                        Dissoudre
                      </Button>
                    </div>
                  )}

                  {/* Repaires attaquables sur place */}
                  {lairsHere.map((lair) => (
                    <div key={lair.id} className="lair-target">
                      <Badge variant="ko">
                        ☠ Repaire pirate — {compositionText(lair.ships, nameOf)} · butin{" "}
                        {lair.bounty} ✧
                      </Badge>
                      <Button
                        disabled={!!fleet.movement}
                        onClick={() =>
                          send({ type: "attackLair", fleetId: fleet.id, lairId: lair.id })
                        }
                      >
                        Attaquer
                      </Button>
                    </div>
                  ))}

                  {/* PvP : flottes étrangères sur zone */}
                  {enemyFleetsHere.map((ef) => (
                    <div key={ef.id} className="lair-target">
                      <Badge variant="ko">
                        ⚔ Flotte {ef.name}{" "}
                        <span style={{ color: ef.ownerColor }}>({ef.ownerName})</span> —{" "}
                        {compositionText(ef.ships as FleetComposition, nameOf)}
                      </Badge>
                      <Button
                        disabled={!!fleet.movement}
                        onClick={() =>
                          send({ type: "attackFleet", fleetId: fleet.id, targetFleetId: ef.id })
                        }
                      >
                        Attaquer
                      </Button>
                    </div>
                  ))}

                  {/* PvP : colonies étrangères sur zone (raid) */}
                  {enemyColoniesHere.map((ec) => (
                    <div key={ec.id} className="lair-target">
                      <Badge variant="ko">
                        🎯 Colonie {ec.name}{" "}
                        <span style={{ color: ec.ownerColor }}>({ec.ownerName})</span>
                      </Badge>
                      <Button
                        disabled={!!fleet.movement}
                        onClick={() =>
                          send({ type: "attackColony", fleetId: fleet.id, targetColonyId: ec.id })
                        }
                      >
                        Raid
                      </Button>
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>

          {colonies.length > 0 && (
            <div className="transfer-form">
              <strong className="small">Nouvelle flotte</strong>
              <Select
                label="Rattachée à"
                value={colony?.id ?? ""}
                onChange={(e) => setNewFleetColony(e.target.value)}
                options={colonies.map((c) => ({ value: c.id, label: c.name }))}
              />
              <input
                className="fleet-name"
                placeholder="Nom de la flotte"
                value={newFleetName}
                onChange={(e) => setNewFleetName(e.target.value)}
              />
              <Button
                disabled={!colony}
                onClick={() => {
                  if (!colony) return;
                  send({ type: "createFleet", colonyId: colony.id, name: newFleetName });
                  setNewFleetName("");
                }}
              >
                Créer la flotte
              </Button>
            </div>
          )}
        </Panel>

        <Panel title="Menaces & rapports">
          {pirateLairs.length > 0 && (
            <ul className="queue-list">
              {pirateLairs.map((lair) => (
                <ListRow
                  key={lair.id}
                  title={`☠ ${systemName(lair.systemId)}`}
                  meta={compositionText(lair.ships, nameOf)}
                  right={<Badge variant="ko">{fleetPower(lair.ships, combatDefs)}</Badge>}
                />
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
                        <Badge variant="ok">🎯 Raid — {systemName(b.systemId)}</Badge>
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
                      <Badge variant={won ? "ok" : "ko"}>
                        {won ? "Victoire" : report.winner === "draw" ? "Nul" : "Défaite"} —{" "}
                        {systemName(b.systemId)}
                      </Badge>
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
        </Panel>
      </div>
    </div>
  );
}
