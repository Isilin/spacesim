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
import { useTranslation } from "react-i18next";
import { i18n } from "./i18n.js";
import { formatDuration } from "./format.js";
import { directiveLabel, resourceLabel, warshipLabel } from "./labels.js";

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
  typeof r === "object" &&
  r !== null &&
  (r as { raid?: unknown }).raid === true;

const PHASE_KEYS: Record<(typeof COMBAT_PHASES)[number], string> = {
  long: "fleetsView.phaseLong",
  medium: "fleetsView.phaseMedium",
  short: "fleetsView.phaseShort",
};

function compositionText(
  comp: FleetComposition,
  nameOf: (id: string) => string,
): string {
  const parts = Object.entries(comp)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([id, n]) => `${n} ${nameOf(id)}`);
  return parts.length > 0 ? parts.join(" · ") : i18n.t("fleetsView.empty");
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
  const { t } = useTranslation();
  const [newFleetColony, setNewFleetColony] = useState("");
  const [newFleetName, setNewFleetName] = useState("");
  const [openBattle, setOpenBattle] = useState<string | null>(null);
  const systemName = (id: string) =>
    allSystems(universe).find((s) => s.id === id)?.name ?? id;
  /** Nom d'un id de vaisseau : classe historique, ou nom du plan (chantier 13), ou l'id brut. */
  const nameOf = (id: string): string =>
    warshipLabel(id as WarshipId)?.name ??
    blueprints.find((b) => b.id === id)?.name ??
    id;
  /** Defs de combat pour l'affichage de puissance : classes historiques + plans de l'empire. */
  const combatDefs = useMemo((): Record<string, CombatDef> => {
    const defs: Record<string, CombatDef> = { ...WARSHIP_COMBAT_DEFS };
    for (const bp of blueprints)
      defs[bp.id] = combatDefFromStats(resolveBlueprint(bp));
    return defs;
  }, [blueprints]);

  const colony = colonies.find((c) => c.id === newFleetColony) ?? colonies[0];

  return (
    <div className="fleets-view">
      <div className="colony-columns">
        <Panel title={t("fleetsView.fleets")}>
          {fleets.length === 0 && (
            <p className="muted">{t("fleetsView.noFleet")}</p>
          )}
          <ul className="route-list">
            {fleets.map((fleet) => {
              const lairsHere = pirateLairs.filter(
                (l) => l.systemId === fleet.systemId,
              );
              const enemyFleetsHere = foreignFleets.filter(
                (f) => f.systemId === fleet.systemId,
              );
              const enemyColoniesHere = foreignColonies.filter(
                (c) => c.systemId === fleet.systemId,
              );
              return (
                <li key={fleet.id} className="route-item">
                  <div className="queue-head">
                    <strong>{fleet.name}</strong>
                    <span className="muted small">
                      {fleet.movement
                        ? t("fleetsView.movingTo", {
                            system: systemName(fleet.movement.toSystemId),
                            duration: formatDuration(
                              fleet.movement.arrivesAt - now,
                            ),
                          })
                        : systemName(fleet.systemId)}
                    </span>
                  </div>
                  <span className="small">
                    {t("fleetsView.powerLine", {
                      composition: compositionText(fleet.ships, nameOf),
                      power: fleetPower(fleet.ships, combatDefs),
                    })}
                  </span>

                  {fleet.queue.length > 0 && (
                    <span className="small muted">
                      {t("fleetsView.production", {
                        name: nameOf(fleet.queue[0]!.warshipId),
                        duration: formatDuration(
                          fleet.queue[0]!.finishesAt - now,
                        ),
                      })}
                      {fleet.queue.length > 1
                        ? t("fleetsView.productionQueueSuffix", {
                            count: fleet.queue.length - 1,
                          })
                        : ""}
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
                                ? t("fleetsView.militaryTechRequired")
                                : Object.entries(def.cost)
                                    .map(
                                      ([r, n]) =>
                                        `${n} ${resourceLabel(r as ResourceId)}`,
                                    )
                                    .join(" · ")
                            }
                            onClick={() =>
                              send({
                                type: "buildWarship",
                                fleetId: fleet.id,
                                warshipId: id,
                              })
                            }
                          >
                            + {warshipLabel(id).name}
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
                        label={t(PHASE_KEYS[phase])}
                        value={fleet.directives[phase]}
                        onChange={(e) =>
                          send({
                            type: "setFleetDirectives",
                            fleetId: fleet.id,
                            directives: {
                              ...fleet.directives,
                              [phase]: e.target.value,
                            },
                          })
                        }
                        options={COMBAT_DIRECTIVES.map((d) => ({
                          value: d,
                          label: directiveLabel(d).name,
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
                          { value: "", label: t("fleetsView.moveTo") },
                          ...allSystems(universe)
                            .filter((s) => s.id !== fleet.systemId)
                            .map((s) => ({ value: s.id, label: s.name })),
                        ]}
                      />
                      <Button
                        onClick={() =>
                          send({ type: "disbandFleet", fleetId: fleet.id })
                        }
                      >
                        {t("fleetsView.disband")}
                      </Button>
                    </div>
                  )}

                  {/* Repaires attaquables sur place */}
                  {lairsHere.map((lair) => (
                    <div key={lair.id} className="lair-target">
                      <Badge variant="ko">
                        {t("fleetsView.pirateLair", {
                          composition: compositionText(lair.ships, nameOf),
                          bounty: lair.bounty,
                        })}
                      </Badge>
                      <Button
                        disabled={!!fleet.movement}
                        onClick={() =>
                          send({
                            type: "attackLair",
                            fleetId: fleet.id,
                            lairId: lair.id,
                          })
                        }
                      >
                        {t("fleetsView.attack")}
                      </Button>
                    </div>
                  ))}

                  {/* PvP : flottes étrangères sur zone */}
                  {enemyFleetsHere.map((ef) => (
                    <div key={ef.id} className="lair-target">
                      <Badge variant="ko">
                        {t("fleetsView.foreignFleet", { name: ef.name })}{" "}
                        <span style={{ color: ef.ownerColor }}>
                          ({ef.ownerName})
                        </span>{" "}
                        —{" "}
                        {compositionText(ef.ships as FleetComposition, nameOf)}
                      </Badge>
                      <Button
                        disabled={!!fleet.movement}
                        onClick={() =>
                          send({
                            type: "attackFleet",
                            fleetId: fleet.id,
                            targetFleetId: ef.id,
                          })
                        }
                      >
                        {t("fleetsView.attack")}
                      </Button>
                    </div>
                  ))}

                  {/* PvP : colonies étrangères sur zone (raid) */}
                  {enemyColoniesHere.map((ec) => (
                    <div key={ec.id} className="lair-target">
                      <Badge variant="ko">
                        {t("fleetsView.foreignColony", { name: ec.name })}{" "}
                        <span style={{ color: ec.ownerColor }}>
                          ({ec.ownerName})
                        </span>
                      </Badge>
                      <Button
                        disabled={!!fleet.movement}
                        onClick={() =>
                          send({
                            type: "attackColony",
                            fleetId: fleet.id,
                            targetColonyId: ec.id,
                          })
                        }
                      >
                        {t("fleetsView.raid")}
                      </Button>
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>

          {colonies.length > 0 && (
            <div className="transfer-form">
              <strong className="small">{t("fleetsView.newFleet")}</strong>
              <Select
                label={t("fleetsView.attachedTo")}
                value={colony?.id ?? ""}
                onChange={(e) => setNewFleetColony(e.target.value)}
                options={colonies.map((c) => ({ value: c.id, label: c.name }))}
              />
              <input
                className="fleet-name"
                placeholder={t("fleetsView.fleetNamePlaceholder")}
                value={newFleetName}
                onChange={(e) => setNewFleetName(e.target.value)}
              />
              <Button
                disabled={!colony}
                onClick={() => {
                  if (!colony) return;
                  send({
                    type: "createFleet",
                    colonyId: colony.id,
                    name: newFleetName,
                  });
                  setNewFleetName("");
                }}
              >
                {t("fleetsView.createFleet")}
              </Button>
            </div>
          )}
        </Panel>

        <Panel title={t("fleetsView.threatsReports")}>
          {pirateLairs.length > 0 && (
            <ul className="queue-list">
              {pirateLairs.map((lair) => (
                <ListRow
                  key={lair.id}
                  title={`☠ ${systemName(lair.systemId)}`}
                  meta={compositionText(lair.ships, nameOf)}
                  right={
                    <Badge variant="ko">
                      {fleetPower(lair.ships, combatDefs)}
                    </Badge>
                  }
                />
              ))}
            </ul>
          )}

          <h4 className="small muted" style={{ marginTop: 12 }}>
            {t("fleetsView.battleReports")}
          </h4>
          {battles.length === 0 ? (
            <p className="muted small">{t("fleetsView.noBattle")}</p>
          ) : (
            <ul className="queue-list">
              {battles.map((b) => {
                if (isRaid(b.report)) {
                  const loot = (
                    Object.entries(b.report.stolen) as [ResourceId, number][]
                  )
                    .filter(([, n]) => n > 0)
                    .map(([r, n]) => `${n} ${resourceLabel(r)}`)
                    .join(" · ");
                  return (
                    <li key={b.id} className="queue-item">
                      <div className="queue-head">
                        <Badge variant="ok">
                          {t("fleetsView.raidReport", {
                            system: systemName(b.systemId),
                          })}
                        </Badge>
                        <span className="muted small">{b.attackerName}</span>
                      </div>
                      <span className="small muted">
                        {t("fleetsView.looted", {
                          loot: loot || t("fleetsView.lootedNone"),
                          defender: b.defenderName,
                        })}
                      </span>
                    </li>
                  );
                }
                const report = b.report as BattleReport;
                const won = report.winner === "attacker";
                return (
                  <li key={b.id} className="queue-item">
                    <div
                      // biome-ignore lint/a11y/useSemanticElements: un <button> natif hériterait du chrome navigateur (fond/bordure/padding) sur cette ligne badge+texte — role="button" + clavier est le motif WAI-ARIA APG documenté pour ce cas plutôt qu'une passe de reset CSS hors sujet ici.
                      className="queue-head battle-head"
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        setOpenBattle(openBattle === b.id ? null : b.id)
                      }
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        setOpenBattle(openBattle === b.id ? null : b.id);
                      }}
                    >
                      <Badge variant={won ? "ok" : "ko"}>
                        {won
                          ? t("fleetsView.victory")
                          : report.winner === "draw"
                            ? t("fleetsView.draw")
                            : t("fleetsView.defeat")}{" "}
                        — {systemName(b.systemId)}
                      </Badge>
                      <span className="muted small">{b.attackerName}</span>
                    </div>
                    {openBattle === b.id && (
                      <div className="battle-detail small">
                        {report.phases.map((p, i) => (
                          <div key={i} className="battle-phase">
                            <strong>{t(PHASE_KEYS[p.phase])}</strong> —{" "}
                            {directiveLabel(p.attackerDirective).name} vs{" "}
                            {directiveLabel(p.defenderDirective).name}
                            <div className="muted">
                              {t("fleetsView.losses", {
                                attacker: compositionText(
                                  p.attackerLosses,
                                  nameOf,
                                ),
                                defender: compositionText(
                                  p.defenderLosses,
                                  nameOf,
                                ),
                              })}
                            </div>
                          </div>
                        ))}
                        <div className="muted">
                          {t("fleetsView.survivors", {
                            survivors: compositionText(
                              report.attackerSurvivors,
                              nameOf,
                            ),
                          })}
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
