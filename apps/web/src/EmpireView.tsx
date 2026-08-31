import type { ClientMessage } from "@spacesim/protocol";
import {
  allSystems,
  FACTION_IDS,
  FACTIONS,
  influencePerTick,
  MILESTONES,
  REP_TIERS,
  type Colony,
  type Contract,
  type EmpireEffects,
  type FactionId,
  type FactionState,
  type GameState,
  type LeaderboardEntry,
  type MilestoneMetric,
  type Objective,
  type PirateLair,
  type RelationProposal,
  type Universe,
  type WorldEvent,
} from "@spacesim/shared";
import { Button, Panel, ProgressBar } from "@spacesim/ui";
import { useTranslation } from "react-i18next";
import { i18n } from "./i18n.js";
import { formatDuration } from "./format.js";
import {
  factionMoodLabel,
  objectiveKindLabel,
  relationBadge,
  resourceLabel,
  worldEventLabel,
  repTierName,
} from "./labels.js";

interface Props {
  game: GameState;
  colonies: Colony[];
  universe: Universe;
  exploredSystemIds: string[];
  leaderboard: LeaderboardEntry[];
  factionStates: FactionState[];
  contracts: Contract[];
  proposals: RelationProposal[];
  objectives: Objective[];
  worldEvents: WorldEvent[];
  pirateLairs: PirateLair[];
  playerId: string | null;
  effects: EmpireEffects;
  now: number;
  send: (msg: ClientMessage) => void;
}

/** Détail affiché sous le libellé d'un objectif (chantier 17.4). */
function objectiveDetail(
  o: Objective,
  universe: Universe,
  colonyCount: number,
): string {
  switch (o.kind) {
    case "colonize_n_systems":
      return i18n.t("empireView.colonizeProgress", {
        count: colonyCount,
        target: o.targetCount ?? "?",
      });
    case "hold_system": {
      const name =
        allSystems(universe).find((s) => s.id === o.targetSystemId)?.name ??
        o.targetSystemId;
      return i18n.t("empireView.holdClaim", { name });
    }
    case "lead_population":
      return i18n.t("empireView.leadPopulation");
    case "lead_influence":
      return i18n.t("empireView.leadInfluence");
    default:
      return "";
  }
}

/** Lieu touché par un événement de monde (galaxie ou faction, selon le genre). */
function worldEventLocation(e: WorldEvent, universe: Universe): string {
  if (e.galaxyId)
    return (
      universe.galaxies.find((g) => g.id === e.galaxyId)?.name ?? e.galaxyId
    );
  if (e.factionId)
    return FACTIONS[e.factionId as FactionId]?.name ?? e.factionId;
  return "";
}

const METRIC_KEYS: Record<MilestoneMetric, string> = {
  population: "empireView.metricPopulation",
  colonies: "empireView.metricColonies",
  explored: "empireView.metricExplored",
  techs: "empireView.metricTechs",
};

export function EmpireView({
  game,
  colonies,
  universe,
  exploredSystemIds,
  leaderboard,
  factionStates,
  contracts,
  proposals,
  objectives,
  worldEvents,
  pirateLairs,
  playerId,
  effects,
  now,
  send,
}: Props) {
  const { t } = useTranslation();
  const metrics: Record<MilestoneMetric, number> = {
    population: Math.floor(colonies.reduce((s, c) => s + c.population, 0)),
    colonies: colonies.length,
    explored: exploredSystemIds.length,
    techs: game.researched.length,
  };

  return (
    <>
      <Panel title={t("empireView.overview")}>
        <div className="resource-bar">
          {(Object.keys(metrics) as MilestoneMetric[]).map((metric) => (
            <div key={metric} className="resource-cell">
              <span className="resource-name">{t(METRIC_KEYS[metric])}</span>
              <span className="resource-stock">{metrics[metric]}</span>
            </div>
          ))}
          <div className="resource-cell">
            <span className="resource-name">{t("empireView.universe")}</span>
            <span className="resource-stock">
              {t("empireView.universeStats", {
                galaxies: universe.galaxies.length,
                systems: allSystems(universe).length,
              })}
            </span>
          </div>
          <div className="resource-cell">
            <span className="resource-name">{t("empireView.influence")}</span>
            <span className="resource-stock">
              ✦ {Math.floor(game.influence)}
            </span>
            <span className="resource-rate ok">
              {t("empireView.perTick", {
                sign:
                  influencePerTick(
                    colonies,
                    game.claimedSystemIds.length,
                    effects.influenceMult,
                  ) >= 0
                    ? "+"
                    : "",
                value:
                  Math.round(
                    influencePerTick(
                      colonies,
                      game.claimedSystemIds.length,
                      effects.influenceMult,
                    ) * 1000,
                  ) / 1000,
              })}
            </span>
          </div>
          <div className="resource-cell">
            <span className="resource-name">
              {t("empireView.claimedSystems")}
            </span>
            <span className="resource-stock">
              {game.claimedSystemIds.length}
            </span>
            <span className="resource-rate muted">
              {game.claimedSystemIds
                .map(
                  (id) =>
                    allSystems(universe).find((s) => s.id === id)?.name ?? id,
                )
                .join(", ") || t("empireView.none")}
            </span>
          </div>
        </div>
      </Panel>

      <Panel title={t("empireView.worldFeed")}>
        <ul className="milestone-list">
          {objectives
            .filter((o) => o.status === "open")
            .map((o) => (
              <li key={o.id} className="milestone">
                <div className="queue-head">
                  <span>🎯 {objectiveKindLabel(o.kind)}</span>
                  <span className="muted small">
                    {formatDuration(o.deadline - now)}
                  </span>
                </div>
                <span className="small muted">
                  {objectiveDetail(o, universe, colonies.length)}
                  {t("empireView.reward", { reward: o.reward })}
                </span>
              </li>
            ))}
          {worldEvents.map((e) => (
            <li key={e.id} className="milestone">
              <div className="queue-head">
                <span className={worldEventLabel(e.kind).tone}>
                  {worldEventLabel(e.kind).icon} {worldEventLabel(e.kind).name}
                  {" — "}
                  {worldEventLocation(e, universe)}
                </span>
                <span className="muted small">
                  {formatDuration(e.expiresAt - now)}
                </span>
              </div>
            </li>
          ))}
          {pirateLairs
            .filter((l) => l.bounty > 0)
            .map((l) => (
              <li key={l.id} className="milestone">
                <div className="queue-head">
                  <span>
                    {t("empireView.pirateLairEntry", {
                      system:
                        allSystems(universe).find((s) => s.id === l.systemId)
                          ?.name ?? l.systemId,
                    })}
                  </span>
                  <span className="muted small">
                    {t("empireView.bounty", { bounty: l.bounty })}
                  </span>
                </div>
              </li>
            ))}
          {objectives.filter((o) => o.status === "open").length === 0 &&
            worldEvents.length === 0 &&
            pirateLairs.filter((l) => l.bounty > 0).length === 0 && (
              <li className="small muted">{t("empireView.allQuiet")}</li>
            )}
        </ul>
      </Panel>

      {leaderboard.length > 1 && (
        <Panel title={t("empireView.empireRanking")}>
          <ul className="milestone-list">
            {leaderboard.map((e, i) => {
              // Une proposition en cours (émise ou reçue) prime sur les boutons de relation :
              // il faut d'abord y répondre / l'annuler avant de proposer autre chose.
              const incoming = proposals.find(
                (p) => p.fromEmpireId === e.id && p.toEmpireId === playerId,
              );
              const outgoing = proposals.find(
                (p) => p.fromEmpireId === playerId && p.toEmpireId === e.id,
              );
              return (
                <li
                  key={e.id}
                  className={`milestone ${e.id === playerId ? "reached" : ""}`}
                >
                  <div className="queue-head">
                    <span>
                      <span style={{ color: e.color }}>◆</span> #{i + 1}{" "}
                      {e.name}
                      {/* Le sigle de corporation est PUBLIC comme un nom d'empire
                          (ADR 0009) : sans lui ici, une corporation n'existerait que
                          pour les siens et ne pèserait sur aucune décision de tiers. */}
                      {e.corporationTag && (
                        <span className="muted" title={e.corporationName}>
                          {" "}
                          [{e.corporationTag}]
                        </span>
                      )}
                      {e.id === playerId
                        ? t("empireView.you")
                        : relationBadge(e.relation)}
                    </span>
                    <span className="muted small">
                      {t("empireView.score", { value: e.score })}
                    </span>
                  </div>
                  <span className="small muted">
                    {t("empireView.colonyCount", { count: e.colonies })}
                    {t("empireView.systemCount", { count: e.claimed })}
                    {t("empireView.scoreLine", {
                      influence: e.influence,
                      population: e.population,
                    })}
                  </span>
                  {e.id !== playerId && (
                    <div className="route-actions">
                      {incoming ? (
                        <>
                          <span className="small muted">
                            {incoming.kind === "nap"
                              ? t("empireView.proposesPact")
                              : t("empireView.proposesAlliance")}
                          </span>
                          <Button
                            size="sm"
                            onClick={() =>
                              send({
                                type: "respondRelation",
                                proposalId: incoming.id,
                                accept: true,
                              })
                            }
                          >
                            {t("empireView.accept")}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() =>
                              send({
                                type: "respondRelation",
                                proposalId: incoming.id,
                                accept: false,
                              })
                            }
                          >
                            {t("empireView.decline")}
                          </Button>
                        </>
                      ) : outgoing ? (
                        <>
                          <span className="small muted">
                            {outgoing.kind === "nap"
                              ? t("empireView.proposalSentPact")
                              : t("empireView.proposalSentAlliance")}
                          </span>
                          <Button
                            size="sm"
                            onClick={() =>
                              send({
                                type: "cancelProposal",
                                proposalId: outgoing.id,
                              })
                            }
                          >
                            {t("empireView.cancel")}
                          </Button>
                        </>
                      ) : e.relation === "war" ? (
                        <Button
                          size="sm"
                          onClick={() =>
                            send({ type: "makePeace", targetEmpireId: e.id })
                          }
                        >
                          {t("empireView.makePeace")}
                        </Button>
                      ) : e.relation === "alliance" || e.relation === "nap" ? (
                        <Button
                          size="sm"
                          onClick={() =>
                            send({
                              type: "breakRelation",
                              targetEmpireId: e.id,
                            })
                          }
                        >
                          {e.relation === "alliance"
                            ? t("empireView.breakAlliance")
                            : t("empireView.breakPact")}
                        </Button>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            onClick={() =>
                              send({ type: "declareWar", targetEmpireId: e.id })
                            }
                          >
                            {t("empireView.declareWar")}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() =>
                              send({
                                type: "proposeRelation",
                                targetEmpireId: e.id,
                                kind: "nap",
                              })
                            }
                          >
                            {t("empireView.proposePact")}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() =>
                              send({
                                type: "proposeRelation",
                                targetEmpireId: e.id,
                                kind: "alliance",
                              })
                            }
                          >
                            {t("empireView.proposeAlliance")}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <Panel title={t("empireView.factions")}>
        <ul className="milestone-list">
          {FACTION_IDS.map((factionId) => {
            const rep = game.factionRep[factionId] ?? 0;
            const nextTier = [...REP_TIERS].reverse().find((t) => rep < t.min);
            const progress = nextTier ? Math.min(1, rep / nextTier.min) : 1;
            const state = factionStates.find((s) => s.factionId === factionId);
            const mood = factionMoodLabel(state?.mood ?? "neutral");
            const openContract = contracts.find(
              (c) => c.issuerId === factionId && c.status === "open",
            );
            return (
              <li
                key={factionId}
                className={`milestone ${!nextTier ? "reached" : ""}`}
              >
                <div className="queue-head">
                  <span>
                    {FACTIONS[factionId].name} — {repTierName(rep)}
                  </span>
                  <span className="muted small">
                    {Math.floor(rep)}
                    {nextTier ? `/${nextTier.min}` : t("empireView.maxSuffix")}
                  </span>
                </div>
                <ProgressBar
                  value={progress * 100}
                  max={100}
                  status={!nextTier ? "ok" : "default"}
                />
                <span className={`small ${mood.tone}`}>{mood.name}</span>
                {openContract && (
                  <span className="small muted">
                    {t("empireView.contractDemand", {
                      remaining: openContract.remaining,
                      resource: resourceLabel(openContract.resource),
                      price: openContract.pricePerUnit,
                    })}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title={t("empireView.milestones")}>
        <ul className="milestone-list">
          {MILESTONES.map((m) => {
            const value = metrics[m.metric];
            const reached = value >= m.threshold;
            const progress = Math.min(1, value / m.threshold);
            return (
              <li
                key={m.id}
                className={`milestone ${reached ? "reached" : ""}`}
              >
                <div className="queue-head">
                  <span>
                    {reached ? "✓ " : ""}
                    {t("empireView.milestoneLine", {
                      metric: t(METRIC_KEYS[m.metric]),
                      threshold: m.threshold,
                    })}
                  </span>
                  <span className="muted small">
                    {Math.min(value, m.threshold)}/{m.threshold}
                  </span>
                </div>
                <ProgressBar
                  value={progress * 100}
                  max={100}
                  status={reached ? "ok" : "default"}
                />
              </li>
            );
          })}
        </ul>
      </Panel>
    </>
  );
}
